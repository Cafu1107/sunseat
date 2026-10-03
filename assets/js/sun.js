// Güneşin konumu. Vladimir Agafonkin'in SunCalc (BSD-2) formüllerinden sadeleştirildi.
// Dönüş: azimuth = kuzeyden saat yönünde derece, altitude = ufuktan derece.

const RAD = Math.PI / 180;
const E = RAD * 23.4397; // eksen eğikliği

function toDays(ms) {
  return ms / 864e5 - 0.5 + 2440588 - 2451545;
}

export function sunPosition(ms, lat, lng) {
  const d = toDays(ms);
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(E) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(E), Math.cos(L));
  const phi = RAD * lat;
  const H = RAD * (280.16 + 360.9856235 * d) + RAD * lng - ra;

  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  let alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));

  // Atmosferik kırılma: ufka yakın güneş biraz daha yukarıda görünür.
  const h = alt / RAD;
  if (h > -1) alt += RAD * (1.02 / Math.tan(RAD * (h + 10.3 / (h + 5.11)))) / 60;

  return { azimuth: ((az / RAD) + 180 + 360) % 360, altitude: alt / RAD };
}

// Belirli bir yerde, verilen zamanın içinde olduğu yerel günün gün doğumu / batımı (dakika hassasiyetinde).
export function sunTimes(ms, lat, lng) {
  const start = new Date(ms);
  start.setHours(0, 0, 0, 0);
  let rise = null, set = null;
  let prev = sunPosition(start.getTime(), lat, lng).altitude;
  for (let m = 2; m <= 24 * 60; m += 2) {
    const t = start.getTime() + m * 6e4;
    const alt = sunPosition(t, lat, lng).altitude;
    if (prev < -0.833 && alt >= -0.833 && rise === null) rise = t;
    if (prev >= -0.833 && alt < -0.833) set = t;
    prev = alt;
  }
  return { rise, set };
}
