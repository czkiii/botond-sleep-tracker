# A16 — offline fizetős hozzáférés és munkamenet-frissítés

Dátum: 2026-10-04. Alap HEAD: `3cb7db0` (`feat/child-profile-v4`). A tulajdonos választása: GPT-6 Astra · erős. Helyi fejlesztés és gépi bizonyíték; commit/push/deploy és valódi fiók vagy családi adat módosítása nem történt.

## Elkészült helyi rész

- A hidegindítás és az API-kérések közös, lapon belüli refresh promise-t használnak. Web Locks támogatással a lapok között is sorba áll a refresh, Google-login és logout. A közös HttpOnly sütit a böngésző a következő refresh előtt frissíti.
- Hálózati, időtúllépési és átmeneti szerverhiba miatt nem törlődik a használható session-adat, a napló vagy a függő művelet. A bizonyítottan érvénytelen/visszavont session továbbra is kijelentkezést és a napló fiókhoz kötött mentését eredményezi.
- Kijelentkezés/bejelentkezés közben késve visszatérő válasz nem állíthatja vissza a korábbi belépést. A fiókhoz kötött API-kérés a megváltozott aktív munkaterület eredményét elutasítja; A naplójának módosítása nem küldhető el B frissen helyreállított belépésével.
- A Worker az ellenőrzött `/v1/auth/access` válaszhoz külön, **ES256-aláírt offline igazolást** tud adni. A böngésző a buildbe rögzített nyilvános kulccsal ellenőrzi. A jogosultság account- és eszközazonosítóhoz kötött; nem exportált naplóadat és nem belépési token.
- Az igazolás csak `PDF_EXPORT` és `FAMILY_PLUS_INSIGHTS` helyi funkcióra szólhat. Nem ad fiókhitelesítést, családi tagságot, szinkront, meghívást vagy szerveres törlési jogot. A PDF funkció elkészültségét ez nem módosítja.
- Lejárat: legfeljebb 30 nap, de legfeljebb a session és a belefoglalt funkciók szerveres hozzáférésének vége. Több aktív grantból funkciónként a legtovább érvényes számít; különböző funkcióknál az igazolás konzervatívan a leghamarabb lejáróhoz igazodik. Családi grant csak aktív tagságból származhat.
- Tárolt legnagyobb észlelt idő és monotonic eltelt idő védi az órakezelést. Egy percnél nagyobb visszaállás érvényteleníti a helyi igazolást, és online ellenőrzés kell. Módosított aláírás/adat, másik kulcs/account/eszköz vagy lejárat nem nyit prémium funkciót. A statisztikai nézet a lejáratot is figyeli; fókuszba visszatéréskor és időközönként újraellenőrzünk.
- Friss online Free válasz, ismert session-visszavonás, kijelentkezés és sikeres accountos családi módosítás törli a korábbi offline igazolást. Fiókváltáskor a másik fiók igazolása nem használható.

## Tudatos refresh-replay szabály

A szerver meglévő szigorú szabálya megmaradt: a már elhasznált refresh token ismételt bemutatása visszavonja az érintett eszköz sessionjeit. Nem vezettünk be token-újrafelhasználási türelmi időt.

Ha egy elveszett válasz előtt a böngésző már megkapta az új sütit, a következő kérés azzal folytatható. Ha az új süti sem érkezett meg, a régi token ismétlése után **új Google-belépés szükséges**; ez tudatos biztonsági korlát. A másik eszköz belépése megmarad. Az átmeneti hálózati hibát ettől külön kezeljük, és nem állítjuk róla, hogy visszavonás.

## Gépi bizonyíték

- `src/accountRestore.test.ts`: 17/17, ebből 7 új eset (közös hidegindítás/API-frissítés; hálózati hiba és retry; offline írás tiltása; késői refresh logout után; A→B közbeni írásvédelem; késői access-válasz; kétlapos zár).
- `worker/tests/authService.test.ts`: 10/10, ebből 3 új (egymást követő cookie-rotáció; elveszett válasz/replay/új belépés és másik eszköz megőrzése; lecserélt harmadik eszköz access+refresh tiltása).
- `worker/tests/offlineEntitlement.test.ts`: 20/20 új. Valódi Worker access-route, aláírás és kliens WebCrypto-ellenőrzés; családi tagság; három lejárati korlát; sérült payload/signature, eltérő/hiányzó kulcs, account/device; hideg lapállapot; visszaállított/megállt óra; visszavont/jövőbeli grant/session; Free visszalépés és hálózati hiba.
- A régi családi klienspróbák bejelentkezett fixture-jei most az account aktív munkaterületét is beállítják. Munkaterületváltásnál az új általános `ACCOUNT_CONTEXT_CHANGED` védelem korábban állítja meg a választ; az adatmegőrzési elvárások változatlanok.
- `npm run test:account-access`: **3/3 helyi, elkülönített headless Edge-próba PASS**: két valódi lap és közös HttpOnly süti Web Locks sorosítással; új lapállapotból offline igazolás visszaolvasása natív WebCrypto-val; lejárat utáni tiltás. Csak helyi API és futásonként új tesztkulcs. A teszt az új lap programfájljait még online tölti le, majd offline kapcsol: nem állít valódi telepített PWA repülőmódos indítási elfogadást.
- Teljes csomag: **50 fájl, 658/658 PASS** (30 új teszt). Frontend és Worker typecheck PASS; internal build PASS; diff ellenőrzés PASS. A meglévő csomagméret-figyelmeztetés és az A04 szándékos visszagörgetési hibalog megmaradt, nem teszthiba.

## Telepítési feltételek és korlátok

**A távoli offline fizetős hozzáférés még nincs bekapcsolva.** Ehhez összehangoltan szükséges:

1. Környezetenként külön P-256/ES256 kulcspár, a privát rész kizárólag a Worker `OFFLINE_ENTITLEMENT_PRIVATE_JWK` secretjében. Privát kulcs soha nem kerülhet `VITE_` változóba, frontendbe, Gitbe vagy logba.
2. Az azonos pár nyilvános JWK-ja a frontend `VITE_OFFLINE_ENTITLEMENT_PUBLIC_JWK` buildváltozójában. A kliens hálózati/cache-adatból nem fogad el helyettesítő ellenőrzőkulcsot. Privát `d` mezőt tartalmazó JWK-t sem fogad el.
3. Worker és frontend kiadása; az adott builddel online igazolás beszerzése, majd későbbi összevont telefonos/PWA ellenőrzés. Kulcs nélkül a szokásos online hozzáférés működik, offline fizetős jog nem adható. Kulcsrotáció után a régi igazolás új online ellenőrzést igényel.

Web Locks nélküli környezetben csak a lapon belüli közös refresh garantált; több lapra ott nem állítunk versenymentességet. A helyi óra és tárhely tudatos, teljes visszaállítása nem helyettesíthető megbízható hardveres idővel egy webes kliensben. A távolról történt jog-/eszközvisszavonás offline az utolsó igazolás lejártáig nem ismerhető meg; online ellenőrzéskor érvényesül. A szerver API minden alkalommal az aktuális állapotot nézi.

A fizetés szolgáltatói bekötése és a valódi harmadik készülékes/repülőmódos elfogadás továbbra is kiadási kapu. Most nincs új tulajdonosi kézi tesztkérés; M1–M6 nem ismétlendő.

## Következő és GitHub Summary

**A18 — a proxy eredetellenőrzésének és a belépési kérések védelmének megmaradt ellenőrzése, gépi próbákkal. GPT-6 Astra · erős (high); most nem szükséges tulajdonosi tesztelés.** Meglévő implementáció és próbák felmérésével indul, kész részek újraírása nélkül.

GitHub Desktop Summary: `Coordinate session refresh and add signed offline entitlement receipts`
