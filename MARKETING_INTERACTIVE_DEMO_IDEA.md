# Solemi Sleep — interaktív marketingdemó ötlete

**Rögzítve:** 2026-09-23. **Állapot:** feljegyzett tulajdonosi ötlet, még nem jóváhagyott fejlesztési scope vagy kiadási feltétel.

## Kiindulás

A tulajdonos a Solemi marketingweboldalát Copilottal készíti. Felmerült, hogy a weboldal telefonkeretében egy külön, regisztráció nélkül kipróbálható Solemi-demó fusson. A bemásolt szöveg egy ehhez készült javaslat; a benne szereplő megvalósítási utasítások nem jelentenek mostani felhatalmazást a demó megépítésére vagy publikálására.

## A javasolt látogatói élmény

- A látogató a marketingoldalon, telefonméretű beágyazott felületen indíthat és leállíthat egy mintaalvást.
- Megnézheti a mai alvásokat és néhány előre feltöltött előzményt; kézzel is rögzíthet egy bejegyzést.
- Láthat egyszerű, a demóadatokból számított napi/heti/havi statisztikát.
- A beállítások legfeljebb a mintagyermek nevét és a demó alaphelyzetbe állítását tartalmazzák.
- A látvány kövesse a valódi Solemi nyugodt, sötét, mobilra tervezett megjelenését és a nagy alvásgombot.

## Elválasztás a valódi alkalmazástól

A javaslat szerint a demó külön, önálló webes build vagy projekt lenne, amelyet a marketingoldal iframe-ben jelenít meg. Nem használna valódi accountot, Family Syncet, fizetést, export/importot, éles API-t vagy családi adatokat. Csak mintaadatokkal működne; a látogató próbálkozásai helyiek és törölhetők. A telefonkeretben való használhatóság, az egyetlen természetes görgetés és a teljes alkalmazásból való véletlen kilépés elkerülése fontos elfogadási szempont.

Az eredeti javaslat React + Vite, GitHub Pages és `localStorage` használatát, valamint iframe-beágyazást ír le. Ezek **vizsgálandó technikai lehetőségek**, nem végleges döntések. A külön kódbázis fenntartási költségét és az iframe működését a választott marketinghostingon előbb ellenőrizni kell. A demó nem mutathat a valódi appban nem létező vagy eltérően működő funkciót.

## Nyitott döntések a megvalósítás előtt

1. Elég-e az első marketingváltozathoz a fő élmény (alvás indítása/leállítása és előzmények), vagy szükséges az egész leírt demófunkció-kör?
2. Külön repository, külön build ugyanabban a repositoryban, vagy a valódi appból leválasztott demómód legyen a fenntartható megoldás?
3. Melyik publikus tárhely és domain szolgálja ki a demót, és működik-e biztonságosan a Copilottal készülő oldal iframe-jében?
4. A demó böngészőben tárolt próbálkozásai maradjanak-e meg új látogatáskor, vagy induljon mindig tiszta mintából?
5. Ki tartja naprakészen a demót, amikor a valódi app felülete vagy statisztikái változnak?

**Sorrend:** az ötlet nem helyettesíti a jelenleg nyitott szinkron-, adatmegőrzési, fizetési és áruházi kiadási kapukat. Külön munkaként lehet később jóváhagyni és megvalósítani.
