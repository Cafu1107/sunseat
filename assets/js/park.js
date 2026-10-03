// Park modu: arabanın burnunu hangi yöne çevirirsen direksiyon ve koltuklar en az güneş alır?
import { sunPosition } from './sun.js';
import { buildCabin, exposure, wrap180 } from './model.js';
import { weatherAt } from './weather.js';
import { heatLoad, integrate } from './cabin.js';

const STEP_MIN = 10;

export function parkScan({ lat, lng, start, hours, car, opts, weather, absorb }) {
  const cabin = buildCabin(car, opts);
  const n = Math.max(1, Math.round(hours * 60 / STEP_MIN));
  // Güneş ve hava, yönden bağımsız: bir kez hesapla.
  const sky = [];
  for (let i = 0; i < n; i++) {
    const ms = start + (i + 0.5) * STEP_MIN * 6e4;
    const sun = sunPosition(ms, lat, lng);
    const w = weatherAt(weather, ms, lat, lng);
    sky.push({ ms, sun, cloud: w ? w.cloud : 0, tOut: w && w.temp != null ? w.temp : 24 });
  }
  const list = [];
  for (let h = 0; h < 360; h += 15) {
    let wheel = 0, seats = 0;
    const steps = sky.map((s) => {
      const e = exposure(cabin, wrap180(s.sun.azimuth - h), s.sun.altitude, s.cloud);
      wheel += e.win.ws * STEP_MIN;
      seats += (e.seats.reduce((a, b) => a + b, 0) / e.seats.length) * STEP_MIN;
      return { dtMin: STEP_MIN, load: heatLoad(e.win, e.intensity, s.sun.altitude, absorb), tOut: s.tOut };
    });
    const temps = integrate(steps, 'park', sky[0].tOut);
    list.push({ heading: h, wheel, seats, score: wheel + 0.6 * seats, temps, final: temps[temps.length - 1], max: Math.max(...temps) });
  }
  let best = list[0], worst = list[0];
  for (const r of list) {
    if (r.score < best.score) best = r;
    if (r.score > worst.score) worst = r;
  }
  const daylight = sky.some((s) => s.sun.altitude > 0);
  return {
    list, best, worst, daylight,
    tOut: sky.reduce((a, s) => a + s.tOut, 0) / sky.length,
    assumedTemp: !weather,
    times: sky.map((s) => s.ms),
  };
}
