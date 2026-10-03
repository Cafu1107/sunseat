import { t, setLang, getLang, applyI18n, locale } from './i18n.js';
import { CARS, carById } from './cars.js';
import { fetchRoute, sampleRoute, searchPlaces, reversePlace, haversine } from './route.js';
import { fetchWeather } from './weather.js';
import { simulate, findGlare, findTwilight, armIndex, sweatLiters, departureScan, seatFamily, sunSide } from './sim.js';
import { heat, refreshHeatBase, silhouetteSVG, buildCarView, drawStrip, familyCarSVG, escapeHtml } from './render.js';
import { makeShareCard } from './share.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* gizli sekme */ } },
};
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SITE = 'cafu1107.github.io/sunseat';

const state = {
  from: null,
  to: null,
  carId: carById(store.get('sunseat.car') || 'egea').id,
  tint: 0,
  roofOpen: true,
  route: null, routeKey: '', samples: null,
  weather: null, weatherKey: '',
  depart: null,
  sim: null, scan: null,
  mySeat: Number(store.get('sunseat.seat')) || 0,
  idx: 0,
  family: null,
  factIdx: Math.floor(Math.random() * 7),
  playing: false,
};

let map, tileLayer, casing, heatLayer, markerA, markerB, carMarker, carView;
let runToken = 0;

// ---------- Biçimlendirme ----------
const fmtTime = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const fmtDate = (ms) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'long', weekday: 'short' });
function fmtDur(sec) {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60), mm = m % 60;
  return h ? `${h} ${t('dur.h')} ${mm} ${t('dur.m')}` : `${mm} ${t('dur.m')}`;
}
const fmtKm = (m) => (m >= 100000 ? Math.round(m / 1000) : (m / 1000).toFixed(1)) + ' km';
const pad = (n) => String(n).padStart(2, '0');
const seatName = (i, mid = false) => {
  const s = t('seat.' + state.sim.seatKeys[i]);
  return mid ? s.toLocaleLowerCase(locale()) : s;
};
const compass = (deg) => t('compass')[Math.round(deg / 45) % 8];

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- Tema ----------
function isDark() {
  const th = document.documentElement.dataset.theme;
  return th ? th === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function applyTheme() {
  $('themeToggle').classList.toggle('is-dark', isDark());
  refreshHeatBase();
  if (map) setTiles();
  if (state.sim) { drawStrips(); paintRoute(); setScrub(state.idx); renderFamilyResult(); }
}
// OSM karoları. Koyu mod, karo katmanına CSS filtresiyle yapılır (rota katmanı etkilenmez).
function setTiles() {
  $('map').classList.toggle('map-dark', isDark());
  if (tileLayer) return;
  tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
}

// ---------- Harita ----------
function initMap() {
  map = L.map('map', { zoomControl: true, scrollWheelZoom: false, worldCopyJump: true }).setView([40.2, 31.5], 6);
  setTiles();
  map.on('focus', () => map.scrollWheelZoom.enable());
  map.on('blur', () => map.scrollWheelZoom.disable());
  map.on('click', onMapClick);
}

const pinIcon = (letter, cls) => L.divIcon({ className: '', html: `<div class="mk-pin ${cls}">${letter}</div>`, iconSize: [30, 30], iconAnchor: [3, 30] });

function placeMarkers() {
  const upd = (which, marker, letter, cls) => {
    const p = state[which];
    if (!p) { if (marker) map.removeLayer(marker); return null; }
    if (marker) { marker.setLatLng([p.lat, p.lng]); return marker; }
    const m = L.marker([p.lat, p.lng], { icon: pinIcon(letter, cls), draggable: true, keyboard: false }).addTo(map);
    m.on('dragend', async () => {
      const ll = m.getLatLng();
      const name = await reversePlace(ll.lat, ll.lng, getLang());
      state[which] = { name, lat: ll.lat, lng: ll.lng };
      $(which).value = name;
      if (state.sim) run();
    });
    return m;
  };
  markerA = upd('from', markerA, 'A', 'mk-a');
  markerB = upd('to', markerB, 'B', 'mk-b');
  if (!state.sim) {
    if (state.from && state.to) map.fitBounds([[state.from.lat, state.from.lng], [state.to.lat, state.to.lng]], { padding: [60, 60], maxZoom: 11 });
    else if (state.from || state.to) { const p = state.from || state.to; map.setView([p.lat, p.lng], Math.max(map.getZoom(), 8)); }
  }
}

async function onMapClick(e) {
  const which = !state.from ? 'from' : 'to';
  const { lat, lng } = e.latlng;
  state[which] = { name: `${lat.toFixed(3)}, ${lng.toFixed(3)}`, lat, lng };
  $(which).value = state[which].name;
  placeMarkers();
  const name = await reversePlace(lat, lng, getLang());
  if (state[which] && state[which].lat === lat) {
    state[which].name = name;
    $(which).value = name;
  }
  toast(t(which === 'from' ? 'map.pickFrom' : 'map.pickTo', { name }));
}

function carIcon() {
  return L.divIcon({
    className: '',
    iconSize: [64, 64], iconAnchor: [32, 32],
    html: `<div class="car-marker"><div class="cm-sun"><i></i></div><div class="cm-car">
      <svg viewBox="0 0 24 38"><rect x="2" y="1" width="20" height="36" rx="7" fill="#15181b" stroke="#fff" stroke-width="2"/>
      <rect x="5" y="8" width="14" height="6" rx="2" fill="#f5b800"/><rect x="5" y="27" width="14" height="4" rx="1.5" fill="#9aa3ab"/></svg></div></div>`,
  });
}

function drawRouteOnMap(fit) {
  if (casing) map.removeLayer(casing);
  casing = L.polyline(state.route.coords, { color: isDark() ? '#000' : '#2b3035', weight: 11, opacity: 0.85, interactive: false }).addTo(map);
  paintRoute();
  if (!carMarker) carMarker = L.marker(state.route.coords[0], { icon: carIcon(), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
  if (markerA) markerA.setZIndexOffset(500);
  if (markerB) markerB.setZIndexOffset(500);
  if (fit) map.fitBounds(casing.getBounds(), { padding: [40, 40] });
}

function paintRoute() {
  if (!state.sim || !casing) return;
  casing.setStyle({ color: isDark() ? '#000' : '#2b3035' });
  if (heatLayer) map.removeLayer(heatLayer);
  heatLayer = L.layerGroup();
  const pts = state.sim.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = L.polyline([[pts[i].lat, pts[i].lng], [pts[i + 1].lat, pts[i + 1].lng]], {
      color: heat(pts[i].seats[state.mySeat] || 0), weight: 6, opacity: 1, lineCap: 'round',
    });
    seg.on('mouseover click', () => { stopPlay(); setScrub(i); });
    heatLayer.addLayer(seg);
  }
  heatLayer.addTo(map);
  $('legendSeat').textContent = seatName(state.mySeat);
  $('mapLegend').hidden = false;
}

// ---------- Form: hazır rotalar, arabalar ----------
function renderPresets() {
  const box = $('presets');
  box.innerHTML = '';
  t('presets').forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = p.label;
    b.addEventListener('click', () => {
      state.from = { ...p.from };
      state.to = { ...p.to };
      $('from').value = p.from.name;
      $('to').value = p.to.name;
      placeMarkers();
      run();
    });
    box.appendChild(b);
  });
}

function renderCars() {
  const rail = $('carRail');
  rail.innerHTML = '';
  CARS.forEach((c) => {
    const lab = document.createElement('label');
    lab.className = 'car-card';
    lab.innerHTML = `<input type="radio" name="car" value="${c.id}" ${c.id === state.carId ? 'checked' : ''}>
      ${silhouetteSVG(c)}<b>${c.name}</b><small>${c.tag[getLang()]}</small>
      ${c.legend ? `<span class="badge">${getLang() === 'tr' ? 'EFSANE' : 'LEGEND'}</span>` : ''}`;
    lab.querySelector('input').addEventListener('change', () => selectCar(c.id));
    rail.appendChild(lab);
  });
  const sel = rail.querySelector('input:checked');
  // Sadece rayı yatay kaydır; scrollIntoView paneli dikeyde de kaydırıyordu.
  if (sel) requestAnimationFrame(() => { rail.scrollLeft = sel.closest('.car-card').offsetLeft - rail.offsetLeft - 2; });
  updateCarUI();
}

function updateCarUI() {
  const car = carById(state.carId);
  $('carNote').textContent = car.note[getLang()];
  const sw = $('roofSwitch');
  if (car.roof === 'pano' || car.roof === 'soft') {
    sw.hidden = false;
    $('roofLabel').textContent = t(car.roof === 'pano' ? 'roof.pano' : 'roof.soft');
    $('roofOpen').checked = state.roofOpen;
  } else sw.hidden = true;
  if (!$('goBtn').classList.contains('loading')) $('goLabel').textContent = t(car.ac ? 'form.go' : 'form.goChoke');
}

function selectCar(id) {
  state.carId = id;
  store.set('sunseat.car', id);
  updateCarUI();
  if (state.sim) { recompute(); updateHash(); }
}

// ---------- Otomatik tamamlama ----------
function setupAutocomplete(which) {
  const input = $(which), list = $(which + 'Suggest');
  let timer, ctrl, items = [], active = -1;

  const close = () => { list.innerHTML = ''; items = []; active = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  const choose = (i) => {
    const p = items[i];
    if (!p) return;
    state[which] = { name: p.name, lat: p.lat, lng: p.lng };
    input.value = p.detail ? `${p.name}, ${p.detail.split(',')[0]}` : p.name;
    close();
    placeMarkers();
  };
  const paint = () => {
    list.innerHTML = '';
    items.forEach((p, i) => {
      const li = document.createElement('li');
      li.id = `${which}-opt-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', i === active ? 'true' : 'false');
      li.innerHTML = `<b>${escapeHtml(p.name)}</b>${p.detail ? `<small>${escapeHtml(p.detail)}</small>` : ''}`;
      li.addEventListener('mousedown', (ev) => { ev.preventDefault(); choose(i); });
      list.appendChild(li);
    });
    input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
    if (active >= 0) input.setAttribute('aria-activedescendant', `${which}-opt-${active}`);
  };

  input.addEventListener('input', () => {
    state[which] = null;
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }
    timer = setTimeout(async () => {
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      try {
        items = await searchPlaces(q, getLang(), ctrl.signal);
        active = items.length ? 0 : -1;
        paint();
      } catch (e) { if (e.name !== 'AbortError') close(); }
    }, 260);
  });
  input.addEventListener('keydown', (e) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active < 0 ? 0 : active); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
}

async function resolvePlace(which) {
  if (state[which]) return state[which];
  const q = $(which).value.trim();
  if (!q) return null;
  const res = await searchPlaces(q, getLang());
  if (!res.length) throw Object.assign(new Error('nf'), { code: 'notFound', q });
  state[which] = { name: res[0].name, lat: res[0].lat, lng: res[0].lng };
  placeMarkers();
  return state[which];
}

// ---------- Hesap ----------
function showError(msg) { const el = $('formError'); el.textContent = msg; el.hidden = false; }
function hideError() { $('formError').hidden = true; }

function setLoading(on, key) {
  $('mapLoading').hidden = !on;
  if (key) $('loadingText').textContent = t(key);
  const btn = $('goBtn');
  if (on) {
    btn.classList.add('loading');
    $('goLabel').textContent = t('form.going');
  } else {
    btn.classList.remove('loading', 'turning', 'choke');
    $('goLabel').textContent = t(carById(state.carId).ac ? 'form.go' : 'form.goChoke');
  }
}

function crank() {
  const btn = $('goBtn');
  const car = carById(state.carId);
  btn.classList.remove('turning', 'choke');
  void btn.offsetWidth;
  if (!car.ac && !reduceMotion()) {
    btn.classList.add('choke');
    setTimeout(() => btn.classList.add('turning'), 700);
  } else btn.classList.add('turning');
}

async function ensureWeather(depart) {
  const start = depart - 4 * 36e5;
  const end = depart + state.route.duration * 1000 + 4 * 36e5;
  const key = `${state.routeKey}|${new Date(start).toISOString().slice(0, 10)}|${new Date(end).toISOString().slice(0, 10)}`;
  if (key === state.weatherKey) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    state.weather = await fetchWeather(state.route, start, end, ctrl.signal);
  } catch (e) {
    state.weather = null;
  } finally { clearTimeout(timer); }
  state.weatherKey = key;
}

async function run() {
  hideError();
  stopPlay();
  const token = ++runToken;
  const dateV = $('date').value, timeV = $('time').value;
  if (!dateV || !timeV) { showError(t('err.date')); return; }

  crank();
  setLoading(true, 'map.loading');
  try {
    const from = await resolvePlace('from');
    const to = await resolvePlace('to');
    if (!from || !to) { showError(t('err.places')); return; }
    if (haversine([from.lat, from.lng], [to.lat, to.lng]) < 300) { showError(t('err.same')); return; }

    const key = `${from.lat.toFixed(5)},${from.lng.toFixed(5)};${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
    const newRoute = key !== state.routeKey;
    if (newRoute) {
      const route = await fetchRoute(from, to);
      if (token !== runToken) return;
      state.route = route;
      state.samples = sampleRoute(route);
      state.routeKey = key;
      state.weatherKey = '';
      state.idx = 0;
    }
    const depart = new Date(`${dateV}T${timeV}`).getTime();
    $('loadingText').textContent = t('map.loadingWx');
    await ensureWeather(depart);
    if (token !== runToken) return;
    $('loadingText').textContent = t('map.loadingSun');
    state.depart = depart;
    compute();
    renderAll(true);
    drawRouteOnMap(newRoute);
    setScrub(Math.min(state.idx, state.sim.points.length - 1));
    updateHash();
    if (window.innerWidth < 980 && newRoute) {
      document.querySelector('.map-wrap').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  } catch (e) {
    if (token !== runToken) return;
    if (e.code === 'notFound') showError(t('err.notFound', { q: e.q }));
    else if (e.code === 'busy') showError(t('err.busy'));
    else if (e.code === 'noroute' || e.code === 'route') showError(t('err.noroute'));
    else { console.error(e); showError(t('err.net')); }
  } finally {
    if (token === runToken) setLoading(false);
  }
}

function compute() {
  const car = carById(state.carId);
  const opts = { tint: state.tint, roofOpen: state.roofOpen };
  state.sim = simulate({ samples: state.samples, depart: state.depart, car, opts, weather: state.weather });
  state.mySeat = Math.min(state.mySeat, state.sim.seatKeys.length - 1);
  state.scan = departureScan({ samples: state.samples, depart: state.depart, car, opts, weather: state.weather, seat: state.mySeat });
}

let recomputeTimer;
function recompute() {
  clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(() => {
    if (!state.sim) return;
    compute();
    renderAll(false);
    paintRoute();
    setScrub(Math.min(state.idx, state.sim.points.length - 1));
  }, 60);
}

// ---------- Sonuçlar ----------
function renderAll(animate) {
  $('empty').hidden = true;
  const res = $('results');
  res.hidden = false;
  if (animate) {
    res.classList.remove('show');
    void res.offsetWidth;
    res.classList.add('show');
    res.querySelectorAll('.reveal').forEach((el, i) => el.style.setProperty('--i', i));
  }
  const car = carById(state.carId);
  carView = buildCarView($('carSvg'), car, state.sim.seatKeys.map((k) => t('seat.short.' + k)), [0, 2, 4, 6].map((i) => t('compass')[i]));
  carView.seats.forEach((s, i) => s.g.addEventListener('click', () => selectSeat(i)));
  renderVerdict();
  renderMeta();
  renderStrips();
  renderBest();
  renderGlare();
  renderArm();
  renderFamily();
  renderSweat();
  renderFact();
  const sc = $('scrub');
  sc.max = String(state.sim.points.length - 1);
}

function seatStats() {
  const { dose } = state.sim;
  const totalMin = state.route.duration / 60;
  let lo = 0, hi = 0;
  dose.forEach((d, i) => { if (d < dose[lo]) lo = i; if (d > dose[hi]) hi = i; });
  return { dose, totalMin, lo, hi };
}

function renderVerdict() {
  const { dose, totalMin, lo, hi } = seatStats();
  const pts = state.sim.points;
  const car = carById(state.carId);
  const daylight = pts.some((p) => p.sunAlt > 0);
  let title, sub;
  const en = getLang() === 'en';
  if (!daylight) { title = escapeHtml(t('verdict.nightTitle')); sub = t('verdict.nightSub'); }
  else if (car.roof === 'soft' && state.roofOpen) {
    title = escapeHtml(t('verdict.roofless'));
    sub = t('verdict.hot', { seat: seatName(hi, en), min: Math.round(dose[hi]) });
  } else if (dose[hi] < Math.max(3, totalMin * 0.04)) {
    title = escapeHtml(t('verdict.lowTitle'));
    sub = t('verdict.lowSub', { seat: seatName(lo, true) });
  } else if (dose[hi] - dose[lo] < Math.max(2, dose[hi] * 0.15)) {
    title = escapeHtml(t('verdict.even'));
    sub = t('verdict.hot', { seat: seatName(hi, en), min: Math.round(dose[hi]) });
  } else {
    title = t('verdict.best', { seat: escapeHtml(seatName(lo, en)) });
    sub = t('verdict.hot', { seat: seatName(hi, en), min: Math.round(dose[hi]) });
  }
  if (state.route.duration > 4 * 3600) sub += ' ' + t('verdict.long');
  $('verdictTitle').innerHTML = title;
  $('verdictSub').textContent = sub;
  state.verdictPlain = $('verdictTitle').textContent;
}

function renderMeta() {
  const pts = state.sim.points;
  const arrive = state.depart + state.route.duration * 1000;
  const sameDay = new Date(arrive).toDateString() === new Date(state.depart).toDateString();
  const clouds = pts.filter((p) => p.cloud != null);
  const sky = clouds.length
    ? t('meta.cloudy', { n: Math.round(clouds.reduce((a, p) => a + p.cloud, 0) / clouds.length * 100) })
    : t('meta.clear');
  const rows = [
    [t('meta.distance'), fmtKm(state.route.distance)],
    [t('meta.duration'), fmtDur(state.route.duration)],
    [t('meta.arrive'), fmtTime(arrive) + (sameDay ? '' : ' +1')],
    [t('meta.weather'), sky],
  ];
  $('tripMeta').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
}

function renderStrips() {
  const box = $('strips');
  box.innerHTML = '';
  const { dose } = state.sim;
  state.sim.seatKeys.forEach((k, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'strip';
    b.setAttribute('aria-pressed', i === state.mySeat ? 'true' : 'false');
    b.innerHTML = `<span class="strip-name"><i class="ph-fill ph-seat"></i>${t('seat.' + k)}</span>
      <canvas aria-hidden="true"></canvas>
      <span class="strip-dose">${Math.round(dose[i])}<small>${t('tl.minutes')}</small></span>`;
    b.addEventListener('click', () => selectSeat(i));
    box.appendChild(b);
  });
  const axis = document.createElement('div');
  axis.className = 'strip-axis';
  axis.innerHTML = '<span></span><div class="axis-track"></div><span></span>';
  box.appendChild(axis);
  const cursor = document.createElement('div');
  cursor.className = 'strip-cursor';
  cursor.id = 'stripCursor';
  box.appendChild(cursor);
  requestAnimationFrame(drawStrips);
}

function drawStrips() {
  if (!state.sim) return;
  const pts = state.sim.points;
  document.querySelectorAll('#strips .strip canvas').forEach((c, i) => drawStrip(c, pts, i));
  const track = document.querySelector('#strips .axis-track');
  if (track) {
    const total = state.route.duration * 1000;
    const stepMin = total > 6 * 36e5 ? 120 : total > 2.5 * 36e5 ? 60 : total > 70 * 6e4 ? 30 : 15;
    const start = state.depart;
    const first = Math.ceil(start / (stepMin * 6e4)) * stepMin * 6e4;
    let html = '';
    for (let ms = first; ms <= start + total; ms += stepMin * 6e4) {
      const f = (ms - start) / total;
      if (f < 0.04 || f > 0.96) continue;
      html += `<span style="left:${(f * 100).toFixed(2)}%">${fmtTime(ms)}</span>`;
    }
    track.innerHTML = html;
  }
  positionCursor();
}

function positionCursor() {
  const cur = $('stripCursor');
  const canvas = document.querySelector('#strips .strip canvas');
  if (!cur || !canvas || !state.sim) return;
  const pts = state.sim.points;
  const f = pts[state.idx].t / (pts[pts.length - 1].t || 1);
  const strips = $('strips').getBoundingClientRect();
  const cr = canvas.getBoundingClientRect();
  cur.style.left = `${cr.left - strips.left + f * cr.width}px`;
}

function selectSeat(i) {
  if (!state.sim) return;
  state.mySeat = i;
  store.set('sunseat.seat', String(i));
  document.querySelectorAll('#strips .strip').forEach((b, k) => b.setAttribute('aria-pressed', k === i ? 'true' : 'false'));
  const car = carById(state.carId);
  state.scan = departureScan({ samples: state.samples, depart: state.depart, car, opts: { tint: state.tint, roofOpen: state.roofOpen }, weather: state.weather, seat: i });
  renderBest();
  paintRoute();
  setScrub(state.idx);
  updateHash();
}

function setScrub(i) {
  if (!state.sim) return;
  const pts = state.sim.points;
  i = Math.max(0, Math.min(pts.length - 1, i | 0));
  state.idx = i;
  const p = pts[i];
  $('scrub').value = String(i);
  $('scrubTime').textContent = fmtTime(p.ms);
  if (carView) carView.update(p, state.mySeat, t('car.front'));

  const side = sunSide(p.rel, p.sunAlt);
  const ro = [
    [t('ro.time'), fmtTime(p.ms)],
    [t('ro.km'), `${Math.round(p.dist / 1000)} / ${Math.round(state.route.distance / 1000)} km`],
    [t('ro.heading'), `${compass(p.heading)} ${Math.round(p.heading)}°`],
    [t('ro.sun'), t('side.' + side)],
    [t('ro.alt'), `${Math.round(p.sunAlt)}°`],
    [t('ro.cloud'), p.cloud == null ? '-' : `%${Math.round(p.cloud * 100)}`],
  ];
  if (getLang() === 'en' && p.cloud != null) ro[5][1] = `${Math.round(p.cloud * 100)}%`;
  $('readout').innerHTML = ro.map(([k, v]) => `<div><span>${k}</span><b>${escapeHtml(v)}</b></div>`).join('');
  positionCursor();

  if (carMarker) {
    carMarker.setLatLng([p.lat, p.lng]);
    const el = carMarker.getElement();
    if (el) {
      el.querySelector('.cm-car').style.transform = `rotate(${p.heading}deg)`;
      const s = el.querySelector('.cm-sun');
      s.style.transform = `rotate(${p.sunAz}deg)`;
      s.classList.toggle('night', p.sunAlt <= 0);
    }
  }
}

// Oynat: arabayı yol boyunca ~9 saniyede sürer.
let playRaf;
function togglePlay() {
  if (state.playing) { stopPlay(); return; }
  if (!state.sim) return;
  const pts = state.sim.points;
  if (state.idx >= pts.length - 1) setScrub(0);
  state.playing = true;
  $('playBtn').innerHTML = '<i class="ph-fill ph-pause"></i>';
  $('playBtn').setAttribute('aria-label', t('tl.pause'));
  const startIdx = state.idx, startT = performance.now(), dur = 9000 * (1 - startIdx / pts.length);
  const step = (now) => {
    const f = Math.min(1, (now - startT) / dur);
    setScrub(startIdx + (pts.length - 1 - startIdx) * f);
    if (f < 1 && state.playing) playRaf = requestAnimationFrame(step);
    else stopPlay();
  };
  playRaf = requestAnimationFrame(step);
}
function stopPlay() {
  state.playing = false;
  cancelAnimationFrame(playRaf);
  $('playBtn').innerHTML = '<i class="ph-fill ph-play"></i>';
  $('playBtn').setAttribute('aria-label', t('tl.play'));
}

function renderBest() {
  const scan = state.scan;
  const now = scan.find((s) => s.off === 0);
  let best = now;
  scan.forEach((s) => {
    if (s.dose < best.dose - 0.5 || (Math.abs(s.dose - best.dose) <= 0.5 && Math.abs(s.off) < Math.abs(best.off) && s.dose <= best.dose)) best = s;
  });
  const max = Math.max(...scan.map((s) => s.dose), 0.001);
  const chart = $('bestChart');
  chart.innerHTML = '';
  scan.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bar' + (s.off === 0 ? ' is-now' : '') + (s === best && s.off !== 0 ? ' is-best' : '');
    b.style.setProperty('--b', i);
    b.style.setProperty('--h', `${Math.max(3, s.dose / max * 100)}%`);
    b.setAttribute('aria-label', `${fmtTime(s.ms)}: ${Math.round(s.dose)} ${t('tl.minutes')}`);
    b.innerHTML = `<i style="height:${Math.max(3, s.dose / max * 100)}%"></i><span>${fmtTime(s.ms)} · ${Math.round(s.dose)}</span>`;
    b.addEventListener('click', () => {
      const d = new Date(s.ms);
      $('date').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      $('time').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      run();
    });
    chart.appendChild(b);
  });
  let axis = chart.nextElementSibling;
  if (!axis || !axis.classList.contains('best-axis')) {
    axis = document.createElement('div');
    axis.className = 'best-axis';
    chart.after(axis);
  }
  axis.innerHTML = `<span>${fmtTime(scan[0].ms)}</span><span>${fmtTime(now.ms)}</span><span>${fmtTime(scan[scan.length - 1].ms)}</span>`;

  const seat = seatName(state.mySeat, true);
  let html;
  if (now.dose < 1.5 && best.dose < 1.5) html = escapeHtml(t('best.none', { seat }));
  else if (best === now) html = escapeHtml(t('best.already', { seat }));
  else html = t('best.better', { time: fmtTime(best.ms), seat: escapeHtml(seat), pct: Math.round((1 - best.dose / now.dose) * 100) });
  $('bestText').innerHTML = html;
}

function renderGlare() {
  const pts = state.sim.points;
  const items = [];
  findGlare(pts).forEach((g) => items.push({
    ms: g.start,
    html: `<li><i class="ph ${g.kind === 'front' ? 'ph-sun' : 'ph-sun-dim'}"></i>
      <b>${fmtTime(g.start)} - ${fmtTime(g.end)}</b>
      <span>${escapeHtml(t('glare.' + g.kind))} ${escapeHtml(t('glare.km', { km: Math.round(g.km), min: Math.round(g.minutes) }))}</span></li>`,
  }));
  findTwilight(pts).forEach((tw) => items.push({
    ms: tw.ms,
    html: `<li class="ok"><i class="ph ph-sun-horizon"></i><b>${fmtTime(tw.ms)}</b><span>${escapeHtml(t('glare.' + tw.kind))}</span></li>`,
  }));
  items.sort((a, b) => a.ms - b.ms);
  $('glareList').innerHTML = items.length
    ? items.slice(0, 5).map((x) => x.html).join('')
    : `<li class="ok none"><i class="ph ph-eye"></i><b>${escapeHtml(t('glare.none'))}</b><span></span></li>`;
}

function countUp(el, to, decimals) {
  if (reduceMotion()) { el.textContent = to.toFixed(decimals); return; }
  const start = performance.now(), dur = 900;
  const step = (now) => {
    const f = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - f, 3);
    el.textContent = (to * e).toFixed(decimals);
    if (f < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderArm() {
  const car = carById(state.carId);
  const score = armIndex(state.sim.points, car, { roofOpen: state.roofOpen });
  countUp($('armScore'), score, 1);
  const lvl = score < 0.5 ? 0 : score < 2 ? 1 : score < 4.5 ? 2 : score < 7.5 ? 3 : 4;
  $('armLabel').textContent = t('arm.l' + lvl);
  $('armFoot').textContent = t(car.roof === 'soft' && state.roofOpen ? 'arm.footRhd' : 'arm.foot');
}

// ---------- Aile modu ----------
function defaultFamily() {
  const names = t('family.defaults');
  const prefs = ['any', 'shade', 'sun', 'shade', 'any'];
  return names.map((n, i) => ({ name: n, pref: prefs[i] }));
}

function renderFamily() {
  if (!state.family) state.family = defaultFamily();
  const car = carById(state.carId);
  const list = $('familyList');
  list.innerHTML = '';
  const icons = { sun: 'ph-sun', shade: 'ph-cloud', any: 'ph-shuffle' };
  const cycle = { any: 'shade', shade: 'sun', sun: 'any' };
  state.family.slice(0, car.seats).forEach((p, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="role">${t(i === 0 ? 'family.driver' : 'family.rider')}</span>
      <input type="text" maxlength="14" value="${escapeHtml(p.name)}" aria-label="${t('family.name')} ${i + 1}">
      ${i === 0 ? '<span></span>' : `<button type="button" class="pref" data-pref="${p.pref}"><i class="ph ${icons[p.pref]}"></i><span>${t('family.pref.' + p.pref)}</span></button>`}`;
    li.querySelector('input').addEventListener('input', (e) => { p.name = e.target.value; renderFamilyResult(); });
    const btn = li.querySelector('.pref');
    if (btn) btn.addEventListener('click', () => {
      p.pref = cycle[p.pref];
      btn.dataset.pref = p.pref;
      btn.innerHTML = `<i class="ph ${icons[p.pref]}"></i><span>${t('family.pref.' + p.pref)}</span>`;
      renderFamilyResult();
    });
    list.appendChild(li);
  });
  renderFamilyResult();
}

function renderFamilyResult() {
  if (!state.sim || !state.family) return;
  const car = carById(state.carId);
  const { dose, totalMin } = seatStats();
  const people = state.family.slice(0, car.seats).map((p) => ({ ...p, name: p.name.trim() }));
  const assign = seatFamily(people, dose);
  const avg = (i) => (totalMin ? dose[i] / totalMin : 0);
  const withV = assign.map((a, i) => (a && a.name ? { ...a, v: avg(i) } : null));
  const notes = [];
  withV.forEach((a, i) => {
    if (!a) return;
    const vars = { name: escapeHtml(a.name), seat: escapeHtml(seatName(i, true)), pct: Math.round(avg(i) * 100) };
    let key = i === 0 ? 'family.n.driver' : `family.n.${a.pref}`;
    if (i === 3 && a.pref === 'any') key = 'family.n.middle';
    notes.push(`<li>${t(key, vars)}</li>`);
  });
  $('familyResult').innerHTML = familyCarSVG(car, withV, { aria: t('family.title') }) + `<ul class="family-notes">${notes.join('')}</ul>`;
}

function renderSweat() {
  const car = carById(state.carId);
  const show = !car.ac || (car.roof === 'soft' && state.roofOpen);
  $('sweatCard').hidden = !show;
  if (!show) return;
  const { liters, temp } = sweatLiters(state.sim.points, state.route.duration);
  countUp($('sweatL'), liters, 1);
  $('sweatText').textContent = `${t(car.ac ? 'sweat.mx5' : 'sweat.sahin')} ${temp == null ? t('sweat.noTemp') : t('sweat.temp', { t: Math.round(temp) })}`;
}

function renderFact() {
  const facts = t('facts');
  $('factText').textContent = facts[state.factIdx % facts.length];
}

// ---------- Paylaşım ----------
function updateHash() {
  if (!state.from || !state.to) return;
  const enc = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)},${encodeURIComponent(p.name)}`;
  const h = new URLSearchParams();
  h.set('f', enc(state.from));
  h.set('t', enc(state.to));
  h.set('d', `${$('date').value}T${$('time').value}`);
  h.set('c', state.carId);
  if (state.tint) h.set('ti', String(state.tint));
  if (!state.roofOpen) h.set('r', '0');
  if (state.mySeat) h.set('s', String(state.mySeat));
  history.replaceState(null, '', '#' + decodeURIComponent(h.toString()));
}

function readHash() {
  if (!location.hash) return false;
  const h = new URLSearchParams(location.hash.slice(1));
  const dec = (v) => {
    if (!v) return null;
    const [lat, lng, ...name] = v.split(',');
    const p = { lat: Number(lat), lng: Number(lng), name: decodeURIComponent(name.join(',')) || `${lat}, ${lng}` };
    return Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : null;
  };
  const f = dec(h.get('f')), to = dec(h.get('t'));
  const d = h.get('d');
  if (d && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d)) { $('date').value = d.slice(0, 10); $('time').value = d.slice(11); }
  if (h.get('c')) state.carId = carById(h.get('c')).id;
  if (h.get('ti')) state.tint = Math.max(0, Math.min(80, Number(h.get('ti')) || 0));
  if (h.get('r') === '0') state.roofOpen = false;
  if (h.get('s')) state.mySeat = Number(h.get('s')) || 0;
  if (!f || !to) return false;
  state.from = f; state.to = to;
  $('from').value = f.name; $('to').value = to.name;
  return true;
}

async function shareCard() {
  if (!state.sim) return;
  const { dose, totalMin } = seatStats();
  const blob = await makeShareCard({
    question: t('share.cardTitle'),
    title: `${state.from.name.split(',')[0]} → ${state.to.name.split(',')[0]}`,
    sub: `${fmtDate(state.depart)} ${fmtTime(state.depart)}  ${carById(state.carId).name}`,
    seats: state.sim.seatKeys.map((k, i) => ({ name: t('seat.' + k), dose: dose[i], avg: totalMin ? dose[i] / totalMin : 0 })),
    minLabel: t('dur.m'),
    verdict: state.verdictPlain,
    url: SITE,
  });
  if (!blob) return;
  const file = new File([blob], 'sunseat.png', { type: 'image/png' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Sunseat', text: location.href }); return; } catch (e) { /* indirmeye düş */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sunseat.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(t('share.saved'));
}

async function copyLink() {
  try { await navigator.clipboard.writeText(location.href); }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = location.href; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (err) { /* yok */ }
    ta.remove();
  }
  toast(t('share.copied'));
}

// ---------- Dil ----------
function applyLang(l) {
  setLang(l);
  store.set('sunseat.lang', l);
  applyI18n();
  renderPresets();
  renderCars();
  if (state.sim) {
    state.family = state.family && state.family.map((p, i) => {
      const other = l === 'tr' ? ['Me', 'Ece', 'Mert', 'Grandpa', 'Pamuk'] : ['Ben', 'Ece', 'Mert', 'Dede', 'Pamuk'];
      return p.name === other[i] ? { ...p, name: t('family.defaults')[i] } : p;
    });
    renderAll(false);
    paintRoute();
    drawStrips();
    setScrub(state.idx);
  } else if (state.family) state.family = null;
}

// ---------- Başlat ----------
function init() {
  const saved = store.get('sunseat.lang');
  setLang(saved || ((navigator.language || 'tr').toLowerCase().startsWith('tr') ? 'tr' : 'en'));
  applyI18n();
  refreshHeatBase();

  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  $('date').value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  $('time').value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const fromHash = readHash();
  $('tint').value = String(state.tint);
  $('tintOut').textContent = getLang() === 'tr' ? `%${state.tint}` : `${state.tint}%`;

  renderPresets();
  renderCars();
  initMap();
  $('themeToggle').classList.toggle('is-dark', isDark());

  setupAutocomplete('from');
  setupAutocomplete('to');

  $('tripForm').addEventListener('submit', (e) => { e.preventDefault(); run(); });
  $('swapBtn').addEventListener('click', () => {
    const b = $('swapBtn');
    b.classList.toggle('flip');
    [state.from, state.to] = [state.to, state.from];
    [$('from').value, $('to').value] = [$('to').value, $('from').value];
    placeMarkers();
    if (state.sim && state.from && state.to) run();
  });
  $('tint').addEventListener('input', (e) => {
    state.tint = Number(e.target.value);
    $('tintOut').textContent = getLang() === 'tr' ? `%${state.tint}` : `${state.tint}%`;
    recompute();
  });
  $('tint').addEventListener('change', updateHash);
  $('roofOpen').addEventListener('change', (e) => { state.roofOpen = e.target.checked; recompute(); updateHash(); });
  $('date').addEventListener('change', () => { if (state.sim) run(); });
  $('time').addEventListener('change', () => { if (state.sim) run(); });

  $('scrub').addEventListener('input', (e) => { stopPlay(); setScrub(Number(e.target.value)); });
  $('playBtn').addEventListener('click', togglePlay);
  $('factNext').addEventListener('click', () => { state.factIdx++; renderFact(); });
  $('shareBtn').addEventListener('click', shareCard);
  $('copyLink').addEventListener('click', copyLink);

  $('langToggle').addEventListener('click', () => applyLang(getLang() === 'tr' ? 'en' : 'tr'));
  $('themeToggle').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('sunseat.theme', next);
    applyTheme();
    if (next === 'dark') toast(t('egg.night'));
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) applyTheme(); });

  // Logoya 5 kez dokun.
  let taps = 0, tapTimer;
  $('brand').addEventListener('click', (e) => {
    e.preventDefault();
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = 0; }, 1500);
    if (taps >= 5) {
      taps = 0;
      const b = $('brand');
      b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
      toast(t('egg.logo'));
    } else window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
  });

  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { drawStrips(); if (map) map.invalidateSize(); }, 120); });

  if (fromHash) { placeMarkers(); run(); }
}

init();
