// Rota (OSRM), adres arama (Photon) ve rota üzerinde örnekleme.
const RAD = Math.PI / 180;

export function haversine(a, b) {
  const R = 6371e3;
  const dLat = (b[0] - a[0]) * RAD, dLng = (b[1] - a[1]) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearing(a, b) {
  const p1 = a[0] * RAD, p2 = b[0] * RAD, dl = (b[1] - a[1]) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}

// En fazla 3 güzergah döner (ilki OSRM'nin önerdiği).
export async function fetchRoutes(from, to, signal) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    '?overview=full&geometries=geojson&annotations=duration,distance&steps=false&alternatives=2';
  const res = await fetch(url, { signal });
  if (res.status === 429) throw Object.assign(new Error('busy'), { code: 'busy' });
  if (!res.ok) throw Object.assign(new Error('route'), { code: 'route' });
  const j = await res.json();
  if (j.code !== 'Ok' || !j.routes || !j.routes.length) throw Object.assign(new Error('noroute'), { code: 'noroute' });
  return j.routes.slice(0, 3).map((r) => {
    const coords = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const ann = r.legs && r.legs[0] && r.legs[0].annotation;
    return prepare(coords, ann && ann.duration, ann && ann.distance, r.duration);
  });
}

function prepare(coords, durs, dists, totalDur) {
  const n = coords.length;
  const cumT = new Float64Array(n), cumD = new Float64Array(n);
  const durOk = durs && durs.length === n - 1;
  const distOk = dists && dists.length === n - 1;
  for (let i = 1; i < n; i++) cumD[i] = cumD[i - 1] + (distOk ? dists[i - 1] : haversine(coords[i - 1], coords[i]));
  for (let i = 1; i < n; i++) {
    cumT[i] = durOk ? cumT[i - 1] + durs[i - 1] : (cumD[n - 1] ? cumD[i] / cumD[n - 1] * totalDur : 0);
  }
  return { coords, cumT, cumD, duration: cumT[n - 1], distance: cumD[n - 1] };
}

function locate(arr, v) {
  let lo = 0, hi = arr.length - 1;
  if (v <= arr[0]) return [0, 0];
  if (v >= arr[hi]) return [hi - 1 < 0 ? 0 : hi - 1, 1];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid; else hi = mid;
  }
  const span = arr[hi] - arr[lo];
  return [lo, span > 0 ? (v - arr[lo]) / span : 0];
}

function lerpCoord(route, i, f) {
  const a = route.coords[i], b = route.coords[Math.min(i + 1, route.coords.length - 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

export function atDistance(route, d) {
  const [i, f] = locate(route.cumD, d);
  return lerpCoord(route, i, f);
}

export function atTime(route, t) {
  const [i, f] = locate(route.cumT, t);
  const pos = lerpCoord(route, i, f);
  const dist = route.cumD[i] + (route.cumD[Math.min(i + 1, route.cumD.length - 1)] - route.cumD[i]) * f;
  return { pos, dist };
}

// Rotayı zamana göre eşit aralıklarla örnekler. En fazla ~400 nokta.
export function sampleRoute(route) {
  const step = Math.max(20, Math.min(120, route.duration / 380));
  const out = [];
  const pushAt = (t) => {
    const { pos, dist } = atTime(route, t);
    const a = atDistance(route, Math.max(0, dist - 150));
    const b = atDistance(route, Math.min(route.distance, dist + 150));
    const heading = (a[0] === b[0] && a[1] === b[1]) ? (out.length ? out[out.length - 1].heading : 0) : bearing(a, b);
    out.push({ t, lat: pos[0], lng: pos[1], dist, heading });
  };
  for (let t = 0; t < route.duration; t += step) pushAt(t);
  pushAt(route.duration);
  return out;
}

// ---------- Adres arama ----------
// Sonuç türü: listede ikon seçmek ve sıralamak için.
function placeKind(p) {
  const k = p.osm_key, v = p.osm_value;
  if (k === 'place') {
    if (v === 'city' || v === 'town') return 'city';
    if (['village', 'hamlet', 'isolated_dwelling', 'farm'].includes(v)) return 'village';
    if (['country', 'state', 'province', 'region'].includes(v)) return 'region';
    return 'area';
  }
  if (k === 'boundary') return 'area';
  if (k === 'highway' && p.type === 'street') return 'street';
  if (!p.name && p.housenumber) return 'house';
  return 'poi';
}

function placeLabel(p) {
  const streetNo = p.street ? p.street + (p.housenumber ? ` No:${p.housenumber}` : '') : null;
  const main = p.name || streetNo || p.district || p.city || p.county || p.state || '';
  const ctx = [p.name ? streetNo : null, p.district, p.locality, p.city, p.county, p.state]
    .filter((x) => x && x !== main && !main.includes(x));
  const uniq = [...new Set(ctx)].slice(0, 3);
  return { name: main, detail: uniq.join(', ') };
}

function toPlace(f) {
  const p = f.properties || {};
  const l = placeLabel(p);
  return { name: l.name, detail: l.detail, kind: placeKind(p), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
}

// Photon köyleri bazen ilçe merkezinden önce getiriyor ("Sapanca" -> Diyarbakır'daki köy).
// Şehir/ilçe sonuçlarını biraz öne alıp aynı yerin tekrarlarını ayıklıyoruz.
export async function searchPlaces(q, lang, signal, bias) {
  let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=12` + (lang === 'en' ? '&lang=en' : '&lang=default');
  if (bias) url += `&lat=${bias.lat.toFixed(4)}&lon=${bias.lng.toFixed(4)}&zoom=${Math.round(bias.zoom)}&location_bias_scale=0.25`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('geo');
  const j = await res.json();
  const boost = { city: 3.5, region: 1, area: 0.5 };
  const seen = new Set();
  return (j.features || [])
    .map((f, i) => ({ ...toPlace(f), score: i - (boost[placeKind(f.properties || {})] || 0) }))
    .filter((p) => p.name)
    .sort((a, b) => a.score - b.score)
    .filter((p) => {
      const key = `${p.kind === 'street' ? 'st' : p.kind}|${p.name}|${p.detail.split(',').slice(0, 2).join(',')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 7);
}

export async function reversePlace(lat, lng, lang) {
  try {
    const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1` + (lang === 'en' ? '&lang=en' : '&lang=default');
    const res = await fetch(url);
    const j = await res.json();
    const f = j.features && j.features[0];
    if (f) {
      const p = toPlace(f);
      if (p.name) return { name: p.name, detail: p.detail };
    }
  } catch (e) { /* koordinatla devam */ }
  return { name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, detail: '' };
}
