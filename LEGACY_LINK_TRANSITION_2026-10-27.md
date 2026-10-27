# A régi GitHub-link átvezetése az új appra

A tulajdonos 2026-10-27-én kifejezetten jóváhagyta, hogy a
`https://czkiii.github.io/botond-sleep-tracker/` az új alkalmazáshoz,
`https://solemi-sleep-internal.pages.dev/` címre vezessen. Ez a meglévő
tesztkörnyezet; nem új nyilvános webapp-kiadás vagy adatbázis-migráció.

- Napló nélküli böngésző automatikusan továbblép.
- Régi V3/V4 napló esetén először letöltési lehetőség és továbblépő gomb jelenik meg.
- A továbblépés elfogadása csak a napló pillanatképének hashét tárolja; megváltozott
  régi napló esetén újra felajánlja a mentést. A naplóhoz és a szinkronhoz nem ír.
- `?backup=1` bármikor megnyitja a régi helyi mentés letöltését ugyanabban a böngészőben.
- Sérült tárhelyet nyersen lehet menteni; letiltott tárhelynél nincs automatikus továbblépés.
- A régi service worker frissítése megvárja az összes régi ablak bezárását.
  Nincs kényszerített újratöltés, cache-törlés vagy localStorage-törlés.
- Másik webcímre nem kerül automatikusan napló, családazonosító vagy belépési adat.
  A friss exportot az új appban külön importálni kell; ez még nincs igazolva.

A `deploy-pages.yml` kizárólag a `legacy-entry/` négy statikus fájlját csomagolja.
A main kötelező Frontend/Worker CI-védelme és az új app release guardja változatlan.
A workflow kézi indítású marad. A Cloudflare app/backend konfigurációja változatlan.

A kötelező PR CI-ben időközben megjelent függőségi auditjelzések miatt célzott
fejlesztői frissítés is szükséges: `fast-uri` 3.1.9, `serialize-javascript` 7.1.4;
a jelenlegi Miniflare rögzített függőségére Worker-szintű `undici` 7.30.1 override.
A Wrangler/Miniflare és az alkalmazás futásidejű függőségei nem változnak.
Az undici javítás forrása: https://github.com/advisories/GHSA-4qv8-2p9j-2685.

## Bizonyíték és ismétlés

`node scripts/check-legacy-entry.mjs` — elkülönített Edge, szintetikus napló,
külső céloldal helyi helyettesítővel. Sikeres: V3 export aktív alvással, kizárt
szinkronkulcs, explicit átvezetés és következő automatikus belépés, visszatérés
mentésért, változott/sérült/tiltott tárhely, üres böngésző, várakozó SW,
megőrzött napló/cache, offline mentés. A `SOLEMI_PLAYWRIGHT_MODULE` a meglévő
Playwright-csomagra, `SOLEMI_BROWSER_CHANNEL` igény szerint más böngészőre mutathat.

A régi oldal 11 statikus fájlja, SHA-256 jegyzéke és a mobilnézet képe helyben,
Gitből kizárva: `worker/.private-backups/pages-transition-2026-10-27/`.
A `legacy-site/` tartalma az eredeti `/botond-sleep-tracker/` alatti publikálási
csomag: visszaállításkor ezt kell külön Pages artifactként kiadni, nem a jelenlegi
belépőoldal-buildet futtatni. A mentés nem tartalmaz böngészőből olvasott naplót.

## Tulajdonosi következő lépés

A régi linket megnyitni; ha még a korábbi telepített app látszik, minden régi
Solemi-ablakot bezárni és újranyitni. Az új appban a friss október 27-i napló
importja és ellenőrzése következik, nem a korábbi családi tesztek újrakezdése.
Az eredeti export 223 rekordot tartalmazott, ebből egy aktív; az import tényleges
eredményét az új appban még ellenőrizni kell.

A további irány: meglévő új app elfogadása → fizetési integráció → Android/iOS
csomagolás és store-kiadás. Külön nyilvános webapp/domain nem kötelező lépés.
