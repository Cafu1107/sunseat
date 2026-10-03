<div align="center">

<img src="assets/favicon.svg" width="72" alt="Sunseat logo">

# Sunseat

**Güneş hangi koltuğa vuracak?** Rotanı, çıkış saatini ve arabanı seç; yol boyunca her koltuğa ne kadar güneş geldiğini dakika dakika gör.

[![Canlı site](https://img.shields.io/badge/canl%C4%B1-cafu1107.github.io%2Fsunseat-f5b800?style=flat-square)](https://cafu1107.github.io/sunseat/)
[![Lisans: MIT](https://img.shields.io/badge/lisans-MIT-2b3035?style=flat-square)](LICENSE)
![Bağımlılık yok](https://img.shields.io/badge/build-yok-2b3035?style=flat-square)
![TR / EN](https://img.shields.io/badge/dil-TR%20%2F%20EN-2b3035?style=flat-square)

[**Siteyi aç**](https://cafu1107.github.io/sunseat/) · [English](#english)

<img src="docs/screenshot-light.png" alt="Sunseat: Ankara İzmir rotası, Tofaş Şahin seçili" width="900">

</div>

## Ne yapıyor?

İstanbul'dan Sakarya'ya 15:30'da çıkıyorsun. Güneş hangi koltuğa vuracak, sürücü mü yanacak, arkadakiler mi? Sunseat rotayı yüzlerce kısa parçaya bölüyor. Her parçada arabanın yönünü güneşin konumuyla karşılaştırıyor ve ışığın hangi camdan, ne açıyla girdiğini hesaplıyor.

| | |
|---|---|
| 📍 **Ayrıntılı konum** | Sokak ve kapı numarasıyla arama, "Haritadan seç" modu (haritayı kaydır, iğne tam noktaya otursun), GPS ile konumum, koordinat yapıştırma, son kullanılan yerler. |
| 🗺️ **Harita** | Rota, seçtiğin koltuğun güneş miktarına göre renklenir. Üzerine gel, araba o noktaya gider. |
| 🚗 **Üstten araba** | Güneş arabanın etrafında döner, ışık alan camlar ve koltuklar canlı olarak boyanır. ▶ ile yolculuğu oynat. |
| 📊 **Koltuk şeritleri** | 5 koltuğun zaman çizelgesi ve "tam güneş dakikası" toplamı. |
| ⏰ **En iyi çıkış saati** | ±3 saati tarar: "17:15'te çıkarsan koltuğun %48 daha az güneş alır." |
| 😎 **Göz kamaşması** | Alçak güneş tam karşıdaysa ya da dikiz aynasına vuruyorsa saatini ve kilometresini söyler. |
| 💪 **Şoför kolu endeksi** | Sol ön camdan gelen ışık ve UV ile "kamyoncu kolu" riskini 10 üzerinden puanlar. |
| 👨‍👩‍👧 **Aile modu** | Güneşsever ve gölgecileri koltuklara kavgasız dağıtır. |
| ☁️ **Gerçek hava** | Open-Meteo'dan bulut, UV ve sıcaklık çeker (16 gün ileriye kadar). |
| 🖼️ **Paylaşım kartı** | Sonucu 1080x1350 PNG olarak indir. Bağlantı her ayarı URL'de taşır. |

### Araba modeli neyi değiştiriyor?

Her kasa tipinin ön cam yatıklığı, yan cam yüksekliği, arka cam açısı ve cam alanı farklı. Aynı rotada Fiat Egea ile koyu arka camlı Togg T10X'te en serin koltuk farklı çıkabiliyor.

| Model | Özelliği |
|---|---|
| Fiat Egea, Toyota Corolla | Sedan, eğimli arka cam |
| Renault Clio | Hatchback, dik arka cam |
| VW Passat Variant | Station, uzun arka cam |
| Togg T10X | SUV, panoramik cam tavan (perdesi açılıp kapanır), koyu arka camlar |
| Dacia Duster | SUV, yüksek camlar |
| Fiat Doblo | Hafif ticari, kocaman yan camlar |
| Tesla Model Y | Tamamı cam tavan |
| Mazda MX-5 | 2 koltuk, tavan açılınca herkes yanar |
| Tofaş Şahin | Klima yok: **terleme endeksi** açılır, kontak butonu jikle ister |

Cam filmi koyuluğunu da kaydırıcıyla ayarlayabilirsin.

### Küçük sürprizler

Logoya 5 kez dokun. Farları (tema düğmesini) yak. Şahin'i seç ve kontağı çevir. Aynı yeri iki kez seç.

## Nasıl hesaplıyor?

1. **Rota:** [OSRM](https://project-osrm.org), her yol parçasının süresiyle birlikte.
2. **Güneş:** [SunCalc](https://github.com/mourner/suncalc) formülleri, tarayıcıda. Atmosferik kırılma dahil.
3. **Kabin modeli:** Güneş yönü araba koordinatlarına çevrilir. Her cam (ön, 4 yan, arka, tavan) için yüzey normali, geçirgenlik ve tavan kenarı kesmesi hesaplanır. Her camın her koltuğa etkisi bir ağırlık tablosundan gelir. Karşı taraftaki koltuğa ancak alçak güneş ulaşır.
4. **Bulut:** Bulut oranı doğrudan ışığı en fazla %75 azaltır.

Kod: [`model.js`](assets/js/model.js) (ışık modeli), [`sim.js`](assets/js/sim.js) (simülasyon ve analizler), [`cars.js`](assets/js/cars.js) (arabalar).

> **Dürüst sınırlar:** Binaların, ağaçların, dağların ve tünellerin gölgesi hesaba katılmaz. Sonuçlar eğlence amaçlı tahmindir.

## Yerelde çalıştır

Derleme adımı yok. ES modülleri yüzünden bir HTTP sunucusu gerekiyor:

```bash
git clone https://github.com/Cafu1107/sunseat.git
cd sunseat
python -m http.server 8000
# http://localhost:8000
```

## Veri kaynakları

[OpenStreetMap](https://www.openstreetmap.org/copyright) (harita), [OSRM](https://project-osrm.org) (rota), [Photon](https://photon.komoot.io) (adres arama), [Open-Meteo](https://open-meteo.com) (hava). Hepsi ücretsiz ve anahtarsız. Yoğun kullanımda kendi sunucunu kurman önerilir.

## Lisans

[MIT](LICENSE)

---

<a id="english"></a>

## English

**Which seat will the sun hit?** Pick a route, a departure time and your car. Sunseat splits the drive into hundreds of short slices and, for each one, compares the car's heading with the sun's position to work out which window the light comes through, at what angle, and which seat it lands on.

<img src="docs/screenshot-dark.png" alt="Sunseat dark mode: top view of the car and seat timelines" width="900">

- Route map coloured by the sun on *your* seat, with an animated top-down car you can scrub or play.
- Per-seat timelines, the best departure time within ±3 hours, glare warnings, a "trucker arm" index, family seating mode and a share card.
- Car models matter: windscreen rake, window height, rear glass angle, privacy glass, panoramic or all-glass roofs, a roadster with the top down, and a Tofaş Şahin with no AC (sweat index unlocked).
- Real cloud, UV and temperature from Open-Meteo.
- Plain HTML, CSS and JS plus Leaflet. No build step, no API keys. Turkish and English.

Shade from buildings, trees, mountains and tunnels is not modelled. Treat the numbers as a fun estimate.

Run locally with any static server (`python -m http.server`). MIT licensed.
