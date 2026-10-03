// Kabin ışık modeli.
// Araba koordinatları: x sağa, y ileri, z yukarı. Güneş yönü (rel) arabanın burnuna göre saat yönünde derece.
import { BODIES } from './cars.js';

const RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

export const SEAT_KEYS = ['driver', 'passenger', 'rearLeft', 'rearMid', 'rearRight'];
export const WINDOW_KEYS = ['ws', 'fl', 'fr', 'rl', 'rr', 'rw', 'roof'];

// Hangi camdan giren ışık hangi koltuğa ne kadar düşer (yakın taraf).
const NEAR = {
  driver:    { ws: 1,   fl: 1,   fr: 0,   rl: 0.12, rr: 0,    rw: 0.1,  roof: 1 },
  passenger: { ws: 1,   fl: 0,   fr: 1,   rl: 0,    rr: 0.12, rw: 0.1,  roof: 1 },
  rearLeft:  { ws: 0.28, fl: 0.15, fr: 0, rl: 1,    rr: 0,    rw: 0.6,  roof: 1 },
  rearMid:   { ws: 0.4, fl: 0.06, fr: 0.06, rl: 0.45, rr: 0.45, rw: 0.75, roof: 1 },
  rearRight: { ws: 0.28, fl: 0,  fr: 0.15, rl: 0,   rr: 1,    rw: 0.6,  roof: 1 },
};
// Kabini boydan boya geçmesi gereken ışık: sadece alçak güneş başarır.
const FAR = {
  driver:    { fr: 0.35, rr: 0.08 },
  passenger: { fl: 0.35, rl: 0.08 },
  rearLeft:  { rr: 0.35, fr: 0.08 },
  rearMid:   {},
  rearRight: { rl: 0.35, fl: 0.08 },
};

export function buildCabin(car, opts) {
  const b = BODIES[car.body];
  const film = 1 - (opts.tint || 0) / 100;
  const rake = b.wsRake * RAD;
  const side = (s) => norm([s * Math.cos(10 * RAD), 0, Math.sin(10 * RAD)]);
  const rearT = (car.privacy ? 0.3 : 0.8) * film;
  const topless = car.roof === 'soft' && opts.roofOpen;
  const hasRear = car.seats > 2;

  let roofT = 0;
  if (car.roof === 'pano') roofT = opts.roofOpen ? 0.2 : 0.03;
  if (car.roof === 'glass') roofT = 0.12;
  if (topless) roofT = 1;

  const sideMax = topless ? 90 : b.sideMax;
  const windows = {
    ws:   { n: [0, Math.cos(rake), Math.sin(rake)], T: 0.72, max: topless ? 90 : 76, k: 1 },
    fl:   { n: side(-1), T: 0.8 * film, max: sideMax, k: b.glass },
    fr:   { n: side(1),  T: 0.8 * film, max: sideMax, k: b.glass },
    rl:   { n: side(-1), T: hasRear ? rearT : 0, max: sideMax, k: b.glass },
    rr:   { n: side(1),  T: hasRear ? rearT : 0, max: sideMax, k: b.glass },
    rw:   { n: norm(b.rw), T: topless ? 0 : rearT, max: b.rwMax, k: 1 },
    roof: { n: [0, 0, 1], T: roofT, max: 91, k: 1 },
  };
  return { windows, seatKeys: SEAT_KEYS.slice(0, car.seats) };
}

// Güneşin doğrudan ışınım şiddeti (0..1). Kaba bir hava kütlesi yaklaşımı.
export function sunIntensity(alt, cloud = 0) {
  if (alt <= 0) return 0;
  return Math.pow(Math.sin(alt * RAD), 0.35) * clamp(alt / 3, 0, 1) * (1 - 0.75 * clamp(cloud, 0, 1));
}

export function exposure(cabin, rel, alt, cloud = 0) {
  const { windows, seatKeys } = cabin;
  const seats = new Array(seatKeys.length).fill(0);
  const win = {};
  const I = sunIntensity(alt, cloud);
  if (I <= 0) {
    for (const k of WINDOW_KEYS) win[k] = 0;
    return { seats, win, intensity: 0 };
  }
  const a = alt * RAD, r = rel * RAD;
  const d = [Math.sin(r) * Math.cos(a), Math.cos(r) * Math.cos(a), Math.sin(a)];
  const low = clamp(1 - alt / 35, 0, 1);

  for (const k of WINDOW_KEYS) {
    const w = windows[k];
    const dot = w.n[0] * d[0] + w.n[1] * d[1] + w.n[2] * d[2];
    if (dot <= 0 || w.T <= 0) { win[k] = 0; continue; }
    const cut = clamp((w.max - alt) / 18, 0, 1);
    win[k] = I * w.T * w.k * Math.min(1, dot * 1.25) * cut;
  }
  seatKeys.forEach((s, i) => {
    let v = 0;
    for (const k of WINDOW_KEYS) v += win[k] * ((NEAR[s][k] || 0) + (FAR[s][k] || 0) * low);
    seats[i] = clamp(v, 0, 1);
  });
  return { seats, win, intensity: I };
}

export const wrap180 = (a) => ((a % 360) + 540) % 360 - 180;
