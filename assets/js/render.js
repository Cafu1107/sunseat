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
export function buildCarView(svg, car, seatLabels, compassLabels) {
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

  const glass = {};
  const rf = b.roofFrom, rt = b.roofTo;
  const inset = 7;
  // Ön cam
  glass.ws = el('path', { class: 'cv-glass', d: `M${left + 10} ${Y(rf - 0.09)} Q${cx} ${Y(rf - 0.12)} ${left + W - 10} ${Y(rf - 0.09)} L${left + W - inset - 3} ${Y(rf)} L${left + inset + 3} ${Y(rf)} Z` }, svg);
  // Arka cam
  glass.rw =el('path', { class: 'cv-glass', d: `M${left + inset + 3} ${Y(rt)} L${left + W - inset - 3} ${Y(rt)} L${left + W - 12} ${Y(rt + 0.06)} Q${cx} ${Y(rt + 0.075)} ${left + 12} ${Y(rt + 0.06)} Z` }, svg);
  // Yan camlar
  const mid = car.seats > 2 ? rf + (rt - rf) * 0.48 : rt;
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
  const sw = (W - inset * 2) * (car.seats > 2 ? 0.36 : 0.38), sh = (Y(rt) - Y(rf)) * (car.seats > 2 ? 0.34 : 0.5);
  const frontY = Y(rf) + (Y(rt) - Y(rf)) * (car.seats > 2 ? 0.08 : 0.2);
  const rearY = Y(rf) + (Y(rt) - Y(rf)) * 0.56;
  const pos = [
    [left + inset + 5, frontY, sw],
    [left + W - inset - 5 - sw, frontY, sw],
    [left + inset + 3, rearY, sw * 0.82],
    [cx - sw * 0.36, rearY, sw * 0.72],
    [left + W - inset - 3 - sw * 0.82, rearY, sw * 0.82],
  ].slice(0, car.seats);
  pos.forEach(([x, y, w], i) => {
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
  const sw = W * 0.38, sh = (rt - rf) * (car.seats > 2 ? 0.38 : 0.6);
  const fy = rf + 6, ry = rf + (rt - rf) * 0.54;
  const pos = [[x + 10, fy, sw], [x + W - 10 - sw, fy, sw], [x + 8, ry, sw * 0.8], [110 - sw * 0.34, ry, sw * 0.68], [x + W - 8 - sw * 0.8, ry, sw * 0.8]].slice(0, car.seats);
  let out = `<svg class="family-car" viewBox="0 0 220 ${L + 20}" role="img" aria-label="${labels.aria}">`;
  out += `<path class="cv-body" d="${bodyPath(x, y, W, L, car.body)}"/>`;
  pos.forEach(([sx, sy, w], i) => {
    const a = assignment[i];
    const name = a ? a.name.slice(0, w < 30 ? 3 : 6) : '';
    out += `<rect class="cv-seat" x="${sx}" y="${sy}" width="${w}" height="${sh}" rx="8" style="fill:${heat(a ? a.v : 0)}"/>`;
    out += `<text class="cv-seat-label" x="${sx + w / 2}" y="${sy + sh / 2 + 3.5}" style="font-size:${w < 30 ? 8 : 10}px${a && a.v > 0.6 ? ';fill:#fff' : ''}">${escapeHtml(name)}</text>`;
  });
  out += '</svg>';
  return out;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
