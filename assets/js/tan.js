// Bronzlaşma haritası: seçili koltukta oturan kişinin hangi tarafına güneş vuruyor?
// Cam UVB'nin çoğunu keser; bu harita "nereye vurduğunu" gösterir, gerçek yanık riski daha düşüktür.
import { buildCabin, seatContrib } from './model.js';

const RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Açık havada kaba UV indeksi tahmini (bulut ayrı).
export const uvEstimate = (alt) => (alt <= 0 ? 0 : 12 * Math.pow(Math.sin(alt * RAD), 2.5));

export const PARTS = ['faceL', 'faceR', 'armL', 'armR', 'lap', 'neck', 'head'];

export function tanMap(points, car, opts, seatIndex) {
  const cabin = buildCabin(car, opts);
  const seatKey = cabin.seatKeys[Math.min(seatIndex, cabin.seatKeys.length - 1)];
  const dose = Object.fromEntries(PARTS.map((p) => [p, 0]));
  let uvMax = 0;
  for (const p of points) {
    if (p.sunAlt <= 0) continue;
    const uv = p.uv != null ? p.uv : uvEstimate(p.sunAlt) * (1 - 0.6 * (p.cloud || 0));
    uvMax = Math.max(uvMax, uv);
    const u = clamp(uv / 6, 0.1, 2) * p.dtMin;
    const c = seatContrib(cabin, seatKey, p.win, p.sunAlt);
    const left = c.fl + c.rl, right = c.fr + c.rr;
    dose.armL += left * u;
    dose.armR += right * u;
    dose.faceL += (left * 0.7 + c.ws * 0.45) * u;
    dose.faceR += (right * 0.7 + c.ws * 0.45) * u;
    dose.lap += (c.ws * 0.8 + c.roof * 0.6 + (left + right) * 0.25) * u;
    dose.neck += (c.rw * 1 + c.roof * 0.3) * u;
    dose.head += (c.roof * 1 + c.ws * 0.15) * u;
  }
  const level = Object.fromEntries(PARTS.map((k) => [k, clamp(dose[k] / 28, 0, 1)]));
  const top = PARTS.reduce((a, k) => (level[k] > level[a] ? k : a), PARTS[0]);
  const roofless = car.roof === 'soft' && opts.roofOpen;
  let spf;
  if (roofless) spf = uvMax >= 6 ? 'spf50' : uvMax >= 3 ? 'spf30' : uvMax > 0.5 ? 'spf15' : 'none';
  else spf = level[top] > 0.45 ? 'glass30' : 'glassNone';
  return { level, top, uvMax, spf };
}
