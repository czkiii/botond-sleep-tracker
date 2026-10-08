# Solemi V1 — trial szabály

Tulajdonosi döntés: 2026-10-01, a beszélgetésben megadott szabályok alapján.
Státusz: elfogadott termékkövetelmény; a szerveroldali helyi rész 2026-10-07-én megvalósítva és géppel ellenőrizve. Kiadás, paywall és Apple/Google ajánlat-egyeztetés még nyitott. [Implementáció és határok](TRIAL_RULES_CHECKPOINT_2026-10-07.md).
A korábbi eltérő trial-leírásokat ez pontosítja. Az A11 előfizetési munka része; nem változtatja meg a jelenlegi feladatsorrendet.

## Jóváhagyott szabályok

- A Family vagy Family+ csomag 7 napig próbálható ki.
- Egy Solemi-account a teljes élettartama alatt legfeljebb egy 7 napos trialt aktiválhat, összesen a két csomagra.
- Egy Family összesen legfeljebb 4 külön felhasználói trialt használhat fel. Egymást követő próbákkal elméletileg legfeljebb 28 nap próbajog érhető el. Ez nem automatikusan járó 28 napos ajánlat.
- Aktiváláskor rögzíteni kell a felhasználót és az érintett Familyt. Family nélküli aktiválás is azonnal felhasználja az account egyetlen trialját.
- Családváltás, új Family létrehozása, kilépés, újratelepítés, telefoncsere, export/import vagy adat-visszaállítás nem reseteli az account felhasznált trialját.
- Family nélkül aktivált trial után egy későbbi Familybe belépés nem ad új trialt.
- Ha egy Family felhasználta a 4 lehetőségét, új tag sem indíthat további trialt ott, még fel nem használt accountjoggal sem.
- Aktív trial közbeni Family-váltás nem hozhat létre második vagy párhuzamos trial entitlementet.
- V1-ben nincs IP-, device fingerprint- vagy hasonló agresszív visszaélés-védelem. A legfeljebb négy külön accounttal elérhető hosszabb családi kipróbálás tudatos üzleti engedmény.
- Marketing: „Próbáld ki 7 napig ingyen.” A 4/Family korlát nem kiemelt reklámüzenet, de szerepeljen a részletes feltételekben.

## Tulajdonossal pontosítva — 2026-10-07

A három korábban nyitott kérdésre a tulajdonos a beszélgetésben az alábbi választ adta:

- Family nélkül indított trial a hátralévő idővel hozzárendelhető az első Familyhez, és ezzel elfogyaszt egy családi helyet. Betelt keretnél nem ad családi próbahozzáférést.
- A már hozzárendelt trial az eredeti Familyhez kötődik, nem vihető másikba. Kilépés/új család nem hoz létre második trialt és nem nullázza a keretet.
- Egy Familyben egyszerre csak egy családi trial futhat. Másik tag ilyenkor nem indíthat újabbat; az elutasítás nem fogyasztja az account még felhasználatlan jogát. Nincs automatikus trial-sorbaállítás.

A helyi megvalósításban a tagság önmagában akkor is létrejöhet, ha egy korábban család nélkül indított trial nem köthető oda (betelt keret vagy másik aktív családi próba). A személyes trial eredeti lejárata megmarad, a család nem örökli ezt a jogot. Az időközben felszabaduló, még nem betelt Familyhez külön hozzárendelési kérés adható, csak az eredeti trialból hátralévő idővel. Kilépés után az eredeti családi hely és időszak nem szabadul fel; a család a kilépett tag trialját nem használhatja. Visszalépés ugyanoda a megmaradt időre helyreállíthatja a megosztott hozzáférést.

## Meglévő feladatokhoz kapcsolás

- A11: szerveroldali account- és Family-nyilvántartás, egyszeri aktiválás, párhuzamos kérések és ismétlések elleni atomi védelem; a Solemi-szabály és az Apple/Google trial-jogosultság összehangolása.
- A04/A16: tagságváltás és hozzáférés kezelése, új vagy párhuzamos trial létrehozása nélkül.
- A17: accounttörlés és trial-előzmények megőrzésének összhangja; a szükséges adat és megőrzési idő külön meghatározandó, nem vezetünk be korlátlan személyesadat-megőrzést ebből a döntésből.
- A23: marketing, paywall és részletes feltételek azonos szabályt közöljenek.

A szabályhoz szükséges próbák a meglévő billing tesztcsomag részei lesznek. Új kézi tesztkört ez a dokumentum nem indít.
