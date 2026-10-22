# A17 — megőrzési döntések és trial újraregisztráció után

**2026-10-15-i technikai folytatás:** [helyi technikai checkpoint](A17_RETENTION_IMPLEMENTATION_2026-10-15.md). A lentebb szereplő „még nem készült el” megjegyzések a döntéskori állapotot írják le; a jelenlegi implementáció és a még nyitott restore/üzemeltetési kapu az új checkpointban szerepel.

Dátum: 2026-10-14. Kiinduló commit: `406d0f2`. Státusz: az alábbi öt termékdöntés a beszélgetésben jóváhagyva; a tájékoztatók egyeztetése elkészült. Nem jogi jóváhagyás és nem technikai aktiválás.

## Már jóváhagyott pontosítás

A tulajdonos ebben a beszélgetésben elfogadta: **a végleg törölt Solemi-fiók után ugyanazzal a Google-belépéssel újra regisztráló felhasználó nem kap új 7 napos trialt, ha azt korábban már felhasználta.** Ehhez elkülönített, minimális trialjelölés megőrzése szükséges. A korábban fel nem használt trialt önmagában a fióktörlés nem fogyasztja el.

Az eredeti account egyszeri trialja, a Family legfeljebb négy külön trialja és az egyszerre egy aktív családi trial szabálya változatlan. Új fiók nem kapja vissza a törölt profil adatait, családi tagságát vagy a régi trialból hátralévő időt. Nem készül IP- vagy eszközujjlenyomat-alapú azonosítás. E-mail-egyezésből nem kapcsolunk össze fiókokat; az ellenőrzött bejelentkezési szolgáltató stabil azonosítója számít.

Ez az elfogadott szabály felülírja az előző A17 checkpoint előzetes feltételezését, amely szerint az új regisztráció nem lenne összekapcsolható trialcélból. **A jelenlegi szerverkód ezt az új szabályt még nem hajtja végre:** véglegesítéskor törli a Google-identitást. A funkció nem aktiválható addig, amíg az új jelölés, ellenőrzés és mentés utáni megőrzés nincs géppel igazolva.

## Jóváhagyott megőrzési szabályok

| Adatkör | Határidő / megszűnési feltétel | Cél és korlát |
| --- | --- | --- |
| Trialjelölés azonos Google-belépéshez | Az egyszeri trialprogram fennállásáig; legalább évente szükségességi felülvizsgálat; a program megszűnésekor törlendő | Csak a már felhasznált próba ismétlésének kizárása. A korábbi trialt nem használó személyre nem készül felhasználási jelölés. |
| Solemi által kezelt teljes adatbázismentés | A mentés készítésétől legfeljebb 30 nap | A szolgáltatói és a saját kézi/exportált másolatokra is kiterjed. Másolás, letöltés, tömörítés nem indítja újra a korát. A felhasználó saját letöltött exportja nem üzemeltetői mentés. |
| Törlési nyilvántartás és helyi törlési nyugta | Az érintett mentések lejárata/megsemmisítése és a függő helyreállítások lezárása közül a későbbitől még 30 nap | Csak a törlés visszaállítás utáni ismételt érvényesítéséhez szükséges technikai adatok. Függő törlési/helyreállítási döntés nem járatható le. |
| Normál technikai napló | Az eseménytől legfeljebb 30 nap | Rövidebb szolgáltatói megőrzés maradhat. Gyermeknév, naplótartalom, token és teljes kérés-/választörzs nem része a célzott hibakeresési naplónak. |
| Igazolt incidenshez kiválasztott minimális bizonyíték | Az incidens dokumentált lezárásától 90 nap | Csak kiválasztott részlet, nem a teljes napló újramegőrzése. Nyitott incidens szükségességét rendszeresen felül kell vizsgálni. |
| Nem számviteli store/billing technikai rekord | Az előfizetési jog végleges megszűnése és az esetleges visszatérítési vita lezárása közül a későbbitől legfeljebb 24 hónap | Szükséges tranzakció- és jogosultsági adatok. Nem a teljes profil, és nem a gyermeknapló. Fióktörlés önmagában nem zárja le az áruházi előfizetést. |
| Kötelező számviteli/adózási bizonylat | A ténylegesen alkalmazandó jogszabály és bizonylattípus szerint, könyvelővel meghatározandó | Nem a 24 hónapos termékszabály alá esik. Nem mondjuk minden store-rekordról automatikusan, hogy számviteli bizonylat. |

A 24 hónap naptári hónapot jelent, a kezdő időponttal azonos UTC idővel; nem létező célhavi napnál a hónap utolsó napjával. A napok 24 órás időtartamok. Ez az implementációhoz rögzített időszámítási pontosítás. Egy ismételt webhook, ellenőrzés vagy fájlmásolat önmagában nem tolhatja ki a határidőt.

A fenti időtartamok felső korlátok, nem kötelező minimumok. A cél korábbi megszűnésekor a szükségtelen adat törlendő. Hosszabb kivétel csak konkrét jogi kötelezettség vagy igény alapján, az érintett minimális rekordokra, indokkal, felelőssel és felülvizsgálati határidővel dokumentálható. Nincs általános „biztonság kedvéért” hosszabbítás.

### Ami változatlan

- Azonnali végleges törlés, vagy a felhasználó által választott legfeljebb 30 napos recovery; normál hozzáférés már a kéréskor megszűnik.
- A recovery határideje nem hosszabbodik. A határidő előtt tartósan elfogadott helyreállítás technikai befejezése átmeneti hiba után folytatható. Lejárat után új helyreállítás nem választható.
- A véglegesítés és a mentések kifutása eltérő folyamat; nem ígérünk minden másolat azonnali fizikai eltűnését. Régi mentés nem használható törölt fiók újraaktiválására.
- Más aktív családtag közös naplója megmarad; az utolsó tag saját családi naplója a választott törlési folyamat szerint törlődik.
- Nincs automatikus áruházi előfizetés-lemondás. Más offline eszköz és korábban letöltött fájl innen nem törölhető.

### A trial-nyilvántartások külön céljai

A belépéshez kapcsolható felhasználási jelölés nem ugyanaz, mint a Family négyes keretének számlálója vagy a törlési nyugta. A Family keretét a Family fennállásáig kell védeni; a megszüntetett Family kerete nem öröklődik egy új Familyre. Az új Family ettől még nem ad új trialt annak, aki ugyanazzal a belépéssel már felhasználta a sajátját. A megszüntetett Family technikai előzményeinek takarítását a még létező mentésekkel és törlési rendelkezésekkel össze kell hangolni; nem tartható meg emiatt a gyermeknapló.

## Tájékoztatók és kiadási feltételek

Az egyeztetett, teljes magyar tervezet: [Solemi adatkezelési tájékoztató — 2026-10-14](SOLEMI_PRIVACY_POLICY_HU_2026-10-14.md). A régi TXT az eredeti tulajdonosi forrás marad. A trial-feltételek az [eredeti trialdokumentum kiegészítésében](SOLEMI_V1_TRIAL_RULES_2026-10-01.md) is szerepelnek.

A tervezet nem publikálható véglegesként, amíg a tényleges működés nem igazolt, az adatkezelő és kapcsolattartó adatai nincsenek kitöltve, valamint a jogalapok és a kötelező bizonylatmegőrzés nincsenek véglegesítve. A szükségességi/érdekmérlegelési ellenőrzés nem újabb app-tesztkör.

A jelenlegi szerver még nem tárol tartós, belépéshez kötött trialjelölést; a most elfogadott időalapú retention-takarítás sem készült el. A törlési journal jelenlegi DELETE-tilalmát csak igazoltan lejárt, már nem szükséges rekordokra kialakított, külön ellenőrzött eljárással szabad később feloldani. Egy egyszerű „60 napnál régebbi sorok törlése” nem teljesíti a mentési/függő helyreállítási feltételeket.

A régi mentés visszatöltése a trialjelölést és a családi keretet sem nullázhatja: friss, a naplómentéstől független jogosultsági előzmény szükséges. A meglévő offline visszaállító a törlési döntéseket kezeli; ezt a további üzleti előzményegyeztetést még nem helyettesíti. A kikapcsolt fióktörlési funkció aktiválásának ez is feltétele.

## Előkészített rövid felületi szöveg

Ezek a jóváhagyott szabályhoz készített célállapot-szövegek. A működő felületre a trialvédelem igazolásával együtt kerüljenek; ebben a dokumentációs blokkban alkalmazáskód nem változott.

**HU:** „A korábban felhasznált 7 napos próba a fiók törlése és ugyanazzal a Google-belépéssel történő új regisztráció után sem indul újra. Ennek ellenőrzésére minimális trialjelölést őrzünk az egyszeri trialprogram fennállásáig, évente felülvizsgálva a szükségességét. A családi próbakeret sem nullázódik. A fióktörlés nem mondja le az áruházi előfizetést.”

**EN:** “A previously used 7-day trial does not restart if you delete your account and register again with the same Google sign-in. We retain a minimal trial-use marker while the one-time trial programme exists, reviewing its necessity annually. The family trial allowance does not reset either. Account deletion does not cancel your store subscription.”

**DE:** „Eine bereits genutzte 7-tägige Testphase beginnt nach der Kontolöschung und einer erneuten Registrierung mit derselben Google-Anmeldung nicht erneut. Dafür speichern wir einen minimalen Nachweis der Testnutzung, solange das einmalige Testprogramm besteht, und prüfen seine Erforderlichkeit jährlich. Auch das Testkontingent der Familie wird nicht zurückgesetzt. Die Kontolöschung kündigt kein Store-Abonnement.“

## Adatvédelmi és megvalósítási keret

A trialjelölés nem anonim adat attól, hogy nem tartalmaz e-mailt vagy nevet. Kizárólag a próba egyszeri felhasználásának ellenőrzésére szolgálhat; nem marketingre vagy a törölt napló visszaépítésére. Tervezett technikai megoldás: külön titkos kulccsal képzett, célhoz kötött HMAC a szolgáltató és stabil belépési azonosító alapján, kulcsverzióval és minimális felhasználási jelöléssel. A nyers azonosító vagy a bejelentkezési token tárolása erre a célra nem szükséges. Ez műszaki terv, nem elkészült funkció.

A termékdöntés nem helyettesíti a jogalap, szükségesség és arányosság dokumentálását. Az éves felülvizsgálat önmagában nem tesz bármilyen megőrzést jogszerűvé. A kiadási tájékoztatóban az időtartamot vagy annak meghatározási szempontjait és az érintetti jogokat pontosan meg kell adni. [Európai Bizottság: adatkezelési alapelvek](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en), [EDPB: jogszerű adatkezelés](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en).

A Cloudflare dokumentációja szerint a D1 Time Travel Free csomagban 7, Paid csomagban 30 napra tekint vissza; a Workers Logs jelenlegi megőrzése Free esetén 3, Paid esetén 7 nap. Ezek szolgáltatói lehetőségek, nem a Solemi tényleges production konfigurációjának igazolása. A rövidebb megőrzést nem kell mesterségesen meghosszabbítani egy belső felső korlát kedvéért. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

A szeptember 20-i tulajdonosi TXT-források történeti példányai megmaradnak; a pontosított kiadási szöveg külön, új verzióban készül. Távoli módosítás, kiadás vagy valódi fióktörlés nem része ennek az egyeztetésnek.

## Ellenőrzés és folytatás

Ez a blokk termékdöntéseket és dokumentációt módosít, nem futó kódot. Ellenőrzés: 9 dokumentációs fájl; a három irányadó dokumentum 7 helyi hivatkozása érvényes; a 30/90 napos és 24 hónapos határok, valamint a programhoz kötött trialmegőrzés egyeznek. Az eredeti tulajdonosi TXT-források változatlanok; az aktiválási konfigurációk továbbra is kikapcsoltak. A gépi dokumentumellenőrzés és a git diff --check sikeres. Alkalmazástesztet nem futtattunk újra, mert alkalmazáskód nem változott. A korábbi 841 teszt az előző implementáció bizonyítéka; nem bizonyítja az új trialjelölés vagy az új retention-takarítás működését.

**Következő: A17 — a jóváhagyott trialjelölés és megőrzési határidők technikai érvényesítése, gépi próbákkal. GPT-6 Astra · erős; kézi app-teszt nélkül indítható.** Az öt most elfogadott döntést nem kell újra megkérdezni. Ezt követi a távoli bekötés és a gépi főpróba; a teljes kiadási elfogadás nyitott.

GitHub Desktop Summary: `Finalize retention and post-deletion trial policies`

Description: Record approved trial re-registration protection, backup and log limits, deletion-journal expiry conditions and 24-month technical billing retention. Align the Hungarian privacy draft and HU/EN/DE deletion copy proposals. Keep original owner documents intact and distinguish policy approval from pending implementation and legal/release validation.
