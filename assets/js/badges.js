// Gizli rozetler. Sadece bu tarayıcıda saklanır.
export const BADGES = [
  { id: 'first',    icon: 'ph-key' },
  { id: 'sunset',   icon: 'ph-sun-horizon' },
  { id: 'night',    icon: 'ph-moon-stars' },
  { id: 'long',     icon: 'ph-road-horizon' },
  { id: 'sahin',    icon: 'ph-bird' },
  { id: 'roofless', icon: 'ph-wind' },
  { id: 'tan',      icon: 'ph-fire' },
  { id: 'shade',    icon: 'ph-umbrella' },
  { id: 'family',   icon: 'ph-users-three' },
  { id: 'park',     icon: 'ph-letter-circle-p' },
  { id: 'painter',  icon: 'ph-paint-bucket' },
  { id: 'engineer', icon: 'ph-wrench' },
  { id: 'season',   icon: 'ph-snowflake' },
  { id: 'world',    icon: 'ph-globe-hemisphere-west' },
  { id: 'logo',     icon: 'ph-hand-pointing' },
];

const KEY = 'sunseat.badges';
let got;

function load() {
  if (got) return got;
  try { got = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { got = new Set(); }
  return got;
}

export const hasBadge = (id) => load().has(id);
export const badgeCount = () => load().size;

// Yeni açıldıysa true döner.
export function unlock(id) {
  const s = load();
  if (s.has(id) || !BADGES.some((b) => b.id === id)) return false;
  s.add(id);
  try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch (e) { /* gizli sekme */ }
  return true;
}
