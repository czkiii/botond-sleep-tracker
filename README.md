# Botond Sleep Tracker

Egyszerű, mobil-first baba alváskövető PWA. Az adatok kizárólag a készülék böngészőjének `localStorage` tárhelyén maradnak.

## V1 funkciók

- Elaludt / Felébredt gyors rögzítés
- Futó alvás időzítése
- Manuális kezdés és befejezés szerkesztése
- Egyetlen, másnapra átnyúló session támogatása
- Mai alvások belső scrollos listában
- Előzmények napi csoportosítással
- Nap / hét / hónap statisztika
- Nappali (06:00–19:00) és éjszakai bontás
- JSON export / import
- Törlés megerősítéssel
- PWA / iPhone kezdőképernyős használat

## Stack

- React
- Vite
- TypeScript
- Recharts
- vite-plugin-pwa
- localStorage

## Fejlesztés

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Adattárolás

Kulcs: `sleepTracker:v1`

Alapértelmezett baba név: `Botond`, amely a Beállításokban átírható.

> Fontos: a localStorage törlése az alvásadatokat is törli, ezért időnként érdemes JSON mentést exportálni.
