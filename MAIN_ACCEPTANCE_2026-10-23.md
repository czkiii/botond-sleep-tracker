# A main funkcióinak összevont elfogadása — négy rövid blokk

**Állapot: előkészítve, kézi próbák még nem történtek meg.** Ez a következő funkcionális tesztmenet, nem a teljes Android/iOS kiadás elfogadása. A már lezárt M1–M6 és a korábbi Family+ jogosultsági mátrix eredménye megmarad.

## Ellenőrzött cím és verzió

2026-10-23, **20:55 Europe/Budapest**, olvasási ellenőrzés:

| Elem | Tényleges eredmény |
|---|---|
| Megnyitandó tesztcím | **https://solemi-sleep-internal.pages.dev/** — HTTP 200 |
| Tesztoldal buildje | **`1efa36f5324b95a5ba5afcae68f9ec8b8a65d3bd`**; felül röviden **`1efa36f`** |
| Staging Worker | `solemi-sleep-sync-staging.czki-adam.workers.dev`; health HTTP 200, törzs és fejléc ugyanez az `1efa36f…` SHA |
| Fiókos proxy | `/api/v1/auth/access` bejelentkezés nélkül 401 / `SESSION_INVALID`, ugyanaz a Worker-SHA; ez az elvárt védelem |
| CORS | A staging Worker engedélyezett válasz-originje a belső tesztcím |
| GitHub main | **`2462e27ec49073104cb48f0b2663087ee8fee91c`** (friss távoli ref-lekérdezés) |
| Main ↔ futó verzió | Pontosan hat `.md` dokumentum tér el. A frontend, a Functions proxy, a Worker, a buildkonfiguráció, a lockfile-ok és a tesztfixture-ek azonosak. **Funkcionális forrásegyezés, nem azonos build-SHA.** |
| Régi GitHub Pages | `https://czkiii.github.io/botond-sleep-tracker/` HTTP 200; a HTML SHA256 változatlan: `9a91ef658500102674a1569432a2a67a1b2ae2f79589de971cf4f8a9e3ce5726`. Ez a régi app, nem a mostani tesztcím. |

A frontend kiszolgált fájlja `/assets/index-BnQJArOT.js`, SHA256 `1f0cbe663b2930a3a8a93a19090b3c30b51ff30f6171cd4ef4f658d4e10ec078`; a teljes verzió a tesztcsíkhoz tartozó kódban azonosítva. Main és futó verzió között: `CODEX_PROJECT_STATUS.md`, `MAIN_MERGE_READY_2026-10-21.md`, `MAIN_TRANSITION_PLAN_2026-10-19.md`, `RELEASE_CHECKLIST.md`, `RELEASE_OVERVIEW_2026-10-16.md`, `REPOSITORY_CLEANUP_CHECKPOINT_2026-10-20.md`.

Részletes helyi bizonyíték: a Gitből kizárt `worker/.private-backups/acceptance-preparation-2026-10-23/live-identification.json`. **Új telepítés, adatváltoztatás és új erőforrás nem történt.** A korábbi teljes 915 tesztes eredményt nem futtattuk újra. A mostani ellenőrzés nem igazolja a felhasználó telefonján megnyitott lap cache-ét, bejelentkezését vagy tényleges Family+ jogosultságát; ezek az egyszeri indulási ellenőrzésben következnek.

## Egyszeri indulás — amikor a tulajdonos tesztelni tud

1. Ugyanezt a tesztcímet nyissuk meg két eszközön. A korábban előkészített A27 telefonos elfogadáshoz két valódi telefon kell: Androidon Chrome, iPhone-on Safari, normál lapban. **Edge + Chrome asztali ablak előpróbára jó, de nem számít két telefonos elfogadásnak.** Telepítés/kezdőképernyőre helyezés most nem szükséges.
2. Mindkét lapon a felső `INTERNAL / TEST` csíkban **`1efa36f`** legyen. Eltérésnél frissítés és verzióegyeztetés kell, nem appadat-törlés. A tesztcsík a belső környezetben szándékos; a mobil kiadási buildben ellenőrizzük a hiányát.
3. Magyar nyelv, `Europe/Budapest` időzóna, valós aktuális dátum. A telefon óráját nem állítjuk vissza a próbanapló dátumára.
4. **Külön, eldobható tesztnapló és tesztcsalád**: például `V1 elfogadás`. Opo/Boti vagy napi használatú napló nem lehet az import célpontja. A családi import más eszközök közös naplóját is cseréli.
5. Belépéshez egy külön teszt-Google-fiók is elég, ugyanazzal mindkét telefonon. Nem kell újra végigjárni a két külön fiókos jogosultsági mátrixot. Ha a használni kívánt fiók már a valódi család tagja, nem léptetjük ki automatikusan: az induláskor másik, valóban elkülönített tesztfiókot választunk. Konkrét tesztfiók és tesztcsalád **most még nincs igazolva**, ezt nem jelöljük késznek.
6. Family+ **belső tesztjogosultság**, működő családi kapcsolat és ugyanaz a tesztcsalád mindkét eszközön. Zárolt funkciónál előbb ezt rendezzük. Ez nem vásárlás, nem trialaktiválás, és nem használja fel az átálló család későbbi 90 napos hozzáférését.

Az indulási adatok rögzítése: két készülék/böngésző, verzió, egyező tesztcsalád és Family+ elérhetőség. Személyes e-mail-címet és tokeneket nem másolunk nyilvános jegyzőkönyvbe. A belépés előkészítése nem új M1–M6 teszt.

## A rövid tesztlista

Próbafájl: [a27-common-diary.json](test-fixtures/a27-common-diary.json) — egy mesterséges `A27 próbanapló` gyermek, **162 alvás**. A régi személyes export helyett ezt használjuk. Az első három blokk a már megírt [A27 közös elfogadási terv](A27_COMMON_ACCEPTANCE_2026-10-03.md) összevont folytatása; nem új tesztsorozat.

| Blokk | Teendő | Sikerfeltétel |
|---|---|---|
| **1. Közös napló és statisztika** | A külön tesztcsaládba az egyik eszközön egyszer importáljuk a próbafájlt. A másikon megvárjuk a szinkront, majd azonos gyermeket és időszakot nézünk. A szeptemberi riport/fejlődés számait a kijelzett időszakkal együtt rögzítjük. | Mindkét oldalon ugyanaz az egy gyermek / **162 alvás**. A **2026. szeptemberi** referencia: **21 adatos dátum, 10 óra 14 perc napi átlag, 4 óra leghosszabb-szakasz-átlag**. Ha más időszak látszik, nem kérjük számon rajta a szeptemberi számokat. Régi ébredésből nem jelenik meg aktuális időpontbecslés. |
| **2. Aktív alvás** | Első telefonon tesztalvás indítása; másodikon statisztika megnyitása. Legalább két perc után a második telefonon lezárás. | Mindkét eszközön aktív marad, amíg le nem zárjuk; közben nincs következő-alvás időpontbecslés vagy aktuális ébrenléthez kötött naplista. Lezárás után mindkettőn **163 alvás**, az új ébredéshez igazodó állapot. Kevés minta esetén az adatgyűjtési állapot is helyes. |
| **3. Üres gyermek és visszaváltás** | A tesztcsaládban új `Üres próba` gyermek; mindkét oldalon kiválasztás, majd visszaváltás az A27 gyermekre. | Üresen nem marad ott az előző gyermek becslése/riportja; érthető adathiányjelzés. Visszaváltva visszatér a próbanapló. Nem törlünk családot vagy naplót. |
| **4. PDF és használhatóság** | Az A27 gyermeknél `Alvásnapló PDF`, **2026-09-01–2026-09-30**, megjegyzések nélkül. Letöltés és megnyitás az első telefonon. A többi blokk közben figyeljük a gombokat, görgetést és szövegeket is. | A PDF megnyitható, megfelelő gyermek/időszak, olvasható ékezetek, levágás nélküli sorok. A mai tesztalvás nincs a szeptemberi kivonatban. Az app naplója nem változik. Nincs elérhetetlen gomb vagy kilógó ablak. A PDF nem importálható biztonsági mentés. |

Elég blokkonként **„rendben”**, hiba esetén az adott lépés és egy kép. Az első blokknál a két eszköz egyező szeptemberi nézetét rögzítjük. Nem kérünk minden kártyáról és minden nyelven új képsorozatot. Talált hibánál csak az érintett blokkot javítjuk és ellenőrizzük újra.

## Mi marad a következő szakaszokra?

- **Már elfogadott, nem ismétlendő:** M1–M6 import/kilépés/családmegszüntetés/naplóválasztás; a korábbi Family+ megosztási mátrix; A27 S01–S15 részletes időzóna, éjfél, duplikáció és küszöbérték gépi próbái; A17 távoli helyreállítási főpróba.
- **Fizetési szakasz:** valódi vásárlás, trial, megújítás/lejárat, vásárlás-visszaállítás, párhuzamossági és store-esetek. A staging tesztcsomag nem bizonyít valódi bolti vásárlást.
- **Mobilcsomag és kiadás:** natív belépés, offline hidegindítás és hozzáférés, telepítés/frissítés, VoiceOver/TalkBack, rendszerbetűméret és safe-area; tényleges fióktörlési felület engedélyezett, eldobható fiókkal. Ezek nyitottak maradnak, a mostani böngészős menettel nem pipáljuk ki őket. Az internal build nem regisztrál automatikusan service workert, ezért most nem adunk félrevezető repülőmódos/PWA-frissítési feladatot.
- **Üzemeltetés/adatkezelés/átvitel:** éles háttérrendszer bekötése, napló költöztetése, megőrzési üzemeltetés és tájékoztatók véglegesítése a kiadás előtt marad. A mostani négy blokk nem állítja, hogy ezek készek. Külön nyilvános webapp nem feltétel.

## Eredménylap

| Ellenőrzés | Állapot |
|---|---|
| Main, kiszolgált frontend, Worker és proxy azonosítása | **KÉSZ**, 2026-10-23 20:55 |
| Két telefon / tesztfiók / elkülönített család / Family+ | MÉG NINCS ELLENŐRIZVE |
| 1. Közös történeti napló és statisztika | NYITOTT |
| 2. Aktív alvás és lezárás | NYITOTT |
| 3. Üres gyermek és visszaváltás | NYITOTT |
| 4. PDF és látható használhatóság | NYITOTT |

**Következő:** a fenti rövid közös teszt végrehajtása, amikor a tulajdonos ráér. **GPT-6 Astra · erős; ehhez már kell kézi közreműködés.** A négy blokk után az érintett funkcionális elfogadást lezárjuk vagy konkrét hibát javítunk, majd a megbeszélt fizetési bekötésre lépünk. A teljes mobilos kiadási kapu ettől még nem lesz automatikusan kész.
