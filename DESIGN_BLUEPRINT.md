# Alváskövető V1 — Mockup Fidelity Blueprint

Ez a fájl a 2026-08-22-én jóváhagyott Midnight Blue mockup kódszintű leképezése.

## Referenciaelv

- A mockup vizuális szerkezete a célállapot.
- Egyetlen tudatos eltérés: a mockup nagy középső aktuális órája NEM kerül vissza a főképernyő headerébe.
- Header végleges formája: balra zárt dátum + napi összesítés, jobb oldalon settings.
- Mobil-first célviewport: 390 × 844 CSS px körüli iPhone méret.
- A layoutnak 375–430 px szélességen ugyanazt az arányrendszert kell tartania.

## Design tokenek

- App max-width: 390 px
- Horizontális screen padding: 18 px
- Content width 390 px viewporton: 354 px
- Fő háttér: #050D19 / #071321
- Kártya: #0A1A2C, finom vertikális gradient
- Fő kék: #579DFF
- Másodlagos kék: #79B8FF
- Muted szöveg: #7E94AD
- Border: rgba(127, 175, 228, 0.12)
- Fő card radius: 14–16 px
- CTA radius: 17–18 px
- Bottom tab aktív háttér radius: 12–13 px

## 1. Ma — Ébren / Alszik

### Header
- teljes magasság: kb. 46 px
- dátum: 15–16 px / semibold-bold
- summary: 11–12 px
- settings: 34–36 px kör alakú tap target

### Status orb
- átmérő: 178–186 px
- belső kör: ~164 px
- gyűrű: 5–6 px
- a gyűrű NEM teljes 360°-os homogén kör: legyen 25–30% vizuális törés / sötétebb szakasz
- finom, nem neon glow
- orb és CTA között ~14 px

### CTA
- szélesség: 246–252 px
- magasság: 42–44 px
- középre igazítva
- Részletek link közvetlenül alatta, 11–12 px

### Mai alvások
- teljes card szélesség: 100%
- card magasság cél: 118–132 px 3 sor esetén
- 3 sor látható
- sor magasság: 34–38 px
- a további sorok belső scrollal érhetők el
- card cím 11–12 px

### Bottom nav
- teljes magasság: 58–62 px + safe-area
- 3 egyenlő tab
- aktív tab finom kékes pill/background
- ikon 15–17 px, label 9–10 px

## 2. Részletek / Manuális rögzítés

- teljes képernyős nézet, nem browser-card modal
- header: close bal oldalon, title középen
- két picker blokk: Elaludt / Felébredt
- mindkettő 3 oszlopos wheel: dátum | óra | perc
- wheel látható sorok: 5
- középső kiválasztó sáv ~28 px magas
- felső/alsó fade
- Még alszik toggle külön sor
- Megjegyzés csak meglévő session szerkesztésekor
- Mentés CTA alul, kb. 43 px magas
- meglévő sessionnél Törlés bal oldalon

## 3. Előzmények

- title középen, + gomb jobb oldalon
- napi csoportosítás
- csoportcím 10–11 px muted
- cardon belüli sorok: 36–40 px
- sor: ikon | időintervallum | duration | edit
- napi card radius: ~13 px
- vertikálisan sűrű, egy viewporton több nap férjen el

## 4. Statisztika

### Felső rész
- title középen
- segmented: Nap / Hét / Hónap
- segmented teljes magasság ~32 px

### Bar chart
- teljes szélesség
- cím 10–11 px
- chart magasság ~145–160 px
- 6–7 keskeny oszlop hetes nézetben

### 24 órás áttekintés
- kétoszlopos kompozíció
- bal: ~140–150 px radial chart
- jobb: 3 stacked stat card
- stat card magasság ~47–52 px
- sorrend: Átlag / Nappali / Éjszakai

## 5. Tipográfiai hierarchia

- Screen title: 17–18 px
- Orb state: 21–23 px
- Orb primary duration: 18–20 px
- CTA: 14 px
- Card title: 11–12 px
- List primary: 11–12 px
- List secondary: 10–11 px
- Bottom nav label: 9–10 px

## Implementációs szabály

Ha egy CSS-változtatás csak egy screenshoton néz ki jól, de felborítja az arányrendszert más viewporton, akkor nem elfogadható. Elsődlegesen tokenekkel és komponens-szintű layouttal kell megoldani, nem egyedi pixelhackekkel.
