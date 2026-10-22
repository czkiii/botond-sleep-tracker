# A18 — proxy és belépési kérések megmaradt gépi ellenőrzése

Dátum: 2026-10-04. Alap HEAD: `90871c8` (`feat/child-profile-v4`). Feladatszint: GPT-6 Astra · erős. Helyi javítás és gépi ellenőrzés; commit, push, deploy és valódi felhasználói adatváltoztatás nem történt.

## Eredmény

Az A18 kért helyi gépi része kész. A korábban elkészült Origin/Fetch Metadata védelem megmaradt; az idegen eredet megbízhatóvá átírását nem kellett újra javítani. A korábbi családi szinkronútvonalakat sem tiltottuk le újra.

Három megmaradt pontot rendeztünk:

1. **Pontos útvonal–metódus lista.** A proxy eddig minden `/api/v1/auth/…` útvonalat és több, az adott végpont által nem használt metódust továbbított. Most csak a Worker tényleges belépési, jogosultsági és családi végpontjai juthatnak át a megfelelő metódussal. Ismeretlen útvonal 404, ismert útvonal nem támogatott metódusa 405/Allow választ kap, háttérkérés nélkül. Új auth végpontot a proxy listájában is tudatosan engedélyezni kell. A korábbi továbbítás önmagában nem igazolt hitelesítési megkerülés: a Worker saját ellenőrzései eddig is megmaradtak.
2. **Sütik minimalizálása.** Kizárólag a `solemi_refresh` süti megy tovább, és csak a refresh/logout végpontokra. A Google-belépés, fiókolvasás és családi API nem kap fölösleges vagy más célú böngészős sütit. A Bearer és családi token továbbítása megmaradt. A proxy minden továbbított válasznál `Cache-Control: no-store` fejlécet ad.
3. **Sérült/kétértelmű refresh süti.** Hibás százalékos kódolás többé nem okoz 500-as hibát. Azonos nevű több refresh süti esetén nem választunk önkényesen egyiket: a Worker szabályos `401 SESSION_INVALID` választ ad, session-adatbázis-módosítás nélkül. A proxy szándékosan megőrzi ezt a kétértelműséget a Worker ellenőrzéséhez.

## Gépi bizonyíték

- `src/accountProxy.test.ts`: **40/40 PASS**. 13 új próba a túl tág útvonal/metódus-továbbításra és a fölösleges sütikre; a javítás előtti kódon mind a 13 elbukott. A korábbi 27 próba, köztük a családi végpontok elérhetősége és a staging/production elkülönítés, változatlanul sikeres.
- `worker/tests/accountProxyBoundary.test.ts`: **17/17 új PASS**, memóriabeli SQLite és valódi Worker/AuthService mellett. Hét hiányzó/idegen/null/megtévesztő Origin-változat × 11 módosító auth végpont; három nem megfelelő Fetch Metadata állapot; Worker közvetlen elérése; tényleges session-rotáció és logout; három sérült/duplikált sütieset; bearer nélküli olvasás tiltása; a tényleges frontend `getAccountAccess` hívás proxy–Worker útja.
- A tiltott kéréseknél nincs továbbítás vagy session-, eszköz-, család-, tagság-, challenge- és jogosultságmódosítás. A sikeres frissítés/logout megőrzi a `HttpOnly; Secure; SameSite=Lax` tulajdonságokat és az `/api/v1/auth` böngészős sütiútvonalat; logoutnál `Max-Age=0`.
- Teljes `npm test`: **51 fájl, 688/688 PASS** (30 új teszt). Frontend és Worker typecheck PASS; internal build PASS; diff ellenőrzés PASS. A meglévő frontend csomagméret-figyelmeztetés és az A04 szándékosan injektált visszagörgetési hibalog nem új hiba.

## Kiadási határ

Most nem szükséges tulajdonosi kézi tesztelés. Ez helyi, összekötött frontend/proxy/Worker HTTP-szimuláció: a böngészős Origin/Fetch Metadata és Cookie fejléceket a próba adja hozzá. Nem állít új telepített Cloudflare Pages-, valós OAuth- vagy telefonos böngésző-elfogadást. A proxy és Worker javításának kiadása és azonosított staging ellenőrzése még nyitott. M1–M6 nem ismétlendő.

Az A16 offline igazolásának távoli kulcsbeállítása külön, továbbra is nyitott telepítési feltétel. Az A19 gyakorisági/erőforráskorlátait, CSP/header és függőségvizsgálatát ez a feladat nem zárja le.

## Következő és GitHub Summary

**A19 — a kérésgyakorisági és erőforráskorlátok, biztonsági fejlécek és függőségek megmaradt ellenőrzése, gépi próbákkal. GPT-6 Astra · erős (high); most nem szükséges tulajdonosi tesztelés.** A meglévő 64 KiB-os body-limitből és tesztekből indulunk; kész részt nem írunk újra.

GitHub Desktop Summary: `Restrict proxy routes and cookies and reject malformed refresh credentials`
