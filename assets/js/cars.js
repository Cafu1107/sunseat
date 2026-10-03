// Kasa tipleri: ışığın kabine nasıl girdiğini belirleyen kaba geometri.
// wsRake: ön camın dikeyden yatıklığı (derece). sideMax: yan camdan güneşin hâlâ koltuğa ulaştığı en yüksek güneş açısı.
// glass: cam alanı çarpanı. rw: arka cam normali [x, y, z]. len/wid: üstten çizimde oranlar.
export const BODIES = {
  sedan:    { wsRake: 60, sideMax: 52, glass: 1.0,  rw: [0, -0.55, 0.83], rwMax: 62, len: 1.0,  wid: 1.0,  roofFrom: 0.33, roofTo: 0.70 },
  hatch:    { wsRake: 58, sideMax: 52, glass: 0.95, rw: [0, -0.85, 0.53], rwMax: 58, len: 0.88, wid: 0.97, roofFrom: 0.33, roofTo: 0.80 },
  station:  { wsRake: 60, sideMax: 54, glass: 1.08, rw: [0, -0.94, 0.34], rwMax: 52, len: 1.06, wid: 1.0,  roofFrom: 0.32, roofTo: 0.86 },
  suv:      { wsRake: 56, sideMax: 58, glass: 1.12, rw: [0, -0.88, 0.47], rwMax: 56, len: 1.02, wid: 1.06, roofFrom: 0.31, roofTo: 0.84 },
  van:      { wsRake: 48, sideMax: 64, glass: 1.3,  rw: [0, -0.98, 0.2],  rwMax: 48, len: 1.08, wid: 1.04, roofFrom: 0.26, roofTo: 0.92 },
  roadster: { wsRake: 62, sideMax: 48, glass: 0.85, rw: [0, -0.5, 0.87],  rwMax: 66, len: 0.84, wid: 0.95, roofFrom: 0.40, roofTo: 0.64 },
  retro:    { wsRake: 45, sideMax: 66, glass: 1.28, rw: [0, -0.8, 0.6],   rwMax: 60, len: 0.98, wid: 0.92, roofFrom: 0.32, roofTo: 0.70 },
};

// Yan profil çizimleri (viewBox 0 0 120 48). Elle çizildi, birebir model değil, karakter yakalamak için.
export const SILHOUETTES = {
  sedan: {
    body: 'M6 35 C6 29 8 26 16 25 L36 22 L48 13 C51 11 54 10 60 10 L76 10 C81 10 84 11 87 14 L95 22 L108 24 C113 25 114 28 114 31 L114 35 Z',
    glass: 'M50 14.5 C52 13 55 12.5 60 12.5 L66 12.5 L66 21 L40 21 Z M69 12.5 L76 12.5 C80 12.5 82 13.5 84 15.5 L90 21 L69 21 Z',
    wheels: [30, 92], r: 7,
  },
  hatch: {
    body: 'M10 35 C10 29 12 26 19 25 L36 22 L48 12 C51 10 54 9.5 60 9.5 L96 10 C100 10 102 12 103 15 L106 25 C108 26 108 29 108 31 L108 35 Z',
    glass: 'M50 13.5 C52 12 55 11.5 60 11.5 L70 11.5 L70 21 L40 21 Z M73 11.5 L95 12 C97 12 98.5 13 99 15 L100 21 L73 21 Z',
    wheels: [30, 90], r: 7,
  },
  station: {
    body: 'M6 35 C6 29 8 26 16 25 L34 22 L46 12 C49 10 52 9.5 58 9.5 L106 10 C109 10 111 12 111.5 15 L113 25 C114 27 114 29 114 31 L114 35 Z',
    glass: 'M48 13.5 C50 12 53 11.5 58 11.5 L68 11.5 L68 21 L38 21 Z M71 11.5 L90 11.5 L90 21 L71 21 Z M93 11.5 L105 11.8 C107 12 108 13 108.4 15 L109 21 L93 21 Z',
    wheels: [30, 94], r: 7,
  },
  suv: {
    body: 'M8 36 C8 28 10 25 18 24 L34 21 L44 9 C47 6.5 50 6 56 6 L102 6.5 C106 6.5 108 8 108.5 11 L111 23 C112 25 112 28 112 31 L112 36 Z',
    glass: 'M46 10 C48 8.5 51 8 56 8 L66 8 L66 19.5 L37 19.5 Z M69 8 L86 8 L86 19.5 L69 19.5 Z M89 8 L101 8.3 C103 8.5 104 9.5 104.4 11 L106 19.5 L89 19.5 Z',
    wheels: [30, 92], r: 8,
  },
  van: {
    body: 'M6 36 C6 28 8 25 14 24 L26 20 L36 6 C38 4 40 3.5 44 3.5 L108 3.5 C111 3.5 113 5 113.4 8 L114 30 L114 36 Z',
    glass: 'M38 7 C39.5 5.8 41 5.5 44 5.5 L56 5.5 L56 18.5 L29 18.5 Z M59 5.5 L82 5.5 L82 18.5 L59 18.5 Z M85 5.5 L108 5.5 C109.5 5.5 110.5 6.5 110.6 8 L111 18.5 L85 18.5 Z',
    wheels: [28, 94], r: 8,
  },
  roadster: {
    body: 'M12 35 C12 30 14 27 22 26 L42 24 L51 16.5 L55 16.5 L58 23 L80 23 C84 23 86 22 90 22 L102 24 C107 25 108 28 108 31 L108 35 Z',
    glass: 'M52.5 18 L54.5 18 L56.8 23 L46.5 23 Z',
    wheels: [30, 90], r: 7,
  },
  retro: {
    body: 'M6 35 L6 27 C6 25 7 24.5 10 24.5 L34 23 L42 11 C43 10 44 9.5 46 9.5 L80 9.5 C82 9.5 83 10 84 11 L92 23 L110 23.5 C113 23.6 114 25 114 27 L114 35 Z',
    glass: 'M44 12 L60 12 L60 22 L37.5 22 Z M63 12 L81 12 L89 22 L63 22 Z',
    wheels: [28, 92], r: 6.5,
  },
};

// roof: metal | pano (açılır perdeli panoramik cam) | glass (tamamı cam) | soft (kumaş, açılır)
// privacy: fabrika çıkışı koyu arka camlar (varsayım).
export const CARS = [
  { id: 'egea', name: 'Fiat Egea', body: 'sedan', seats: 5, roof: 'metal', privacy: false, ac: true,
    tag: { tr: 'Sedan', en: 'Sedan' },
    note: { tr: 'Türkiye yollarının emektarı. Sol koldaki yanık, taksicilerin imzasıdır.', en: 'The workhorse of Turkish roads. A sunburnt left arm is every cabbie\'s signature.' } },
  { id: 'clio', name: 'Renault Clio', body: 'hatch', seats: 5, roof: 'metal', privacy: false, ac: true,
    tag: { tr: 'Hatchback', en: 'Hatchback' },
    note: { tr: 'Kısa kabin, dik arka cam. Arkadakilerin ensesi için güneş kremi öneririz.', en: 'Short cabin, upright tailgate glass. Rear passengers, mind your necks.' } },
  { id: 'corolla', name: 'Toyota Corolla', body: 'sedan', seats: 5, roof: 'metal', privacy: false, ac: true,
    tag: { tr: 'Sedan', en: 'Sedan' },
    note: { tr: 'Sakin ve öngörülebilir. Güneş de öyle: her sabah aynı taraftan doğar.', en: 'Calm and predictable. So is the sun: same side every morning.' } },
  { id: 'passat', name: 'VW Passat Variant', body: 'station', seats: 5, roof: 'metal', privacy: false, ac: true,
    tag: { tr: 'Station', en: 'Estate' },
    note: { tr: 'Uzun tavan, upuzun arka cam. Bagajdaki karpuz da bronzlaşır.', en: 'Long roof, long rear glass. Even the watermelon in the boot gets a tan.' } },
  { id: 'togg', name: 'Togg T10X', body: 'suv', seats: 5, roof: 'pano', privacy: true, ac: true,
    tag: { tr: 'SUV', en: 'SUV' },
    note: { tr: 'Panoramik cam tavanlı ve koyu arka camlı donanım varsayıldı. Tavan perdesini sen yönet.', en: 'Assumes the panoramic glass roof and dark rear glass. You control the roof blind.' } },
  { id: 'duster', name: 'Dacia Duster', body: 'suv', seats: 5, roof: 'metal', privacy: false, ac: true,
    tag: { tr: 'SUV', en: 'SUV' },
    note: { tr: 'Yüksek oturuş, büyük camlar. Manzara geniş, güneş de geniş.', en: 'High seating, big windows. Wide views, wide sunshine.' } },
  { id: 'doblo', name: 'Fiat Doblo', body: 'van', seats: 5, roof: 'metal', privacy: false, ac: true,
    tag: { tr: 'Hafif ticari', en: 'Small van' },
    note: { tr: 'Kocaman yan camlar, dik ön cam. Arka sıra resmen sera.', en: 'Huge side glass, upright windscreen. The back row is a greenhouse.' } },
  { id: 'modely', name: 'Tesla Model Y', body: 'suv', seats: 5, roof: 'glass', privacy: true, ac: true,
    tag: { tr: 'Elektrikli SUV', en: 'Electric SUV' },
    note: { tr: 'Tavanın neredeyse tamamı cam. Kaplamalı, ama öğlen güneşi yine tepeden selam verir.', en: 'Nearly all-glass roof. Coated, but the midday sun still says hi from above.' } },
  { id: 'mx5', name: 'Mazda MX-5', body: 'roadster', seats: 2, roof: 'soft', privacy: false, ac: true,
    tag: { tr: 'Roadster', en: 'Roadster' },
    note: { tr: 'İki koltuk, açılır tavan. Tavan açıksa hesap basit: herkes yanar.', en: 'Two seats, folding roof. Roof down, the maths is simple: everyone burns.' } },
  { id: 'sahin', name: 'Tofaş Şahin', body: 'retro', seats: 5, roof: 'metal', privacy: false, ac: false, legend: true,
    tag: { tr: 'Efsane', en: 'Legend' },
    note: { tr: 'Klima yok, cam kolu var. İnce direkler, kocaman camlar. Terleme endeksi açıldı.', en: 'No AC, just a window crank. Thin pillars, huge glass. Sweat index unlocked.' } },
];

export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];
