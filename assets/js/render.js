// Çizimler: ısı rengi, üstten araba, koltuk şeritleri, yan profil siluetleri.
import { BODIES, SILHOUETTES } from './cars.js';

const NS = 'http://www.w3.org/2000/svg';

// ---------- Isı skalası ----------
const STOPS = [
  [0.0, null],          // tema rengi (--heat-0)
  [0.18, [246, 211, 101]],
  [0.45, [242, 160, 7]],
  [0.72, [228, 87, 46]],
  [1.0, [164, 22, 26]],
];
let base = [213, 220, 225];
export function refreshHeatBase() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--heat-0').trim();
  const m = v.match(/^#?([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    base = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
}
export function heatRGB(v) {
  v = Math.max(0, Math.min(1, v));
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) {
      const [p0, c0r] = STOPS[i - 1], [p1, c1] = STOPS[i];
      const c0 = c0r || base;
      const f = (v - p0) / (p1 - p0);
      return c0.map((c, k) => Math.round(c + (c1[k] - c) * f));
    }
  }
  return STOPS[STOPS.length - 1][1];
}
export const heat = (v) => `rgb(${heatRGB(v).join(',')})`;

// ---------- Yardımcılar ----------
function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// ---------- Yan profil (araba kartları) ----------
export function silhouetteSVG(car) {
  const s = SILHOUETTES[car.body];
  const wheels = s.wheels.map((x) => `
    <g class="cs-wheel-g">
      <circle class="cs-wheel" cx="${x}" cy="36" r="${s.r}"/>
      <path class="cs-hub" d="M${x - s.r * 0.5} 36 H${x + s.r * 0.5} M${x} ${36 - s.r * 0.5} V${36 + s.r * 0.5}"/>
    </g>`).join('');
  const roof = car.roof === 'pano' || car.roof === 'glass'
    ? `<rect class="cs-roof" x="${car.roof === 'glass' ? 50 : 58}" y="${car.body === 'suv' ? 4.6 : 8.2}" width="${car.roof === 'glass' ? 46 : 26}" height="1.6" rx=".8"/>` : '';
  return `<svg viewBox="0 0 120 48" aria-hidden="true"><g class="cs-car">
    <path class="cs-body" d="${s.body}"/><path class="cs-glass" d="${s.glass}"/>${roof}${wheels}</g></svg>`;
}

// ---------- Üstten araba ----------
// Arabanın burnu yukarı bakar. Güneş, burna göre açısı (rel) kadar döndürülmüş yörüngede.
// Koltuk dikdörtgenleri [x, y, w, h]; sıra SEAT_KEYS ile aynı.
export function seatLayout(n, left, W, y0, y1, inset) {
  const span = y1 - y0, inner = W - inset * 2, cx = left + W / 2;
  const rows = n <= 2 ? [[0.18, 0.5]] : n >= 7 ? [[0.03, 0.27], [0.37, 0.27], [0.71, 0.26]] : [[0.08, 0.34], [0.56, 0.34]];
  const sw = inner * (n <= 2 ? 0.38 : 0.36);
  const out = [];
  rows.forEach(([f, hf], r) => {
    const y = y0 + span * f, h = span * hf;
    if (r === 0) out.push([left + inset + 5, y, sw, h], [left + W - inset - 5 - sw, y, sw, h]);
    else if (r === 1) out.push([left + inset + 3, y, sw * 0.82, h], [cx - sw * 0.36, y, sw * 0.72, h], [left + W - inset - 3 - sw * 0.82, y, sw * 0.82, h]);
    else out.push([left + inset + 6, y, sw * 0.9, h], [left + W - inset - 6 - sw * 0.9, y, sw * 0.9, h]);
  });
  return out;
}

export function buildCarView(svg, car, seatLabels, compassLabels, paint) {
  svg.innerHTML = '';
  const b = BODIES[car.body];
  const cx = 150, cy = 150;
  const L = 184 * b.len, W = 92 * b.wid;
  const top = cy - L / 2, left = cx - W / 2;
  const Y = (f) => top + L * f;

  const defs = el('defs', {}, svg);
  const grad = el('linearGradient', { id: 'beamGrad', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
  el('stop', { offset: '0', 'stop-color': '#f5b800', 'stop-opacity': '.55' }, grad);
  el('stop', { offset: '1', 'stop-color': '#f5b800', 'stop-opacity': '0' }, grad);

  el('circle', { class: 'cv-orbit', cx, cy, r: 128 }, svg);
  const compass = el('g', { class: 'cv-compassg' }, svg);
  compassLabels.forEach((k, i) => {
    const t = el('text', { class: 'cv-compass', x: cx, y: cy - 136, transform: `rotate(${i * 90} ${cx} ${cy})`, dy: '3' }, compass);
    t.textContent = k;
  });

  // Güneş ışını (hüzme) ve güneş
  const sunG = el('g', { class: 'cv-sungroup' }, svg);
  const beam = el('path', { d: `M${cx - W * 0.62} ${cy - 118} L${cx + W * 0.62} ${cy - 118} L${cx + W * 0.5} ${cy - 10} L${cx - W * 0.5} ${cy - 10} Z`, fill: 'url(#beamGrad)' }, sunG);
  const sun = el('g', {}, sunG);
  el('circle', { class: 'cv-sun-core', cx, cy: cy - 128, r: 12 }, sun);
  for (let i = 0; i < 8; i++) {
    const a = i * 45 * Math.PI / 180;
    el('line', {
      class: 'cv-sun-ray',
      x1: cx + Math.cos(a) * 16, y1: cy - 128 + Math.sin(a) * 16,
      x2: cx + Math.cos(a) * 21, y2: cy - 128 + Math.sin(a) * 21,
    }, sun);
  }
  const moon = el('path', { class: 'cv-moon', d: `M${cx + 4} ${cy - 140} a12 12 0 1 0 8 21 a10 10 0 1 1 -8 -21 Z`, visibility: 'hidden' }, svg);

  // Tekerlekler ve gövde
  const wh = 9, wl = 26;
  [[0.2], [0.78]].forEach(([f]) => {
    el('rect', { class: 'cv-wheel', x: left - 4, y: Y(f) - wl / 2, width: wh, height: wl, rx: 3 }, svg);
    el('rect', { class: 'cv-wheel', x: left + W - wh + 4, y: Y(f) - wl / 2, width: wh, height: wl, rx: 3 }, svg);
  });
  const body = el('path', { class: 'cv-body', d: bodyPath(left, top, W, L, car.body) }, svg);
  body.setAttribute('vector-effect', 'non-scaling-stroke');
  if (paint) body.style.fill = paint;

  const glass = {};
  const rf = b.roofFrom, rt = b.roofTo;
  const inset = 7;
  // Ön cam
  glass.ws = el('path', { class: 'cv-glass', d: `M${left + 10} ${Y(rf - 0.09)} Q${cx} ${Y(rf - 0.12)} ${left + W - 10} ${Y(rf - 0.09)} L${left + W - inset - 3} ${Y(rf)} L${left + inset + 3} ${Y(rf)} Z` }, svg);
  // Arka cam
  glass.rw =el('path', { class: 'cv-glass', d: `M${left + inset + 3} ${Y(rt)} L${left + W - inset - 3} ${Y(rt)} L${left + W - 12} ${Y(rt + 0.06)} Q${cx} ${Y(rt + 0.075)} ${left + 12} ${Y(rt + 0.06)} Z` }, svg);
  // Yan camlar
  const mid = car.seats > 2 ? rf + (rt - rf) * (car.seats >= 7 ? 0.33 : 0.48) : rt;
  glass.fl = el('rect', { class: 'cv-glass', x: left + 1.5, y: Y(rf) + 2, width: 4.5, height: Y(mid) - Y(rf) - 4, rx: 2 }, svg);
  glass.fr = el('rect', { class: 'cv-glass', x: left + W - 6, y: Y(rf) + 2, width: 4.5, height: Y(mid) - Y(rf) - 4, rx: 2 }, svg);
  if (car.seats > 2) {
    glass.rl = el('rect', { class: 'cv-glass', x: left + 1.5, y: Y(mid) + 2, width: 4.5, height: Y(rt) - Y(mid) - 4, rx: 2 }, svg);
    glass.rr = el('rect', { class: 'cv-glass', x: left + W - 6, y: Y(mid) + 2, width: 4.5, height: Y(rt) - Y(mid) - 4, rx: 2 }, svg);
  }
  // Tavan
  const roofRect = { x: left + inset, y: Y(rf), width: W - inset * 2, height: Y(rt) - Y(rf), rx: 8 };
  if (car.roof === 'glass') glass.roof = el('rect', { class: 'cv-roofglass', ...roofRect }, svg);
  else if (car.roof === 'pano') {
    el('rect', { class: 'cv-roof', ...roofRect }, svg);
    glass.roof = el('rect', { class: 'cv-roofglass', x: left + inset + 8, y: Y(rf) + 6, width: W - inset * 2 - 16, height: (Y(rt) - Y(rf)) * 0.7, rx: 6 }, svg);
  } else if (car.roof === 'soft') {
    glass.roof = el('rect', { class: 'cv-roof', ...roofRect }, svg);
  } else el('rect', { class: 'cv-roof', ...roofRect }, svg);

  // Koltuklar
  const seats = [];
  const pos = seatLayout(car.seats, left, W, Y(rf), Y(rt), inset);
  pos.forEach(([x, y, w, sh], i) => {
    const g = el('g', { 'data-seat': i, style: 'cursor:pointer' }, svg);
    const r = el('rect', { class: 'cv-seat', x, y, width: w, height: sh, rx: 7 }, g);
    const mine = el('rect', { class: 'cv-mine', x: x - 3, y: y - 3, width: w + 6, height: sh + 6, rx: 9, visibility: 'hidden' }, g);
    const tx = el('text', { class: 'cv-seat-label', x: x + w / 2, y: y + sh / 2 + 3.5 }, g);
    const lab = el('text', { class: 'cv-seat-label', x: x + w / 2, y: y + sh / 2 - 7, style: 'font-size:7px;opacity:.7' }, g);
    lab.textContent = seatLabels[i];
    seats.push({ r, tx, mine, g });
  });
  const front = el('text', { class: 'cv-front', x: cx, y: top - 8 }, svg);

  return {
    update(p, mySeat, frontLabel) {
      front.textContent = frontLabel;
      const night = p.sunAlt <= 0;
      sunG.setAttribute('transform', `rotate(${p.rel} ${cx} ${cy})`);
      sunG.style.opacity = night ? '0' : String(0.35 + 0.65 * Math.min(1, p.intensity * 1.2));
      beam.style.opacity = night ? '0' : String(Math.min(1, p.intensity * 1.3));
      moon.setAttribute('visibility', night ? 'visible' : 'hidden');
      compass.setAttribute('transform', `rotate(${-p.heading} ${cx} ${cy})`);
      for (const k in glass) {
        const v = p.win[k] || 0;
        glass[k].style.fill = v > 0.02 ? `rgba(245,184,0,${Math.min(0.9, 0.2 + v * 1.4)})` : '';
      }
      seats.forEach((s, i) => {
        const v = p.seats[i] || 0;
        s.r.style.fill = heat(v);
        s.tx.textContent = `${Math.round(v * 100)}%`;
        s.tx.style.fill = v > 0.6 ? '#fff' : '';
        s.mine.setAttribute('visibility', i === mySeat ? 'visible' : 'hidden');
      });
    },
    seats,
  };
}

function bodyPath(x, y, w, l, body) {
  const nose = body === 'van' ? 12 : body === 'retro' ? 10 : 20;
  const tail = body === 'van' || body === 'station' ? 10 : 16;
  const r = Math.min(w / 2 - 4, nose);
  return `M${x + r} ${y}
    H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r + 6}
    V${y + l - tail - 4} Q${x + w} ${y + l} ${x + w - tail} ${y + l}
    H${x + tail} Q${x} ${y + l} ${x} ${y + l - tail - 4}
    V${y + r + 6} Q${x} ${y} ${x + r} ${y} Z`;
}

// ---------- Koltuk şeritleri (canvas) ----------
export function drawStrip(canvas, points, seatIndex) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const total = points[points.length - 1].t || 1;
  for (let i = 0; i < points.length - 1; i++) {
    const x0 = points[i].t / total * w, x1 = points[i + 1].t / total * w;
    ctx.fillStyle = heat(points[i].seats[seatIndex] || 0);
    ctx.fillRect(Math.floor(x0), 0, Math.ceil(x1 - x0) + 1, h);
  }
}

// ---------- Aile modu mini araba ----------
export function familyCarSVG(car, assignment, labels) {
  const b = BODIES[car.body];
  const W = 120 * b.wid, L = 200 * b.len;
  const x = 110 - W / 2, y = 10;
  const rf = y + L * b.roofFrom, rt = y + L * b.roofTo;
  const pos = seatLayout(car.seats, x, W, rf, rt, 4);
  let out = `<svg class="family-car" viewBox="0 0 220 ${L + 20}" role="img" aria-label="${labels.aria}">`;
  out += `<path class="cv-body" d="${bodyPath(x, y, W, L, car.body)}"/>`;
  pos.forEach(([sx, sy, w, sh], i) => {
    const a = assignment[i];
    const name = a ? a.name.slice(0, w < 30 ? 3 : 6) : '';
    out += `<rect class="cv-seat" x="${sx}" y="${sy}" width="${w}" height="${sh}" rx="8" style="fill:${heat(a ? a.v : 0)}"/>`;
    out += `<text class="cv-seat-label" x="${sx + w / 2}" y="${sy + sh / 2 + 3.5}" style="font-size:${w < 30 ? 8 : 10}px${a && a.v > 0.6 ? ';fill:#fff' : ''}">${escapeHtml(name)}</text>`;
  });
  out += '</svg>';
  return out;
}

// ---------- Canlı gökyüzü ----------
// Güneş yüksekliğine göre gökyüzü gradyanı [üst, alt] ve yıldız görünürlüğü.
const SKY = [
  [-18, '#070b1d', '#141a33'],
  [-8, '#0f1733', '#2a2c52'],
  [-3, '#24305a', '#8a4f6e'],
  [0, '#3c5486', '#f0864a'],
  [5, '#5f8fc8', '#f5b77a'],
  [15, '#4f93db', '#b9dcf3'],
  [45, '#3a86d8', '#a9d6f5'],
];
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, f) => `rgb(${hex2rgb(a).map((c, i) => Math.round(c + (hex2rgb(b)[i] - c) * f)).join(',')})`;
export function skyAt(alt) {
  const a = Math.max(SKY[0][0], Math.min(SKY[SKY.length - 1][0], alt));
  for (let i = 1; i < SKY.length; i++) {
    if (a <= SKY[i][0]) {
      const f = (a - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]);
      return { top: mix(SKY[i - 1][1], SKY[i][1], f), bottom: mix(SKY[i - 1][2], SKY[i][2], f), stars: Math.max(0, Math.min(1, (-alt - 2) / 8)), night: alt < -3 };
    }
  }
  const l = SKY[SKY.length - 1];
  return { top: l[1], bottom: l[2], stars: 0, night: false };
}

// ---------- Çizgi grafik (sıcaklık) ----------
// series: [{ values, cls, label, dash }]. Tek y ekseni, °C.
export function lineChart({ series, xLabels, w = 340, h = 150, unit = '°C', marker = null, ref = null }) {
  const pad = { l: 34, r: 56, t: 12, b: 22 };
  const all = series.flatMap((s) => s.values).concat(ref ? [ref.value] : []);
  let lo = Math.floor(Math.min(...all) - 1), hi = Math.ceil(Math.max(...all) + 1);
  if (hi - lo < 6) { const m = (hi + lo) / 2; lo = Math.floor(m - 3); hi = Math.ceil(m + 3); }
  const n = Math.max(...series.map((s) => s.values.length));
  const X = (i) => pad.l + (n > 1 ? i / (n - 1) : 0) * (w - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  const ticks = [];
  const step = Math.max(2, Math.ceil((hi - lo) / 4 / 2) * 2);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  let out = `<svg class="lc" viewBox="0 0 ${w} ${h}" role="img">`;
  ticks.forEach((v) => {
    out += `<line class="lc-grid" x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>`;
    out += `<text class="lc-tick" x="${pad.l - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v}°</text>`;
  });
  if (ref) {
    out += `<line class="lc-ref" x1="${pad.l}" x2="${w - pad.r}" y1="${Y(ref.value)}" y2="${Y(ref.value)}"/>`;
    out += `<text class="lc-reflabel" x="${w - pad.r + 6}" y="${Y(ref.value) + 3.5}">${escapeHtml(ref.label)}</text>`;
  }
  // Etiketler üst üste binmesin.
  const ends = series.map((s) => ({ s, y: Y(s.values[s.values.length - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  series.forEach((s) => {
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    out += `<path class="lc-line ${s.cls}" d="${d}"${s.dash ? ' stroke-dasharray="5 4"' : ''}/>`;
    const e = ends.find((x) => x.s === s);
    const last = s.values[s.values.length - 1];
    out += `<circle class="lc-end ${s.cls}" cx="${X(s.values.length - 1)}" cy="${Y(last)}" r="4"/>`;
    out += `<text class="lc-label" x="${w - pad.r + 8}" y="${e.y + 3.5}">${Math.round(last)}${unit}</text>`;
  });
  if (xLabels) {
    out += `<text class="lc-tick" x="${pad.l}" y="${h - 5}">${escapeHtml(xLabels[0])}</text>`;
    out += `<text class="lc-tick" x="${w - pad.r}" y="${h - 5}" text-anchor="end">${escapeHtml(xLabels[1])}</text>`;
  }
  out += `<g class="lc-hover" visibility="hidden"><line class="lc-cross" y1="${pad.t}" y2="${h - pad.b}"/>${series.map((s) => `<circle class="lc-dot ${s.cls}" r="4"/>`).join('')}</g>`;
  if (marker != null) out += `<line class="lc-marker" x1="${X(marker)}" x2="${X(marker)}" y1="${pad.t}" y2="${h - pad.b}"/>`;
  out += `<rect class="lc-hit" x="${pad.l}" y="0" width="${w - pad.l - pad.r}" height="${h}" fill="transparent"/>`;
  out += '</svg>';
  return { html: out, X, Y, n, pad, w };
}

// Fareyle gezince artı imleci + değer. format(i) -> tooltip metni.
export function attachLineHover(container, chart, series, format) {
  const svg = container.querySelector('svg.lc');
  const tip = container.querySelector('.lc-tip');
  if (!svg || !tip) return;
  const g = svg.querySelector('.lc-hover');
  const cross = g.querySelector('.lc-cross');
  const dots = g.querySelectorAll('.lc-dot');
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = (ev.clientX - r.left) / r.width * chart.w;
    const span = chart.X(chart.n - 1) - chart.X(0) || 1;
    const i = Math.max(0, Math.min(chart.n - 1, Math.round((sx - chart.X(0)) / span * (chart.n - 1))));
    const x = chart.X(i);
    cross.setAttribute('x1', x); cross.setAttribute('x2', x);
    series.forEach((s, k) => { dots[k].setAttribute('cx', x); dots[k].setAttribute('cy', chart.Y(s.values[Math.min(i, s.values.length - 1)])); });
    g.setAttribute('visibility', 'visible');
    tip.innerHTML = format(i);
    tip.hidden = false;
    const left = (x / chart.w) * r.width;
    tip.style.left = `${Math.min(Math.max(left, 70), r.width - 70)}px`;
  };
  const leave = () => { g.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);
}

// ---------- Park pusulası ----------
// list: [{ heading, score }]. En iyi yön işaretli, ortada araba.
export function parkRose(list, best, compass, selected) {
  const cx = 130, cy = 130, r0 = 40, r1 = 112;
  const max = Math.max(...list.map((x) => x.score), 0.001);
  const min = Math.min(...list.map((x) => x.score));
  const P = (a, r) => [cx + Math.sin(a * Math.PI / 180) * r, cy - Math.cos(a * Math.PI / 180) * r];
  let out = `<svg class="rose" viewBox="0 0 260 260" role="img">`;
  list.forEach((x) => {
    const a0 = x.heading - 7, a1 = x.heading + 7;
    const [ax, ay] = P(a0, r0), [bx, by] = P(a0, r1), [ccx, ccy] = P(a1, r1), [dx, dy] = P(a1, r0);
    const v = max > min ? (x.score - min) / (max - min) : 0;
    out += `<path class="rose-w${x === best ? ' is-best' : ''}${x.heading === selected ? ' is-sel' : ''}" data-h="${x.heading}" tabindex="0"
      d="M${ax} ${ay} L${bx} ${by} A${r1} ${r1} 0 0 1 ${ccx} ${ccy} L${dx} ${dy} A${r0} ${r0} 0 0 0 ${ax} ${ay} Z" style="fill:${heat(0.08 + v * 0.85)}"/>`;
  });
  compass.forEach((k, i) => {
    const [x, y] = P(i * 90, r1 + 11);
    out += `<text class="rose-k" x="${x}" y="${y + 4}" text-anchor="middle">${k}</text>`;
  });
  out += `<g class="rose-car" style="transform: rotate(${selected}deg); transform-origin: ${cx}px ${cy}px">
    <rect x="${cx - 11}" y="${cy - 20}" width="22" height="40" rx="7"/><rect class="rose-ws" x="${cx - 8}" y="${cy - 12}" width="16" height="6" rx="2"/>
    <path class="rose-nose" d="M${cx} ${cy - 34} l6 9 h-12 Z"/></g>`;
  out += '</svg>';
  return out;
}

// ---------- Bronzlaşma: oturan kişi (önden) ----------
const SKIN = [[0, [236, 205, 178]], [0.35, [214, 160, 116]], [0.7, [226, 116, 88]], [1, [184, 52, 42]]];
export function tanColor(v) {
  for (let i = 1; i < SKIN.length; i++) {
    if (v <= SKIN[i][0]) {
      const f = (v - SKIN[i - 1][0]) / (SKIN[i][0] - SKIN[i - 1][0]);
      return `rgb(${SKIN[i - 1][1].map((c, k) => Math.round(c + (SKIN[i][1][k] - c) * f)).join(',')})`;
    }
  }
  return 'rgb(184,52,42)';
}
// Önden görünüş: kişinin solu görselin sağında.
export function tanFigure(level, names) {
  const c = (k) => tanColor(level[k] || 0);
  const tt = (k) => `<title>${escapeHtml(names[k])}: %${Math.round((level[k] || 0) * 100)}</title>`;
  return `<svg class="tan-fig" viewBox="0 0 200 230" role="img">
    <rect class="tan-seat" x="44" y="70" width="112" height="150" rx="22"/>
    <path class="tan-p" d="M100 4 a26 26 0 0 0 -26 26 v4 h52 v-4 a26 26 0 0 0 -26 -26 Z" style="fill:${c('head')}">${tt('head')}</path>
    <path class="tan-p" d="M74 34 v6 a26 26 0 0 0 26 26 V34 Z" style="fill:${c('faceR')}">${tt('faceR')}</path>
    <path class="tan-p" d="M126 34 v6 a26 26 0 0 1 -26 26 V34 Z" style="fill:${c('faceL')}">${tt('faceL')}</path>
    <rect class="tan-p" x="90" y="62" width="20" height="14" rx="4" style="fill:${c('neck')}">${tt('neck')}</rect>
    <path class="tan-shirt" d="M66 80 Q100 70 134 80 L140 150 H60 Z"/>
    <path class="tan-p" d="M66 82 Q50 86 46 104 L38 160 Q37 170 46 171 Q54 171 55 162 L64 112 Z" style="fill:${c('armR')}">${tt('armR')}</path>
    <path class="tan-p" d="M134 82 Q150 86 154 104 L162 160 Q163 170 154 171 Q146 171 145 162 L136 112 Z" style="fill:${c('armL')}">${tt('armL')}</path>
    <path class="tan-p" d="M60 150 H140 L144 196 Q144 206 134 206 H66 Q56 206 56 196 Z" style="fill:${c('lap')}">${tt('lap')}</path>
    <text class="tan-side" x="16" y="128">${escapeHtml(names.right)}</text>
    <text class="tan-side" x="184" y="128" text-anchor="end">${escapeHtml(names.left)}</text>
  </svg>`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
