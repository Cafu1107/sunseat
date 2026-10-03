// Bulut, UV ve sıcaklık: Open-Meteo (anahtarsız). Tarih aralık dışındaysa null döner, hesap açık hava varsayar.
const DAY = 864e5;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function fetchWeather(route, startMs, endMs, signal) {
  const now = Date.now();
  const maxEnd = now + 15 * DAY;
  const minStart = now - 80 * DAY;
  if (startMs > maxEnd || endMs < minStart) return null;
  const s = Math.max(startMs, minStart), e = Math.min(endMs, maxEnd);

  const n = route.coords.length;
  const pts = [];
  const count = Math.min(6, n);
  for (let k = 0; k < count; k++) pts.push(route.coords[Math.round((k / Math.max(1, count - 1)) * (n - 1))]);

  const url = 'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${pts.map((p) => p[0].toFixed(3)).join(',')}` +
    `&longitude=${pts.map((p) => p[1].toFixed(3)).join(',')}` +
    '&hourly=cloud_cover,uv_index,temperature_2m&timezone=GMT' +
    `&start_date=${iso(s)}&end_date=${iso(e)}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const j = await res.json();
    const arr = Array.isArray(j) ? j : [j];
    if (!arr.length || !arr[0].hourly) return null;
    const t0 = Date.parse(arr[0].hourly.time[0] + ':00Z');
    return { pts, t0, series: arr.map((a) => a.hourly) };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return null;
  }
}

export function weatherAt(w, ms, lat, lng) {
  if (!w) return null;
  let best = 0, bd = Infinity;
  w.pts.forEach((p, i) => {
    const d = (p[0] - lat) ** 2 + (p[1] - lng) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  const h = w.series[best];
  if (!h) return null;
  const idx = Math.max(0, Math.min(h.time.length - 1, Math.round((ms - w.t0) / 36e5)));
  const cc = h.cloud_cover[idx], uv = h.uv_index[idx], temp = h.temperature_2m[idx];
  return {
    cloud: cc == null ? 0 : cc / 100,
    uv: uv == null ? null : uv,
    temp: temp == null ? null : temp,
  };
}
