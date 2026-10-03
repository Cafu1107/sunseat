// Kabin sıcaklığı: birinci dereceden ısınma modeli. Eğlence amaçlı kaba tahmin.
// Isı yükü S (0..1) = camlardan giren güneş + kaportanın soğurduğu güneş (renge bağlı).
// Denge sıcaklığı = dış hava + rise * S, kabin bu dengeye tau dakikalık zaman sabitiyle yaklaşır.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RAD = Math.PI / 180;

export const CABIN_MODES = {
  park:  { rise: 30, tau: 22 }, // camlar kapalı, park halinde
  drive: { rise: 13, tau: 10 }, // klima kapalı, fan / camlar aralık
};

export function heatLoad(win, intensity, alt, absorb) {
  let glass = 0;
  for (const k in win) glass += win[k] || 0;
  const body = absorb * intensity * (0.6 * Math.max(0, Math.sin(alt * RAD)) + 0.4);
  return clamp(0.62 * Math.min(1, glass / 1.1) + 0.38 * body, 0, 1);
}

// steps: [{ dtMin, load, tOut }]. Dönüş: her adımdaki kabin sıcaklığı.
export function integrate(steps, mode, startTemp) {
  const { rise, tau } = CABIN_MODES[mode];
  let T = startTemp != null ? startTemp : (steps[0] ? steps[0].tOut : 24);
  return steps.map((s) => {
    const eq = s.tOut + rise * s.load;
    T += (eq - T) * (1 - Math.exp(-s.dtMin / tau));
    return T;
  });
}

// Yolculuk boyunca "klima kapalı olsaydı" kabin sıcaklığı.
export function tripCabin(points, absorb) {
  const steps = points.map((p, i) => ({
    dtMin: i ? points[i - 1].dtMin : 0,
    load: heatLoad(p.win, p.intensity, p.sunAlt, absorb),
    tOut: p.temp != null ? p.temp : 24,
  }));
  const temps = integrate(steps, 'drive');
  return { temps, max: Math.max(...temps), assumedTemp: points.every((p) => p.temp == null) };
}
