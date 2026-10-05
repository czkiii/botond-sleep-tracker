# A20 — alváskonfliktusok és akadálymentes párbeszédablakok

Dátum: 2026-10-05. Feladatszint: GPT-6 Astra · erős.
Kiinduló HEAD: `bd31b58`, ág: `feat/child-profile-v4`, tiszta munkakönyvtár.
A korábbi [A20 beállításrendezés](SETTINGS_UX_CHECKPOINT_2026-09-30.md) folytatása; kézi tulajdonosi teszt nélkül.

## Elkészült

- HU/EN/DE összehasonlítás a helyi módosítások és a családi változat között: gyermek, teljes dátum és másodperces időpont időzónajelzéssel, aktív alvás, kézi/automatikus alvástípus és teljes, sortöréseket megtartó megjegyzés. A gyermekkonfliktus név/születési dátum összehasonlítása ugyanazt a felületet használja. A különbséget vizuális jel és képernyőolvasós szöveg is jelzi. Keskeny nézetben a két változat egymás alatt jelenik meg.
- A helyi előnézet a várakozó műveleteket alkalmazza a felülvizsgált családi értékre: az érintetlen mezőket nem állítja vissza egy régi helyi példányból. A függő törlés külön szövegben jelzi a családi naplóra gyakorolt hatást. A felirat a később esetleg újra ütköző műveletek automatikus sikerét nem ígéri.
- Konfliktusszámláló és előző/következő választás. A döntés a megjelenített műveletazonosítóra vonatkozik, nem mindig a sor első elemére. Azonos darabszám mellett is frissül az összehasonlítás.
- A választás előtt, a szinkron sorosított műveletében ellenőrzött felülvizsgálati állapot: megváltozott családi érték, helyi módosítás vagy kapcsolat esetén új áttekintést kér. Az ellenőrzés a kliens által ismert állapotra vonatkozik; új szerveroldali változást továbbra is a revízióellenőrzés véd. Offline állapotban nincs konfliktusfeloldás.
- Közös natív modális ablak a családi megosztáshoz, alvásszerkesztőhöz, adatcsere/törlés előnézetéhez, havi időszakválasztóhoz és képkivágóhoz. Megnevezett ablakok és bezárógombok, háttérből kizárt fókusz, Tab/Shift+Tab kör, Escape és fókuszvisszaadás. Folyamatban lévő kérésnél az Escape/ablakkeret nem zárja be a műveletet. A beágyazott képkivágó bezárása a profilszerkesztőbe adja vissza a fókuszt.
- Az időválasztó három megnevezett listbox: nyilak, Home/End, kiválasztott elem jelölése; a soronkénti több száz Tab-megálló megszűnt. Javítva az elavult animációs képkocka miatti visszaugrás. A kép mozgatása nyilakkal, nagyítása a natív csúszkával is használható; a fájlválasztó billentyűzetről elérhető.
- A családnév/meghívókód valódi címkét és Enterrel küldhető űrlapot kapott; üres/offline/folyamatban lévő állapotban nincs küldés. Az alvástípus választása és az aktív alsó navigáció szemantikailag is jelzett.
- 200%-os szövegméretnél javított német tördelés, 44 px konfliktusléptető/bezárógomb, látható fókusz.

## Gépi bizonyítékok

- Teljes `npm test`: **54 fájl, 737/737 PASS**, ebből 7 új célzott konfliktusteszt. A régi szinkron- és Worker-integrációs próbák is lefutottak.
- Frontend és Worker typecheck: PASS.
- Internal build: PASS; a már meglévő 500 kB feletti bundle-figyelmeztetés megmaradt.
- Új `npm run test:conflicts`: **6/6 PASS**, HU/EN/DE × 320/520 px, Edge 154.0.4258.53. Hosszú/literális HTML-t tartalmazó megjegyzés, aktív/lezárt alvás, eltérő típus, változatlan darabszámú frissítés, második konfliktus családi választása az első megőrzésével, helyi választás revíziója, offline tiltás, kérés alatti Escape-tiltás, fókuszkör/visszaadás, helyi törlés előnézetének megszakítása, időválasztó és havi időszakválasztó billentyűzetes próbája. 320 px-en mindhárom nyelven programozott 200%-os szövegnagyítás és vízszintes túlcsordulás-ellenőrzés.
- `npm run test:settings`: **6/6 PASS**, HU/EN/DE × 320/393 px; a beágyazott képkivágó nyilas mozgatása és csúszka-nagyítása is ellenőrizve.
- `npm run test:family-join`: PASS, 5 meglévő forgatókönyv.
- `npm run test:child-deletion`: PASS, 5 meglévő forgatókönyv, nincs ismételt DELETE.
- Képi ellenőrzés: a `.private-backups/conflict-*.png` helyi, Gitből kizárt képeken a magyar 320/520 px és a magyar/német nagyított nézet is átnézve. A teljes hosszú szöveg görgetéssel érhető el.

A próbák saját, elkülönített böngészőkontextust, helyi Vite-ot és teszt API-t használtak. Valódi fiók vagy családi napló nem módosult.

## Határ és folytatás

**A20 helyi gépi része elkészült.** Commit/push/deploy nem történt. A kiadott builden, valódi telefonos VoiceOver/TalkBack, rendszer-betűméret, képernyő-billentyűzet és safe-area ellenőrzés még a közös kiadási kapu része. A programozott szövegnagyítás nem helyettesíti ezt. Teljes akadálymentességi megfelelőséget nem állítunk. A már elfogadott M1–M6 próbákat nem kell újrakezdeni; most nem kérünk kézi tesztet.

Következő: **A23 — a V1 PDF-export és csomagígéretek meglévő állapotának felmérése, majd a PDF-export hiányainak pótlása, gépi próbákkal. GPT-6 Astra · erős; kézi teszt nélkül indítható.** A korábban elfogadott trial/ár/termékszabályok irányadók, új üzleti döntéseket nem találunk ki. Ez a már kijelölt V1-tartalmi blokk folytatása, nem új auditkör.

## GitHub Desktop

Summary: `Compare sleep conflicts and improve modal keyboard accessibility`

Description: Add localized conflict comparison and navigation, bind decisions to the reviewed entry, and reject stale selections. Add native modal focus handling, accessible time wheels and keyboard photo positioning. Validate with 737 tests, both typechecks, internal build and isolated conflict/settings/family browser checks. Device screen-reader acceptance remains pending.
