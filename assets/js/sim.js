// Yolculuk simülasyonu ve ondan çıkan eğlenceli analizler.
import { sunPosition } from './sun.js';
import { buildCabin, exposure, wrap180 } from './model.js';
import { weatherAt } from './weather.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function simulate({ samples, depart, car, opts, weather, detail = true }) {
  const cabin = buildCabin(car, opts);
  const { seatKeys } = cabin;
  const dose = seatKeys.map(() => 0);
  const points = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const ms = depart + s.t * 1000;
    const sun = sunPosition(ms, s.lat, s.lng);
    const w = weatherAt(weather, ms, s.lat, s.lng);
    const rel = wrap180(sun.azimuth - s.heading);
    const e = exposure(cabin, rel, sun.altitude, w ? w.cloud : 0);
    const dtMin = i < samples.length - 1 ? (samples[i + 1].t - s.t) / 60 : 0;
    for (let k = 0; k < dose.length; k++) dose[k] += e.seats[k] * dtMin;
    if (detail) {
      points.push({
        ...s, ms, dtMin,
        sunAz: sun.azimuth, sunAlt: sun.altitude, rel,
        seats: e.seats, win: e.win, intensity: e.intensity,
        cloud: w ? w.cloud : null, uv: w ? w.uv : null, temp: w ? w.temp : null,
      });
    }
  }
  return { seatKeys, dose, points };
}

// Güneş nerede? Arabaya göre kaba yön.
export function sunSide(rel, alt) {
  if (alt <= 0) return 'none';
  if (alt >= 62) return 'top';
  const a = Math.abs(rel);
  if (a <= 30) return 'front';
  if (a >= 150) return 'back';
  return rel > 0 ? 'right' : 'left';
}

// Alçak güneş tam karşıdaysa göz kamaşır; tam arkadaysa ayna parlar.
export function findGlare(points) {
  // Virajlarda kısa kesintiler olur; 8 dakikadan kısa boşlukla ayrılan parçalar tek olay sayılır.
  const GAP = 8 * 6e4;
  const out = [];
  let cur = null;
  const flush = () => { if (cur && cur.minutes >= 2) out.push(cur); cur = null; };
  for (const p of points) {
    let kind = null;
    if (p.sunAlt > 0 && p.sunAlt <= 20 && Math.abs(p.rel) <= 30 && (p.cloud == null || p.cloud < 0.85)) kind = 'front';
    else if (p.sunAlt > 0 && p.sunAlt <= 15 && Math.abs(p.rel) >= 150 && (p.cloud == null || p.cloud < 0.85)) kind = 'mirror';
    if (cur && p.ms - cur.end > GAP) flush();
    if (!kind) continue;
    if (cur && cur.kind !== kind) flush();
    if (cur) { cur.end = p.ms; cur.minutes += p.dtMin; }
    else cur = { kind, start: p.ms, end: p.ms, minutes: p.dtMin, km: p.dist / 1000 };
  }
  flush();
  return out;
}

// Yolda gün doğumu / batımı var mı?
export function findTwilight(points) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].sunAlt, b = points[i].sunAlt;
    if (a < 0 && b >= 0) out.push({ kind: 'rise', ms: points[i].ms });
    if (a >= 0 && b < 0) out.push({ kind: 'set', ms: points[i].ms });
  }
  return out;
}

// Şoförün sol kolu: sol ön camdan giren ışık, UV ile ağırlıklı.
export function armIndex(points, car, opts) {
  let dose = 0;
  for (const p of points) {
    const uv = p.uv == null ? 1 : clamp(p.uv / 5, 0.15, 2);
    let w = p.win.fl;
    if (car.roof === 'soft' && opts.roofOpen) w = Math.max(w, p.intensity * 0.9);
    dose += w * uv * p.dtMin;
  }
  return clamp(dose / 9, 0, 10);
}

// Klimasız ya da üstü açık arabalar için ter tahmini (litre). Tamamen eğlence amaçlı.
export function sweatLiters(points, durationSec) {
  if (!points.length) return { liters: 0, temp: null };
  let exp = 0, temps = 0, tn = 0, tw = 0;
  for (const p of points) {
    const avg = p.seats.reduce((a, b) => a + b, 0) / p.seats.length;
    exp += avg * p.dtMin; tw += p.dtMin;
    if (p.temp != null) { temps += p.temp; tn++; }
  }
  const avgExp = tw ? exp / tw : 0;
  const temp = tn ? temps / tn : null;
  const tUse = temp == null ? 24 : temp;
  const hours = durationSec / 3600;
  const liters = hours * (0.12 + 0.55 * avgExp) * clamp((tUse - 12) / 14, 0.1, 1.7);
  return { liters, temp };
}

// Kalkış saatini ±3 saat kaydırıp seçili koltuğun güneş dozunu hesaplar.
export function departureScan({ samples, depart, car, opts, weather, seat }) {
  const out = [];
  for (let off = -180; off <= 180; off += 15) {
    const r = simulate({ samples, depart: depart + off * 6e4, car, opts, weather, detail: false });
    out.push({ off, ms: depart + off * 6e4, dose: r.dose[Math.min(seat, r.dose.length - 1)] });
  }
  return out;
}

// Aile modu: sürücü sabit, gölgeciler en serin koltuklara, güneşseverler en sıcaklara.
export function seatFamily(people, dose) {
  const seats = dose.map((d, i) => ({ i, d }));
  const result = new Array(dose.length).fill(null);
  if (people[0]) result[0] = { ...people[0], seat: 0 };
  const rest = seats.slice(1).sort((a, b) => a.d - b.d);
  const riders = people.slice(1, dose.length).filter((p) => p.name.trim());
  const order = { shade: 0, any: 1, sun: 2 };
  const sorted = riders.map((p, k) => ({ ...p, k })).sort((a, b) => order[a.pref] - order[b.pref] || a.k - b.k);
  // Gölgeciler en serinden, güneşseverler en sıcaktan başlar.
  const pool = rest.slice();
  for (const p of sorted.filter((x) => x.pref === 'shade')) { const s = pool.shift(); if (s) result[s.i] = { ...p, seat: s.i }; }
  for (const p of sorted.filter((x) => x.pref === 'sun').reverse()) { const s = pool.pop(); if (s) result[s.i] = { ...p, seat: s.i }; }
  for (const p of sorted.filter((x) => x.pref === 'any')) {
    // Orta koltuk en son dolsun, kimse ortada oturmak istemez.
    const idx = pool.findIndex((s) => s.i !== 3);
    const s = idx >= 0 ? pool.splice(idx, 1)[0] : pool.shift();
    if (s) result[s.i] = { ...p, seat: s.i };
  }
  return result;
}
