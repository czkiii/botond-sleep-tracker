# A20 — beállítások és profilszerkesztés

Dátum: 2026-09-30. Feladatszint: GPT-6 Astra · erős.
Kiinduló HEAD: `bc7b298`, ág: `feat/child-profile-v4`; induláskor tiszta munkakönyvtár.
A tulajdonos most nem tud kézzel tesztelni, önállóan végezhető munkát kért.

## Elkészült helyi módosítások

- A családi megosztás saját beillesztési helyet kapott közvetlenül a gyermeklista után, az adatkezelő gombok előtt. A portal célpontja ezt a helyet követi, a beállítások újranyitásakor is.
- A nyelvválasztó önálló, legalsó kártyára került. A hosszú alvás jelzése külön, az eredeti felső helyén maradt.
- Gyermekválasztás és szerkesztés két külön valódi gomb. Nincs gombba ágyazott kattintható szerep; a kiválasztás `aria-pressed`, a szerkesztés gyermeknévvel megkülönböztethető nevet kapott. Enter/Space használható, látható fókusz és 44 px szerkesztőgomb van.
- A gyermek szerkesztő natív modális dialog: megnevezés, háttérből kizárt fókusz, Escape, fókuszvisszaadás. A névmező Enterrel ment (IME-kompozíció közben nem). Mentés alatt nincs újabb mentés vagy Escape-bezárás. Fotóvágásnál a mögöttes szerkesztő inert; első Escape csak a vágást zárja be.
- A 320 px-es német képen talált összenyomódó családi kártyaszöveget javítottuk: 380 px alatt az állapot külön sorba kerül.
- Az eszközkorlát szövege HU/EN/DE nyelven 1/2 és 2/2 lépésként előre jelzi az új Google-megerősítést és az ugyanazon fiók használatát. A hitelesítési/eszközvisszavonási működés nem változott; valódi OAuth-újrapróbát nem végeztünk.

## Ellenőrzések

- Teljes `npx vitest run`: 31 fájl, **379/379 PASS**.
- Frontend és Worker typecheck: PASS. Frontend typecheck a végleges JSX után is PASS.
- `npm run build`: PASS, a meglévő nagy bundle figyelmeztetéssel.
- Új `npm run test:settings`: **6/6 kombináció PASS**, HU/EN/DE × 320/393 px, Edge 154.0.4258.37. Valódi React felület, helyi Vite, friss böngészőkontextusok, saját tesztadatok; nincs fiók, API-hívás vagy külső hálózat.
- A böngészőpróba ellenőrzi a DOM-sorrendet, egyetlen szinkronkártyát, vízszintes túlcsordulás és szövegdoboz-átfedés hiányát, választást Space-szel, szerkesztőnyitást Enter/Space-szel, háttérfókusz tiltását, Escape-et, visszaadott fókuszt, Enter-mentést és reload utáni nyelv/kapcsoló/aktív gyermek/név/alvás megőrzését. HU 320 px-en a fotóvágás első Escape-je külön is ellenőrzött.
- Meglévő `check-child-deletion.mjs`: PASS, a modális szerkesztőből indított A14 törlés és helyreállítás is működik.
- Meglévő `check-family-bootstrap.mjs`: PASS, a kártya új helyéről a csatlakozás/halasztás/letöltési hiba/export/családi választás is működik.
- Képek `.private-backups/settings-{hu,en,de}-{320,393}.png`, valamint `settings-child-editor.png`. A német 320 px és a profilszerkesztő képe vizuálisan ellenőrizve. A tesztképek nem kerülnek Gitbe.
- A böngészőpróbák a meglévő külső Playwright futtatókörnyezetet használják (`SOLEMI_PLAYWRIGHT_MODULE`, `SOLEMI_BROWSER_CHANNEL=msedge`); új projektfüggőség nincs.

## Pontos lezárás és folytatás

A kért beállításrendezés és a gyermek szerkesztő fenti billentyűzetes hibái helyben elkészültek. **A20 teljes kapuja nyitott:** más modális felületek, alváskonfliktus-összehasonlítás, valódi telefonos VoiceOver/TalkBack, nagy betűméret és teljes mobilos vizuális ellenőrzés még nem igazolt.

M1/M2/M4 továbbra is kész; M3/M5/M6 kézi megállója a `MANUAL_ACCEPTANCE_2026-09-26.md` szerint megmarad. A tulajdonostól most nem kérünk belépést, új kézi tesztet vagy azonnali commit/push műveletet. A helyi módosítások nincsenek commitolva/pusholva/deployolva. A `bc7b298` commit megléte ellenőrzött, távoli staging verziója ebben a körben nem ellenőrzött.

**Következő önálló feladat: A22 — a stopper és a statisztikai számítások frissítésének szétválasztása, helyi teljesítményméréssel és regresszióval. Feladatszint: GPT-6 Astra · erős.** A telefonos teljesítményelfogadást a helyi mérés nem váltja ki.
