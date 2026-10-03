import { t, setLang, getLang, applyI18n, locale } from './i18n.js';
import { CARS, carById, COLORS, colorById, BODY_KEYS, setCustom, CUSTOM_DEFAULT } from './cars.js';
import { fetchRoutes, sampleRoute, searchPlaces, reversePlace, haversine } from './route.js';
import { fetchWeather } from './weather.js';
import { simulate, findGlare, findTwilight, armIndex, sweatLiters, departureScan, seatFamily, sunSide } from './sim.js';
import { heat, refreshHeatBase, silhouetteSVG, buildCarView, drawStrip, familyCarSVG, escapeHtml, skyAt } from './render.js';
import { makeShareCard } from './share.js';
import { parkScan } from './park.js';
import { unlock } from './badges.js';
import { renderCabin, moveCabinMarker, renderTan, renderSeason, renderBadges, renderPark, dirName } from './features.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* gizli sekme */ } },
};
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SITE = 'cafu1107.github.io/sunseat';

function loadCustom() {
  try { return { ...CUSTOM_DEFAULT, ...JSON.parse(store.get('sunseat.custom') || '{}') }; } catch (e) { return { ...CUSTOM_DEFAULT }; }
}

const state = {
  mode: 'trip',
  from: null,
  to: null,
  custom: setCustom(loadCustom()) && loadCustom(),
  carId: carById(store.get('sunseat.car') || 'egea').id,
  colorId: colorById(store.get('sunseat.color') || 'silver').id,
  tint: 0,
  roofOpen: true,
  parkHours: 3,
  park: null,
  routes: [], routeIdx: 0, altDoses: null,
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

const placeText = (p) => (p.detail ? `${p.name}, ${p.detail.split(',')[0]}` : p.name);

// focus: bu noktaya yakınlaş (rota yokken). zoom: yakınlaşma seviyesi.
function placeMarkers(focus, zoom = 15) {
  const upd = (which, marker, letter, cls) => {
    const p = state[which];
    if (!p) { if (marker) map.removeLayer(marker); return null; }
    if (marker) { marker.setLatLng([p.lat, p.lng]); return marker; }
    const m = L.marker([p.lat, p.lng], { icon: pinIcon(letter, cls), draggable: true, keyboard: false, zIndexOffset: 500 }).addTo(map);
    m.on('dragend', () => {
      const ll = m.getLatLng();
      setPoint(which, { lat: ll.lat, lng: ll.lng }, { fly: false });
    });
    return m;
  };
  markerA = upd('from', markerA, 'A', 'mk-a');
  markerB = state.mode === 'park' ? markerB : upd('to', markerB, 'B', 'mk-b');
  if (state.sim) return;
  if (state.from && state.to && !focus) {
    map.fitBounds([[state.from.lat, state.from.lng], [state.to.lat, state.to.lng]], { padding: [60, 60], maxZoom: 13 });
  } else if (focus && state[focus]) {
    const p = state[focus];
    map.flyTo([p.lat, p.lng], zoom, { duration: reduceMotion() ? 0 : 0.8 });
  }
}

// Bir noktayı A ya da B yapar. İsim yoksa adresini sonradan bulur.
let dragTipShown = false;
async function setPoint(which, place, { fly = true, zoom = 15, remember = true, rerun = true } = {}) {
  const p = { name: place.name || `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`, detail: place.detail || '', lat: place.lat, lng: place.lng };
  state[which] = p;
  $(which).value = placeText(p);
  placeMarkers(fly ? which : null, zoom);
  if (!dragTipShown && !state.sim) {
    dragTipShown = true;
    setTimeout(() => toast(t('pick.dragTip')), 900);
  }
  if (!place.name) {
    const r = await reversePlace(p.lat, p.lng, getLang());
    if (state[which] !== p) return;
    p.name = r.name; p.detail = r.detail;
    $(which).value = placeText(p);
  }
  if (remember) rememberPlace(p);
  if (rerun && (state.mode === 'park' ? state.park : state.sim && state.from && state.to)) run();
}

// Son kullanılan yerler (sadece bu tarayıcıda).
function recentPlaces() {
  try { return JSON.parse(store.get('sunseat.recent') || '[]').slice(0, 5); } catch (e) { return []; }
}
function rememberPlace(p) {
  if (!p.name || /^-?\d+\.\d+, -?\d+\.\d+$/.test(p.name)) return;
  const list = recentPlaces().filter((x) => Math.abs(x.lat - p.lat) > 1e-4 || Math.abs(x.lng - p.lng) > 1e-4);
  list.unshift({ name: p.name, detail: p.detail || '', lat: p.lat, lng: p.lng });
  store.set('sunseat.recent', JSON.stringify(list.slice(0, 5)));
}

// Haritaya dokununca: "Buradan çık / Buraya git".
function onMapClick(e) {
  if (picking) return;
  const { lat, lng } = e.latlng;
  const div = document.createElement('div');
  div.className = 'pick-pop';
  div.innerHTML = `<small>${lat.toFixed(5)}, ${lng.toFixed(5)}</small>
    <button type="button" data-w="from"><span class="mk-pin mk-a">A</span>${t('pick.setFrom')}</button>
    <button type="button" data-w="to"><span class="mk-pin mk-b">B</span>${t('pick.setTo')}</button>`;
  const pop = L.popup({ closeButton: false, className: 'sun-pop', offset: [0, -2], autoPanPadding: [20, 20] })
    .setLatLng(e.latlng).setContent(div).openOn(map);
  div.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    map.closePopup(pop);
    setPoint(b.dataset.w, { lat, lng }, { fly: false });
  }));
}

// ---------- Haritadan tam nokta seçme ----------
let picking = null, pickTimer, pickSeq = 0, pickResolved = null;
function startPick(which) {
  if (picking) finishPick(false);
  stopPlay();
  picking = which;
  map.closePopup();
  const own = state[which], other = state[which === 'from' ? 'to' : 'from'];
  if (own) map.setView([own.lat, own.lng], Math.max(map.getZoom(), 16));
  else if (other && !state.sim) map.setView([other.lat, other.lng], Math.max(map.getZoom(), 12));
  else if (map.getZoom() < 11) map.setZoom(11);
  const marker = which === 'from' ? markerA : markerB;
  if (marker) marker.setOpacity(0);

  const pin = $('pickerPin');
  pin.classList.toggle('is-b', which === 'to');
  pin.querySelector('b').textContent = which === 'from' ? 'A' : 'B';
  $('pickerTitle').textContent = t(which === 'from' ? 'pick.titleFrom' : 'pick.titleTo');
  $('picker').hidden = false;
  document.querySelector('.map-wrap').classList.add('is-picking');
  document.querySelectorAll(`[data-pick="${which}"]`).forEach((b) => b.classList.add('active'));
  setTimeout(() => map.invalidateSize(), 50);
  map.on('movestart', onPickMoveStart);
  map.on('moveend', onPickMoveEnd);
  onPickMoveEnd();
  const wrap = document.querySelector('.map-wrap');
  const r = wrap.getBoundingClientRect();
  if (r.top < 60 || r.bottom > window.innerHeight) wrap.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
  $('pickerOk').focus({ preventScroll: true });
}
function onPickMoveStart() { $('picker').classList.add('lifting'); }
function onPickMoveEnd() {
  $('picker').classList.remove('lifting');
  const c = map.getCenter();
  $('pickerCoord').textContent = `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
  $('pickerAddr').textContent = t('pick.looking');
  pickResolved = null;
  clearTimeout(pickTimer);
  const seq = ++pickSeq;
  pickTimer = setTimeout(async () => {
    const r = await reversePlace(c.lat, c.lng, getLang());
    if (seq !== pickSeq) return;
    pickResolved = { ...r, lat: c.lat, lng: c.lng };
    $('pickerAddr').textContent = placeText(r);
  }, 350);
}
function finishPick(ok) {
  if (!picking) return;
  const which = picking;
  picking = null;
  clearTimeout(pickTimer);
  map.off('movestart', onPickMoveStart);
  map.off('moveend', onPickMoveEnd);
  $('picker').hidden = true;
  document.querySelector('.map-wrap').classList.remove('is-picking');
  document.querySelectorAll('[data-pick]').forEach((b) => b.classList.remove('active'));
  setTimeout(() => map.invalidateSize(), 50);
  const marker = which === 'from' ? markerA : markerB;
  if (marker) marker.setOpacity(1);
  if (!ok) return;
  const c = map.getCenter();
  const same = pickResolved && Math.abs(pickResolved.lat - c.lat) < 1e-7 && Math.abs(pickResolved.lng - c.lng) < 1e-7;
  setPoint(which, same ? pickResolved : { lat: c.lat, lng: c.lng }, { fly: false });
}

// ---------- Konumum ----------
function locateMe(which, btn) {
  if (!navigator.geolocation) { toast(t('gps.unsupported')); return; }
  if (btn) btn.classList.add('busy');
  navigator.geolocation.getCurrentPosition((pos) => {
    if (btn) btn.classList.remove('busy');
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    setPoint(which, { lat, lng }, { zoom: 16 });
    toast(t('gps.ok', { acc: Math.round(accuracy) }));
  }, (err) => {
    if (btn) btn.classList.remove('busy');
    toast(t(err.code === 1 ? 'gps.denied' : 'gps.fail'));
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
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

// Seçili olmayan güzergahlar: ince, kesik çizgi. Tıklayınca o güzergaha geçilir.
let altLayer;
function drawAltLines() {
  if (altLayer) map.removeLayer(altLayer);
  altLayer = L.layerGroup();
  state.routes.forEach((r, i) => {
    if (i === state.routeIdx) return;
    const line = L.polyline(r.route.coords, { color: isDark() ? '#9aa3ab' : '#5f6870', weight: 5, opacity: 0.55, dashArray: '2 9', lineCap: 'round' });
    line.on('click', () => selectRoute(i));
    line.on('mouseover', () => line.setStyle({ opacity: 0.95 }));
    line.on('mouseout', () => line.setStyle({ opacity: 0.55 }));
    line.altIndex = i;
    altLayer.addLayer(line);
  });
  altLayer.addTo(map);
}
function highlightAlt(i, on) {
  if (!altLayer) return;
  altLayer.eachLayer((l) => { if (l.altIndex === i) l.setStyle({ opacity: on ? 0.95 : 0.55, weight: on ? 7 : 5 }); });
}

function drawRouteOnMap(fit) {
  drawAltLines();
  if (casing) map.removeLayer(casing);
  casing = L.polyline(state.route.coords, { color: isDark() ? '#000' : '#2b3035', weight: 11, opacity: 0.85, interactive: false }).addTo(map);
  paintRoute();
  if (!carMarker) carMarker = L.marker(state.route.coords[0], { icon: carIcon(), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
  if (markerA) markerA.setZIndexOffset(500);
  if (markerB) markerB.setZIndexOffset(500);
  if (fit) {
    const b = casing.getBounds();
    if (altLayer) altLayer.eachLayer((l) => b.extend(l.getBounds()));
    map.fitBounds(b, { padding: [40, 40] });
  }
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
// Kayıtlı rotalar (bu tarayıcıda).
function savedRoutes() {
  try { return JSON.parse(store.get('sunseat.saved') || '[]'); } catch (e) { return []; }
}
function saveCurrentRoute() {
  if (!state.from || !state.to) return;
  const list = savedRoutes().filter((s) => !(s.from.name === state.from.name && s.to.name === state.to.name && s.time === $('time').value));
  list.unshift({
    from: { name: state.from.name, lat: state.from.lat, lng: state.from.lng },
    to: { name: state.to.name, lat: state.to.lat, lng: state.to.lng },
    time: $('time').value, carId: state.carId,
  });
  store.set('sunseat.saved', JSON.stringify(list.slice(0, 8)));
  renderPresets();
  toast(t('saved.toast'));
}

function renderPresets() {
  const box = $('presets');
  box.innerHTML = '';
  savedRoutes().forEach((s, idx) => {
    const wrap = document.createElement('span');
    wrap.className = 'chip chip-saved';
    const go = document.createElement('button');
    go.type = 'button';
    go.innerHTML = `<i class="ph-fill ph-star"></i> ${escapeHtml(s.from.name.split(',')[0])} → ${escapeHtml(s.to.name.split(',')[0])} <small>${escapeHtml(s.time || '')}</small>`;
    go.addEventListener('click', () => {
      state.from = { ...s.from }; state.to = { ...s.to };
      $('from').value = s.from.name; $('to').value = s.to.name;
      if (s.time) $('time').value = s.time;
      if (s.carId && s.carId !== state.carId) { state.carId = carById(s.carId).id; renderCars(); }
      if (state.mode !== 'trip') setMode('trip');
      placeMarkers();
      run();
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'chip-x';
    del.setAttribute('aria-label', t('saved.remove'));
    del.innerHTML = '<i class="ph ph-x"></i>';
    del.addEventListener('click', () => {
      const list = savedRoutes();
      list.splice(idx, 1);
      store.set('sunseat.saved', JSON.stringify(list));
      renderPresets();
      toast(t('saved.removed'));
    });
    wrap.append(go, del);
    box.appendChild(wrap);
  });
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
  // Kendi araban
  const cu = carById('custom');
  const lab = document.createElement('label');
  lab.className = 'car-card is-custom';
  lab.innerHTML = `<input type="radio" name="car" value="custom" ${state.carId === 'custom' ? 'checked' : ''}>
    ${silhouetteSVG(cu)}<b>${t('custom.name')}</b><small>${cu.tag[getLang()]}</small><i class="ph ph-wrench cs-plus"></i>`;
  lab.querySelector('input').addEventListener('change', () => selectCar('custom'));
  rail.appendChild(lab);
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
  if (!$('goBtn').classList.contains('loading')) $('goLabel').textContent = goLabelText();
  $('builder').hidden = state.carId !== 'custom';
  if (state.carId === 'custom') renderBuilder();
}

function goLabelText() {
  if (state.mode === 'park') return t('form.parkGo');
  return t(carById(state.carId).ac ? 'form.go' : 'form.goChoke');
}

// Araba, renk ya da ayar değişince: hangi moddaysak onu yeniden hesapla.
function refreshResults() {
  if (state.mode === 'park' && state.park) { runPark({ quiet: true }); return; }
  if (state.sim) { recompute(); updateHash(); }
}

function selectCar(id) {
  state.carId = id;
  store.set('sunseat.car', id);
  updateCarUI();
  if (id === 'sahin') award('sahin');
  refreshResults();
}

// ---------- Kendi arabanı tarif et ----------
function renderBuilder() {
  const c = state.custom;
  const seg = (box, items, cur, onPick, disabled = () => false) => {
    box.innerHTML = '';
    items.forEach(([val, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(val) === String(cur) ? 'true' : 'false');
      b.textContent = label;
      b.disabled = disabled(val);
      b.addEventListener('click', () => onPick(val));
      box.appendChild(b);
    });
  };
  const bodies = BODY_KEYS.filter((k) => k !== 'retro');
  seg($('bBody'), bodies.map((k) => [k, t('body.' + k)]), c.body, (v) => updateCustom({ body: v, seats: v === 'roadster' ? 2 : c.seats === 2 ? 5 : c.seats, roof: v === 'roadster' ? 'soft' : c.roof }));
  seg($('bRoof'), [['metal', t('roofType.metal')], ['pano', t('roofType.pano')], ['glass', t('roofType.glass')], ['soft', t('roofType.soft')]], c.roof, (v) => updateCustom({ roof: v }));
  seg($('bSeats'), [[2, '2'], [5, '5'], [7, '7']], c.body === 'roadster' ? 2 : c.seats, (v) => updateCustom({ seats: v }), (v) => c.body === 'roadster' && v !== 2);
  $('bPrivacy').checked = !!c.privacy;
  $('bAc').checked = c.ac !== false;
}

function updateCustom(patch) {
  state.custom = { ...state.custom, ...patch };
  store.set('sunseat.custom', JSON.stringify(state.custom));
  setCustom(state.custom);
  award('engineer');
  // Siluet ve not güncellensin.
  const card = document.querySelector('.car-card.is-custom');
  if (card) {
    const svg = card.querySelector('svg');
    const tmp = document.createElement('div');
    tmp.innerHTML = silhouetteSVG(carById('custom'));
    svg.replaceWith(tmp.firstElementChild);
  }
  updateCarUI();
  refreshResults();
}

// ---------- Renk ----------
function renderSwatches() {
  const box = $('swatches');
  box.innerHTML = '';
  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', c.id === state.colorId ? 'true' : 'false');
    b.setAttribute('aria-label', c.name[getLang()]);
    b.title = c.name[getLang()];
    b.style.setProperty('--c', c.hex);
    b.addEventListener('click', () => {
      state.colorId = c.id;
      store.set('sunseat.color', c.id);
      box.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
      $('colorOut').textContent = c.name[getLang()];
      award('painter');
      refreshResults();
    });
    box.appendChild(b);
  });
  $('colorOut').textContent = colorById(state.colorId).name[getLang()];
}

// ---------- Rozetler ----------
function award(id) {
  if (!unlock(id)) return;
  const [name] = t('badge.' + id);
  setTimeout(() => toast(t('badges.toast', { name })), 400);
  renderBadges(id);
}

// ---------- Otomatik tamamlama ----------
const KIND_ICON = {
  city: 'ph-buildings', village: 'ph-house-line', area: 'ph-map-trifold', region: 'ph-globe-hemisphere-east',
  street: 'ph-road-horizon', house: 'ph-house', poi: 'ph-map-pin', recent: 'ph-clock-counter-clockwise',
  coord: 'ph-crosshair', gps: 'ph-navigation-arrow', map: 'ph-crosshair-simple',
};
const KIND_ZOOM = { city: 12, region: 8, area: 14, village: 14, street: 16, house: 18, poi: 17, recent: 16, coord: 17 };
const COORD_RE = /^\s*(-?\d{1,2}(?:[.]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.]\d+)?)\s*$/;

// Haritanın baktığı yere hafif öncelik ver (yakınlaştırılmışsa).
function searchBias() {
  if (!map || map.getZoom() < 9) return null;
  const c = map.getCenter();
  return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
}

function setupAutocomplete(which) {
  const input = $(which), list = $(which + 'Suggest');
  let timer, ctrl, rows = [], active = -1;

  const close = () => { list.innerHTML = ''; rows = []; active = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  const choose = (i) => {
    const r = rows.filter((x) => x.act)[i];
    if (!r) return;
    close();
    r.act();
  };
  // rows: { head } | { info } | { icon, name, detail, act }
  const paint = () => {
    list.innerHTML = '';
    let k = 0;
    rows.forEach((r) => {
      const li = document.createElement('li');
      if (r.sep) { li.className = 's-sep'; li.setAttribute('role', 'presentation'); }
      else if (r.head) { li.className = 's-head'; li.textContent = r.head; li.setAttribute('role', 'presentation'); }
      else if (r.info) { li.className = 's-info'; li.textContent = r.info; li.setAttribute('role', 'presentation'); }
      else {
        const idx = k++;
        li.id = `${which}-opt-${idx}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', idx === active ? 'true' : 'false');
        if (r.action) li.classList.add('s-action');
        li.innerHTML = `<i class="ph ${KIND_ICON[r.icon] || 'ph-map-pin'}"></i><b>${escapeHtml(r.name)}</b>${r.detail ? `<small>${escapeHtml(r.detail)}</small>` : ''}`;
        li.addEventListener('mousedown', (ev) => { ev.preventDefault(); choose(idx); });
      }
      list.appendChild(li);
    });
    input.setAttribute('aria-expanded', rows.length ? 'true' : 'false');
    if (active >= 0) input.setAttribute('aria-activedescendant', `${which}-opt-${active}`);
    else input.removeAttribute('aria-activedescendant');
    const sel = list.querySelector('[aria-selected="true"]');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  };
  const placeRow = (p, icon) => ({
    icon, name: p.name, detail: p.detail,
    act: () => setPoint(which, p, { zoom: KIND_ZOOM[p.kind || icon] || 15 }),
  });
  const actionRows = () => {
    const out = [];
    if (which === 'from') out.push({ icon: 'gps', name: t('ac.gps'), action: true, act: () => locateMe(which, document.querySelector(`[data-gps="${which}"]`)) });
    out.push({ icon: 'map', name: t('ac.map'), action: true, act: () => startPick(which) });
    return out;
  };
  // Boş kutuya odaklanınca: konumum, haritadan seç, son kullanılanlar.
  const showStart = () => {
    const recent = recentPlaces();
    rows = [...actionRows()];
    if (recent.length) rows.push({ head: t('ac.recent') }, ...recent.map((p) => placeRow(p, 'recent')));
    active = -1;
    paint();
  };

  input.addEventListener('focus', () => { if (!input.value.trim()) showStart(); });
  input.addEventListener('input', () => {
    state[which] = null;
    clearTimeout(timer);
    if (ctrl) ctrl.abort();
    const q = input.value.trim();
    if (!q) { showStart(); return; }
    const m = q.match(COORD_RE);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) {
      rows = [{ icon: 'coord', name: `${(+m[1]).toFixed(5)}, ${(+m[2]).toFixed(5)}`, detail: t('ac.coord'), act: () => setPoint(which, { lat: +m[1], lng: +m[2] }, { zoom: 17 }) }];
      active = 0;
      paint();
      return;
    }
    if (q.length < 2) { close(); return; }
    rows = [{ info: t('ac.loading') }];
    active = -1;
    paint();
    timer = setTimeout(async () => {
      ctrl = new AbortController();
      try {
        const items = await searchPlaces(q, getLang(), ctrl.signal, searchBias());
        rows = items.length ? items.map((p) => placeRow(p, p.kind)) : [{ info: t('ac.none') }];
        rows.push({ sep: true }, ...actionRows());
        active = items.length ? 0 : -1;
        paint();
      } catch (e) { if (e.name !== 'AbortError') { rows = [{ info: t('err.net') }]; paint(); } }
    }, 250);
  });
  input.addEventListener('keydown', (e) => {
    const n = rows.filter((x) => x.act).length;
    if (!n) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % n; paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + n) % n; paint(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}

async function resolvePlace(which) {
  if (state[which]) return state[which];
  const q = $(which).value.trim();
  if (!q) return null;
  const m = q.match(COORD_RE);
  if (m) { await setPoint(which, { lat: +m[1], lng: +m[2] }, { fly: false, rerun: false }); return state[which]; }
  const res = await searchPlaces(q, getLang(), undefined, searchBias());
  if (!res.length) throw Object.assign(new Error('nf'), { code: 'notFound', q });
  const p = res[0];
  state[which] = { name: p.name, detail: p.detail, lat: p.lat, lng: p.lng };
  $(which).value = placeText(state[which]);
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
    $('goLabel').textContent = goLabelText();
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
  if (state.mode === 'park') return runPark();
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
      const routes = await fetchRoutes(from, to);
      if (token !== runToken) return;
      state.routes = routes.map((r) => ({ route: r, samples: sampleRoute(r) }));
      state.routeIdx = Math.min(state.pendingRouteIdx || 0, state.routes.length - 1);
      state.pendingRouteIdx = 0;
      state.route = state.routes[state.routeIdx].route;
      state.samples = state.routes[state.routeIdx].samples;
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
    checkTripBadges();
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
  computeAlts();
}

// Her güzergah için seçili koltuğun güneş dozu.
function computeAlts() {
  if (state.routes.length < 2) { state.altDoses = null; return; }
  const car = carById(state.carId);
  const opts = { tint: state.tint, roofOpen: state.roofOpen };
  state.altDoses = state.routes.map((r, i) => (i === state.routeIdx
    ? state.sim.dose[state.mySeat]
    : simulate({ samples: r.samples, depart: state.depart, car, opts, weather: state.weather, detail: false }).dose[state.mySeat]));
}

function selectRoute(i) {
  if (i === state.routeIdx || !state.routes[i]) return;
  stopPlay();
  state.routeIdx = i;
  state.route = state.routes[i].route;
  state.samples = state.routes[i].samples;
  state.idx = 0;
  compute();
  renderAll(false);
  drawRouteOnMap(false);
  setScrub(0);
  updateHash();
}

function renderAlts() {
  const box = $('alts');
  if (!state.altDoses) { box.hidden = true; return; }
  box.hidden = false;
  let shade = 0;
  state.altDoses.forEach((d, i) => { if (d < state.altDoses[shade] - 0.5) shade = i; });
  const seat = seatName(state.mySeat);
  box.innerHTML = '';
  state.routes.forEach((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'alt';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', i === state.routeIdx ? 'true' : 'false');
    b.innerHTML = `<b>${escapeHtml(t('alts.route', { n: i + 1 }))}</b>
      <span>${fmtKm(r.route.distance)} · ${fmtDur(r.route.duration)}</span>
      <strong>${escapeHtml(t('alts.seat', { seat, min: Math.round(state.altDoses[i]) }))}</strong>
      ${i === shade && state.altDoses.some((d) => d > state.altDoses[shade] + 0.5) ? `<em class="alt-tag">${t('alts.shadiest')}</em>` : ''}`;
    b.addEventListener('click', () => selectRoute(i));
    b.addEventListener('mouseenter', () => highlightAlt(i, true));
    b.addEventListener('mouseleave', () => highlightAlt(i, false));
    box.appendChild(b);
  });
}

function checkTripBadges() {
  const pts = state.sim.points;
  award('first');
  if (findTwilight(pts).some((x) => x.kind === 'set')) award('sunset');
  if (!pts.some((p) => p.sunAlt > 0)) award('night');
  if (state.route.distance > 500000) award('long');
  const car = carById(state.carId);
  if (car.roof === 'soft' && state.roofOpen) award('roofless');
  const out = (p) => p.lat < 35.8 || p.lat > 42.2 || p.lng < 25.6 || p.lng > 44.9;
  if (out(state.from) || out(state.to)) award('world');
}

// ---------- Park modu ----------
let parkMarker;
async function runPark({ quiet = false } = {}) {
  hideError();
  stopPlay();
  const token = ++runToken;
  const dateV = $('date').value, timeV = $('time').value;
  if (!dateV || !timeV) { showError(t('err.date')); return; }
  if (!quiet) { crank(); setLoading(true, 'park.loading'); }
  try {
    const at = await resolvePlace('from');
    if (!at) { showError(t('err.places')); return; }
    const start = new Date(`${dateV}T${timeV}`).getTime();
    const hours = state.parkHours;
    const key = `${at.lat.toFixed(4)},${at.lng.toFixed(4)}|${dateV}|${hours}`;
    if (key !== state.parkWxKey) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try { state.parkWeather = await fetchWeather({ coords: [[at.lat, at.lng]] }, start, start + hours * 36e5, ctrl.signal); }
      catch (e) { state.parkWeather = null; }
      finally { clearTimeout(timer); }
      state.parkWxKey = key;
    }
    if (token !== runToken) return;
    const color = colorById(state.colorId);
    state.park = parkScan({ lat: at.lat, lng: at.lng, start, hours, car: carById(state.carId), opts: { tint: state.tint, roofOpen: state.roofOpen }, weather: state.parkWeather, absorb: color.abs });
    showPark(!quiet);
    award('park');
    updateHash();
  } catch (e) {
    if (token !== runToken) return;
    if (e.code === 'notFound') showError(t('err.notFound', { q: e.q }));
    else { console.error(e); showError(t('err.net')); }
  } finally {
    if (token === runToken && !quiet) setLoading(false);
  }
}

function showPark(animate) {
  $('empty').hidden = true;
  $('results').hidden = true;
  const box = $('parkResults');
  box.hidden = false;
  if (animate) {
    box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
    box.querySelectorAll('.reveal').forEach((el, i) => el.style.setProperty('--i', i));
  }
  const at = state.from;
  renderPark({ res: state.park, hours: state.parkHours, onPreview: (h) => setParkMarker(at, h) });
  if (animate) map.flyTo([at.lat, at.lng], Math.max(map.getZoom(), 17), { duration: reduceMotion() ? 0 : 0.8 });
}

// Araba işaretini seçili renge boya; açık renklerde koyu kenar.
function paintMarker(el) {
  const c = colorById(state.colorId);
  const r = el.querySelector('.cm-car rect');
  r.setAttribute('fill', c.hex);
  r.setAttribute('stroke', c.abs < 0.5 ? '#15181b' : '#fff');
}

function setParkMarker(at, heading) {
  if (!parkMarker) {
    parkMarker = L.marker([at.lat, at.lng], { icon: carIcon(), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
  } else parkMarker.setLatLng([at.lat, at.lng]);
  const el = parkMarker.getElement();
  if (!el) return;
  el.querySelector('.cm-car').style.transform = `rotate(${heading}deg)`;
  paintMarker(el);
  el.querySelector('.cm-sun').style.display = 'none';
}

// ---------- Mod ----------
function setMode(m) {
  if (m === state.mode) return;
  stopPlay();
  finishPick(false);
  state.mode = m;
  document.documentElement.dataset.mode = m;
  document.querySelectorAll('.mode-tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.mode === m ? 'true' : 'false'));
  applyModeTexts();
  hideError();
  const park = m === 'park';
  // Haritadaki katmanlar
  [casing, heatLayer, altLayer, carMarker, markerB].forEach((l) => {
    if (!l) return;
    if (park) map.removeLayer(l); else l.addTo(map);
  });
  if (parkMarker && !park) { map.removeLayer(parkMarker); parkMarker = null; }
  $('mapLegend').hidden = park || !state.sim;
  $('results').hidden = park || !state.sim;
  $('parkResults').hidden = !park || !state.park;
  $('empty').hidden = park ? !!state.park : !!state.sim;
  if (park && state.from) runPark({ quiet: !!state.park });
  else if (!park && state.sim) { requestAnimationFrame(() => { drawStrips(); map.invalidateSize(); }); }
  updateHash();
}

function applyModeTexts() {
  const park = state.mode === 'park';
  $('fromLabel').textContent = t(park ? 'form.parkFrom' : 'form.from');
  $('timeLabel').textContent = t(park ? 'form.parkTime' : 'form.time');
  $('goLabel').textContent = goLabelText();
  const eh = document.querySelector('#empty h2'), ep = document.querySelector('#empty p');
  eh.textContent = t(park ? 'empty.parkTitle' : 'empty.title');
  ep.textContent = t(park ? 'empty.parkBody' : 'empty.body');
  $('parkHoursOut').textContent = t('park.hoursOut', { h: state.parkHours });
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
  const paint = colorById(state.colorId).hex;
  carView = buildCarView($('carSvg'), car, state.sim.seatKeys.map((k) => t('seat.short.' + k)), [0, 2, 4, 6].map((i) => t('compass')[i]), paint);
  carView.seats.forEach((s, i) => s.g.addEventListener('click', () => selectSeat(i)));
  renderAlts();
  renderVerdict();
  renderMeta();
  renderStrips();
  renderBest();
  renderGlare();
  renderArm();
  renderFamily();
  renderSweat();
  renderFact();
  renderCabin({ points: state.sim.points, car, colorId: state.colorId });
  renderMineCards();
  renderBadges();
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
  computeAlts();
  renderAlts();
  renderBest();
  renderMineCards();
  paintRoute();
  setScrub(state.idx);
  updateHash();
}

// Seçili koltuğa bağlı kartlar: bronzlaşma ve mevsimler.
function renderMineCards() {
  const car = carById(state.carId);
  const opts = { tint: state.tint, roofOpen: state.roofOpen };
  renderTan({ points: state.sim.points, car, opts, seatIdx: state.mySeat, seatKey: state.sim.seatKeys[state.mySeat] });
  renderSeason({
    samples: state.samples, depart: state.depart, car, opts,
    seatKeys: state.sim.seatKeys, totalMin: state.route.duration / 60, mySeat: state.mySeat,
  });
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
  moveCabinMarker(i);

  // Canlı gökyüzü
  const sky = skyAt(p.sunAlt);
  const skyEl = $('sky');
  skyEl.style.setProperty('--sky-top', sky.top);
  skyEl.style.setProperty('--sky-bottom', sky.bottom);
  skyEl.style.setProperty('--stars', sky.stars.toFixed(2));
  skyEl.classList.toggle('is-day', p.sunAlt > 4);

  if (carMarker) {
    carMarker.setLatLng([p.lat, p.lng]);
    const el = carMarker.getElement();
    if (el) {
      paintMarker(el);
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
      if (s === best && s.off !== 0) award('shade');
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
  if (score >= 7.5) award('tan');
  $('armFoot').textContent = t(car.roof === 'soft' && state.roofOpen ? 'arm.footRhd' : 'arm.foot');
}

// ---------- Aile modu ----------
function defaultFamily() {
  const names = t('family.defaults');
  const prefs = ['any', 'shade', 'sun', 'shade', 'any', 'sun', 'any'];
  return names.map((n, i) => ({ name: n, pref: prefs[i] }));
}

function renderFamily() {
  if (!state.family) state.family = defaultFamily();
  if (state.family.length < 7) state.family = state.family.concat(defaultFamily().slice(state.family.length));
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
    li.querySelector('input').addEventListener('input', (e) => { p.name = e.target.value; renderFamilyResult(); award('family'); });
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
  const park = state.mode === 'park';
  if (!state.from || (!park && !state.to)) return;
  const enc = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)},${encodeURIComponent(p.name)}`;
  const h = new URLSearchParams();
  if (park) h.set('m', 'park');
  h.set('f', enc(state.from));
  if (!park && state.to) h.set('t', enc(state.to));
  h.set('d', `${$('date').value}T${$('time').value}`);
  h.set('c', state.carId);
  if (state.carId === 'custom') {
    const c = state.custom;
    h.set('cu', [c.body, c.roof, c.privacy ? 1 : 0, c.ac === false ? 0 : 1, c.seats].join('.'));
  }
  if (state.colorId !== 'silver') h.set('col', state.colorId);
  if (state.tint) h.set('ti', String(state.tint));
  if (!state.roofOpen) h.set('r', '0');
  if (park) h.set('h', String(state.parkHours));
  else {
    if (state.mySeat) h.set('s', String(state.mySeat));
    if (state.routeIdx) h.set('ri', String(state.routeIdx));
  }
  history.replaceState(null, '', '#' + decodeURIComponent(h.toString()));
}

// Dönüş: 'trip' | 'park' | false (otomatik hesap yapılacak mı?)
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
  if (h.get('cu')) {
    const [body, roof, pr, ac, seats] = h.get('cu').split('.');
    state.custom = { body, roof, privacy: pr === '1', ac: ac !== '0', seats: Number(seats) || 5 };
    setCustom(state.custom);
  }
  if (h.get('c')) state.carId = carById(h.get('c')).id;
  if (h.get('col')) state.colorId = colorById(h.get('col')).id;
  if (h.get('ti')) state.tint = Math.max(0, Math.min(80, Number(h.get('ti')) || 0));
  if (h.get('r') === '0') state.roofOpen = false;
  if (h.get('s')) state.mySeat = Number(h.get('s')) || 0;
  if (h.get('ri')) state.pendingRouteIdx = Math.max(0, Math.min(2, Number(h.get('ri')) || 0));
  if (h.get('h')) state.parkHours = Math.max(1, Math.min(10, Number(h.get('h')) || 3));
  const park = h.get('m') === 'park';
  if (f) { state.from = f; $('from').value = f.name; }
  if (to) { state.to = to; $('to').value = to.name; }
  if (park) return f ? 'park' : false;
  return f && to ? 'trip' : false;
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
  renderSwatches();
  applyModeTexts();
  renderBadges();
  if (state.mode === 'park' && state.park) showPark(false);
  if (state.sim) {
    state.family = state.family && state.family.map((p, i) => {
      const other = l === 'tr' ? ['Me', 'Ece', 'Mert', 'Grandpa'] : ['Ben', 'Ece', 'Mert', 'Dede'];
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
  if (fromHash === 'park') { state.mode = 'park'; document.documentElement.dataset.mode = 'park'; }
  document.querySelectorAll('.mode-tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.mode === state.mode ? 'true' : 'false'));
  $('parkHours').value = String(state.parkHours);
  $('tint').value = String(state.tint);
  $('tintOut').textContent = getLang() === 'tr' ? `%${state.tint}` : `${state.tint}%`;

  renderPresets();
  renderCars();
  renderSwatches();
  renderBadges();
  applyModeTexts();
  initMap();
  $('themeToggle').classList.toggle('is-dark', isDark());

  setupAutocomplete('from');
  setupAutocomplete('to');
  document.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    if (picking === b.dataset.pick) finishPick(false); else startPick(b.dataset.pick);
  }));
  document.querySelectorAll('[data-gps]').forEach((b) => b.addEventListener('click', () => locateMe(b.dataset.gps, b)));
  $('pickerOk').addEventListener('click', () => finishPick(true));
  $('pickerCancel').addEventListener('click', () => finishPick(false));
  document.addEventListener('keydown', (e) => {
    if (!picking) return;
    if (e.key === 'Escape') finishPick(false);
    if (e.key === 'Enter' && document.activeElement && document.activeElement.closest('.picker-bar, #map')) { e.preventDefault(); finishPick(true); }
  });

  $('tripForm').addEventListener('submit', (e) => { e.preventDefault(); run(); });
  document.querySelectorAll('.mode-tab').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('parkHours').addEventListener('input', (e) => {
    state.parkHours = Number(e.target.value);
    $('parkHoursOut').textContent = t('park.hoursOut', { h: state.parkHours });
  });
  $('parkHours').addEventListener('change', () => { if (state.park) runPark({ quiet: true }); });
  $('bPrivacy').addEventListener('change', (e) => updateCustom({ privacy: e.target.checked }));
  $('bAc').addEventListener('change', (e) => updateCustom({ ac: e.target.checked }));
  $('saveRoute').addEventListener('click', saveCurrentRoute);
  // Mevsim tablosu görününce rozet.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { award('season'); io.disconnect(); } }, { threshold: 0.6 });
    io.observe($('seasonCard'));
  }
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
    refreshResults();
  });
  $('tint').addEventListener('change', updateHash);
  $('roofOpen').addEventListener('change', (e) => { state.roofOpen = e.target.checked; refreshResults(); if (state.sim && state.roofOpen && carById(state.carId).roof === 'soft') award('roofless'); });
  const timeChanged = () => { if (state.mode === 'park' ? state.park : state.sim) run(); };
  $('date').addEventListener('change', timeChanged);
  $('time').addEventListener('change', timeChanged);

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
      award('logo');
    } else window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
  });

  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { drawStrips(); if (map) map.invalidateSize(); }, 120); });

  if (fromHash) { placeMarkers(); run(); }
  setupPwa();
}

// ---------- PWA ----------
let installEvt = null;
function setupPwa() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* yoksa da çalışır */ });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvt = e;
    $('installBtn').hidden = false;
  });
  $('installBtn').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    const r = await installEvt.userChoice.catch(() => null);
    installEvt = null;
    $('installBtn').hidden = true;
    if (r && r.outcome === 'accepted') toast(t('pwa.installed'));
  });
  window.addEventListener('offline', () => toast(t('pwa.offline')));
}

init();
