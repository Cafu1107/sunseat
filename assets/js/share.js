// 1080x1350 paylaşım kartı (Instagram dikey). Saf canvas, dış kütüphane yok.
import { heat } from './render.js';

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function makeShareCard(d) {
  try { await document.fonts.ready; } catch (e) { /* yoksa sistem fontu */ }
  const W = 1080, H = 1350, P = 84;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const display = '"Bricolage Grotesque", "Onest", sans-serif';
  const mono = '"JetBrains Mono", monospace';
  const body = '"Onest", sans-serif';

  // Zemin: asfalt
  ctx.fillStyle = '#16191c';
  ctx.fillRect(0, 0, W, H);
  // İnce doku
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = i % 2 ? '#fff' : '#000';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  ctx.globalAlpha = 1;

  // Logo
  const lx = P + 30, ly = P + 30;
  ctx.save();
  ctx.beginPath(); ctx.rect(lx - 40, ly - 40, 80, 46); ctx.clip();
  ctx.fillStyle = '#f5b800';
  ctx.beginPath(); ctx.arc(lx, ly + 6, 18, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#eef1f3'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(lx, ly, 31, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx - 30, ly + 9); ctx.lineTo(lx + 30, ly + 9); ctx.moveTo(lx, ly + 9); ctx.lineTo(lx, ly + 30); ctx.stroke();
  ctx.fillStyle = '#eef1f3';
  ctx.font = `800 44px ${display}`;
  ctx.fillText('Sunseat', lx + 52, ly + 15);

  // Başlık
  ctx.fillStyle = '#98a2ab';
  ctx.font = `500 30px ${body}`;
  ctx.fillText(d.question, P, 240);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 82px ${display}`;
  const lines = wrap(ctx, d.title, W - P * 2).slice(0, 2);
  lines.forEach((l, i) => ctx.fillText(l, P, 330 + i * 88));
  let y = 330 + lines.length * 88;
  ctx.fillStyle = '#b9c1c8';
  ctx.font = `500 30px ${mono}`;
  ctx.fillText(d.sub, P, y + 4);
  y += 70;

  // Koltuk listesi
  const maxDose = Math.max(...d.seats.map((s) => s.dose), 1);
  d.seats.forEach((s, i) => {
    const rowY = y + i * 96;
    ctx.fillStyle = heat(s.avg);
    roundRect(ctx, P, rowY, 64, 64, 14); ctx.fill();
    ctx.fillStyle = s.avg > 0.6 ? '#fff' : '#16191c';
    ctx.font = `700 22px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(s.avg * 100)}%`, P + 32, rowY + 40);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#eef1f3';
    ctx.font = `600 36px ${body}`;
    ctx.fillText(s.name, P + 92, rowY + 44);
    // Doza göre kısa çizgi (iz yok, sadece dolgu)
    const bw = 300 * (s.dose / maxDose);
    ctx.fillStyle = heat(Math.max(0.2, s.avg));
    roundRect(ctx, W - P - 300 - 150, rowY + 26, Math.max(6, bw), 12, 6); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 34px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(s.dose)} ${d.minLabel}`, W - P, rowY + 46);
    ctx.textAlign = 'left';
  });
  y += d.seats.length * 96 + 30;

  // Hüküm
  ctx.fillStyle = '#f5b800';
  ctx.font = `800 46px ${display}`;
  wrap(ctx, d.verdict, W - P * 2).slice(0, 2).forEach((l, i) => ctx.fillText(l, P, y + 40 + i * 54));

  // Şerit çizgisi ve adres
  ctx.fillStyle = '#f5b800';
  for (let x = 0; x < W; x += 76) ctx.fillRect(x, H - 64, 46, 8);
  ctx.fillStyle = '#98a2ab';
  ctx.font = `500 26px ${mono}`;
  ctx.fillText(d.url, P, H - 100);

  return new Promise((res) => c.toBlob(res, 'image/png'));
}
