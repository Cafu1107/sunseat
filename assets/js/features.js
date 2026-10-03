// Ek kartlar: kabin sıcaklığı, bronzlaşma, mevsimler, rozetler, park sonuçları.
import { t, locale, getLang } from './i18n.js';
import { COLORS, colorById } from './cars.js';
import { tripCabin } from './cabin.js';
import { tanMap, PARTS } from './tan.js';
import { seasonScan } from './sim.js';
import { BADGES, hasBadge, badgeCount } from './badges.js';
import { heat, lineChart, attachLineHover, tanFigure, parkRose, escapeHtml } from './render.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const seatText = (key, mid) => { const s = t('seat.' + key); return mid ? s.toLocaleLowerCase(locale()) : s; };
const r0 = (v) => Math.round(v);

// Grafiği en fazla ~160 noktaya indir (çizgi pürüzsüz kalır, DOM hafif).
function thin(arr, max = 160) {
  if (arr.length <= max) return arr.map((v, i) => [v, i]);
  const out = [];
  const step = (arr.length - 1) / (max - 1);
  for (let k = 0; k < max; k++) { const i = Math.round(k * step); out.push([arr[i], i]); }
  return out;
}

// ---------- Kabin sıcaklığı ----------
let cabinChart = null, cabinIdxMap = null;
export function renderCabin({ points, car, colorId }) {
  const color = colorById(colorId);
  const cur = tripCabin(points, color.abs);
  const black = tripCabin(points, COLORS[COLORS.length - 1].abs);
  const white = tripCabin(points, COLORS[0].abs);
  let diff = 0;
  black.temps.forEach((v, i) => { diff = Math.max(diff, v - white.temps[i]); });

  const th = thin(cur.temps);
  cabinIdxMap = th.map(([, i]) => i);
  const outT = cabinIdxMap.map((i) => (points[i].temp != null ? points[i].temp : 24));
  const series = [
    { values: th.map(([v]) => v), cls: 'hot', label: t('cabin.cabin') },
    { values: outT, cls: 'cool', label: t('cabin.out'), dash: true },
  ];
  cabinChart = lineChart({ series, xLabels: [fmtTime(points[0].ms), fmtTime(points[points.length - 1].ms)] });
  const box = $('cabinChart');
  box.innerHTML = `<div class="legend-row"><span><i class="hot"></i>${t('cabin.cabin')}</span><span><i class="cool"></i>${t('cabin.out')}</span></div>
    ${cabinChart.html}<div class="lc-tip" hidden></div>`;
  attachLineHover(box, cabinChart, series, (k) => {
    const i = cabinIdxMap[k];
    return t('cabin.tip', { time: fmtTime(points[i].ms), t: r0(series[0].values[k]), o: r0(series[1].values[k]) });
  });
  $('cabinSub').textContent = t(car.ac ? 'cabin.subAc' : 'cabin.subNoAc');
  $('cabinFoot').textContent = `${t('cabin.foot', { color: color.name[document.documentElement.lang] || color.name.tr, d: diff.toFixed(1) })}${cur.assumedTemp ? ' ' + t('cabin.assumed') : ''}`;
}

// Kaydırıcı ile grafikteki dikey çizgiyi taşı.
export function moveCabinMarker(idx) {
  if (!cabinChart || !cabinIdxMap) return;
  const svg = document.querySelector('#cabinChart svg.lc');
  if (!svg) return;
  let k = 0;
  while (k < cabinIdxMap.length - 1 && cabinIdxMap[k + 1] <= idx) k++;
  let m = svg.querySelector('.lc-marker');
  if (!m) {
    m = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    m.setAttribute('class', 'lc-marker');
    m.setAttribute('y1', cabinChart.pad.t);
    m.setAttribute('y2', 150 - cabinChart.pad.b);
    svg.insertBefore(m, svg.querySelector('.lc-hit'));
  }
  const x = cabinChart.X(k);
  m.setAttribute('x1', x); m.setAttribute('x2', x);
}

// ---------- Bronzlaşma haritası ----------
export function renderTan({ points, car, opts, seatIdx, seatKey }) {
  const r = tanMap(points, car, opts, seatIdx);
  const names = Object.fromEntries(PARTS.map((k) => [k, t('tan.n.' + k)]));
  names.left = t('tan.left'); names.right = t('tan.right');
  $('tanFig').innerHTML = tanFigure(r.level, names);
  const seat = seatText(seatKey, getLang() === 'en');
  $('tanWho').innerHTML = r.level[r.top] < 0.08
    ? escapeHtml(t('tan.none', { seat }))
    : t('tan.who', { seat: escapeHtml(seat), part: escapeHtml(t('tan.p.' + r.top)) });
  $('tanSpf').innerHTML = `<i class="ph ph-drop-half"></i><span>${escapeHtml(t('spf.' + r.spf))}</span>`;
  return r;
}

// ---------- Dört mevsim ----------
const SEASON_ICON = { spring: 'ph-flower-tulip', summer: 'ph-sun', autumn: 'ph-leaf', winter: 'ph-snowflake' };
export function renderSeason({ samples, depart, car, opts, seatKeys, totalMin, mySeat }) {
  // Seçilen gün de açık havayla hesaplanır ki sütunlar karşılaştırılabilir olsun.
  const all = seasonScan({ samples, depart, car, opts, withChosen: true });
  const scan = all.filter((c) => c.id !== 'chosen');
  const cols = all;
  const name = (c) => (c.id === 'chosen' ? t('season.chosen') : t('season.' + c.id));
  let html = `<thead><tr><th></th>${cols.map((c) => `<th scope="col">${c.id === 'chosen' ? '<i class="ph ph-calendar-check"></i>' : `<i class="ph ${SEASON_ICON[c.id]}"></i>`}${escapeHtml(name(c))}</th>`).join('')}</tr></thead><tbody>`;
  seatKeys.forEach((k, i) => {
    html += `<tr class="${i === mySeat ? 'is-mine' : ''}"><th scope="row" class="row">${escapeHtml(t('seat.' + k))}</th>`;
    cols.forEach((c) => {
      const v = totalMin ? c.dose[i] / totalMin : 0;
      html += `<td class="${v > 0.6 ? 'hot' : ''}" style="background:${heat(v)}" title="${escapeHtml(t('season.cell', { seat: t('seat.' + k), season: name(c), min: r0(c.dose[i]) }))}">${r0(c.dose[i])}</td>`;
    });
    html += '</tr>';
  });
  $('seasonTable').innerHTML = html + '</tbody>';
  let best = scan[0];
  scan.forEach((s) => { if (s.dose[mySeat] > best.dose[mySeat]) best = s; });
  $('seasonSub').innerHTML = best.dose[mySeat] < 2
    ? escapeHtml(t('season.none'))
    : t('season.sub', { season: escapeHtml(t('season.' + best.id).toLocaleLowerCase(locale())), seat: escapeHtml(seatText(seatKeys[mySeat], false)), min: r0(best.dose[mySeat]) });
}

// ---------- Rozetler ----------
export function renderBadges(fresh) {
  $('badgeCount').textContent = `${badgeCount()}/${BADGES.length}`;
  $('badgeList').innerHTML = BADGES.map((b) => {
    const on = hasBadge(b.id);
    const [n, d] = t('badge.' + b.id);
    return `<li class="badge-i${on ? ' on' : ''}${b.id === fresh ? ' fresh' : ''}" tabindex="0" aria-label="${escapeHtml(on ? n : t('badges.locked'))}">
      <i class="ph${on ? '-fill' : ''} ${on ? b.icon : 'ph-lock-simple'}"></i>
      <span class="tipx">${on ? `<b>${escapeHtml(n)}</b>` : `<b>${escapeHtml(t('badges.locked'))}</b>`}${escapeHtml(d)}</span></li>`;
  }).join('');
}

// ---------- Park ----------
export function dirName(deg) { return t('dirs')[Math.round(deg / 45) % 8]; }

export function renderPark({ res, hours, onPreview }) {
  const { best, worst, list, daylight } = res;
  const pct = worst.wheel > 0 ? r0((1 - best.wheel / worst.wheel) * 100) : 0;
  if (!daylight || worst.score < 1) {
    $('parkTitle').textContent = t('park.nightTitle');
    $('parkSub').textContent = t('park.nightSub');
  } else {
    $('parkTitle').innerHTML = t('park.title', { dir: escapeHtml(dirName(best.heading)) });
    $('parkSub').textContent = pct < 15 ? t('park.subSame', { pct }) : t('park.sub', { h: hours, pct });
  }
  const meta = [
    [t('park.metaOut'), `${r0(res.tOut)}°C`],
    [t('park.metaUntil'), fmtTime(res.times[res.times.length - 1] + 5 * 6e4)],
    [t('park.metaBest'), `${r0(best.final)}°C`],
    [t('park.metaWorst'), `${r0(worst.final)}°C`],
  ];
  $('parkMeta').innerHTML = meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');

  const compassK = [0, 2, 4, 6].map((i) => t('compass')[i]);
  const box = $('parkRose');
  const draw = (sel) => {
    box.innerHTML = parkRose(list, best, compassK, sel);
    box.querySelectorAll('.rose-w').forEach((w) => {
      const h = Number(w.dataset.h);
      const pick = () => preview(h);
      w.addEventListener('pointerenter', pick);
      w.addEventListener('focus', pick);
      w.addEventListener('click', pick);
    });
  };
  const preview = (h) => {
    const r = list.find((x) => x.heading === h);
    const car = box.querySelector('.rose-car');
    if (car) car.style.transform = `rotate(${h}deg)`;
    box.querySelectorAll('.rose-w').forEach((w) => w.classList.toggle('is-sel', Number(w.dataset.h) === h));
    $('roseRead').innerHTML = t('park.read', { dir: escapeHtml(dirName(h)), deg: h, wheel: r0(r.wheel), temp: r0(r.final) });
    if (onPreview) onPreview(h);
  };
  draw(best.heading);
  preview(best.heading);

  // Sıcaklık: en iyi ve en kötü yön.
  const series = [
    { values: worst.temps, cls: 'hot', label: t('park.worst') },
    { values: best.temps, cls: 'cool', label: t('park.best') },
  ];
  const chart = lineChart({ series, xLabels: [fmtTime(res.times[0]), fmtTime(res.times[res.times.length - 1])], ref: { value: res.tOut, label: t('park.out') } });
  const cb = $('parkChart');
  cb.innerHTML = `<div class="legend-row"><span><i class="cool"></i>${t('park.best')}</span><span><i class="hot"></i>${t('park.worst')}</span><span><i class="ref"></i>${t('park.out')}</span></div>
    ${chart.html}<div class="lc-tip" hidden></div>`;
  attachLineHover(cb, chart, series, (i) => t('park.tip', { time: fmtTime(res.times[i]), b: r0(best.temps[i]), w: r0(worst.temps[i]) }));
  $('parkTempSub').textContent = t('park.tempSub', { best: dirName(best.heading), tb: r0(best.final), worst: dirName(worst.heading), tw: r0(worst.final) });
  $('parkFoot').textContent = t('park.foot') + (res.assumedTemp ? ' ' + t('cabin.assumed') : '');
}
