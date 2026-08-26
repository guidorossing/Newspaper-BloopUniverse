# Extra ideeën & uitbreidingsroadmap

Jouw basislijst is volledig gebouwd. Hieronder eerst wat er al in zit, daarna
extra ideeën (deels al gebouwd, deels als roadmap) om het systeem verder te
laten groeien met Bloop Universe.

## Al gebouwd (jouw basislijst + extra opties)

- **Kanaalinstellingen** — onderwerp, titelformat, thumbnailformat,
  concurrentenlijst, uploaddagen én KPI's: AVD, CTR, levertijd, omzetgroei
  en **uploadfrequentie als verplicht veld** — een kanaal opslaan zonder
  uploadfrequentie kan letterlijk niet.
- **Stappenplan/pipeline** — Idee → Script → Voice/Avatar → Video-edit →
  Thumbnail → Upload, zichtbaar als stappenbalk per video.
- **Checkpoints per stap** — freelancer levert in, admin keurt goed/af;
  pas na goedkeuring gaat de volgende freelancer aan de slag (met
  Discord-ping). Afkeuren = feedback die bij de stap blijft staan.
- **To-do-lijst** — algemeen of per kanaal, met deadline en afvinken.
- **Channel Admin** — alle kanaalinfo + wachtwoorden, versleuteld, met
  gelogde onthulling (alleen admin).
- **Toegangsbeheer** — rollen admin/manager/freelancer; freelancers zien
  geen omzet en geen vault.
- **Instructiecentrum** — uitgeschreven werkinstructies voor scriptwriter,
  video-editor en thumbnail-artiest, plus algemene teamafspraken.
- **Discord** — webhook-notificaties + volwaardige bot met
  goedkeuringsknoppen (zie docs/discord-integratie.md).
- **Extra's die er al bij zitten:** dashboard met openstaande checkpoints,
  deadlinebewaking (te laat / binnen 24u) met dagelijkse Discord-reminder,
  activiteitenlog (wie deed wat), en een opleverlink per stap zodat al het
  werk terugvindbaar is.

## Extra ideeën — aanbevolen volgende stappen

### 1. Ideeënbank met scoring (hoogste prioriteit)
Een aparte backlog vóór de pipeline: iedereen mag ideeën pitchen (ook via
Discord in `#ideeen`), jij scoort ze op outlier-potentie (doet dit concept
het bij concurrenten?), zoekvolume en productiekosten. Elke week promoveer
je de beste ideeën naar de pipeline. Zo komt de pipeline nooit droog te
staan — de #1 reden dat uploadfrequenties sneuvelen.

### 2. KPI-realisatie naast de doelen
Nu leg je de **doelen** vast (AVD, CTR, omzetgroei); de volgende stap is per
geüploade video de **werkelijke** cijfers invoeren (of via de YouTube
Analytics API ophalen) en op het dashboard doel-vs-realisatie tonen met
stoplichtkleuren. Dan zie je per kanaal én per freelancer wat werkt:
welke scriptwriter de beste AVD haalt, welke thumbnail-stijl de beste CTR.

### 3. Publicatiekalender
Weekkalender die de uploadfrequentie bewaakt: als een kanaal 2× per week
moet uploaden en er zit maar 1 video ver genoeg in de pipeline, kleurt de
week rood en gaat er een Discord-alarm af. Uploadfrequentie wordt zo niet
alleen geregistreerd maar ook **afgedwongen**.

### 4. Freelancer-administratie
Per freelancer: tarief per stap, gemiddelde levertijd, aantal revisierondes,
beoordeling. Gecombineerd met een kostenveld per video weet je precies wat
een video kost en (met idee 2) wat hij oplevert → marge per video, per
kanaal, per freelancer. Onmisbaar zodra je gaat opschalen naar meerdere
kanalen.

### 5. QC-checklist vóór upload
De upload-stap uitbreiden met een verplicht af te vinken lijstje:
eindscherm + kaarten, beschrijving met keywords, tags, pinned comment,
juiste afspeellijst, thumbnail geüpload, première/publicatietijd volgens
schema. Pas als alles is afgevinkt kan de stap worden ingeleverd.

### 6. Template-bibliotheek
Bewezen titelformules, thumbnail-sjablonen, script-hooks en beschrijving-
templates per kanaal opslaan en direct kunnen invoegen bij een nieuwe video.
Elke keer dat iets goed werkt (hoge CTR/AVD) sla je het op als template —
zo wordt het systeem elke maand slimmer.

### 7. Learnings-log per video
Na elke upload één verplicht veld: "wat nemen we mee naar de volgende
video?" (retentiegrafiek-observaties, comments, wat de concurrent deed).
Goedkoop om bij te houden, goud waard na 20 video's.

### 8. Onboarding-flows
Checklist "nieuwe freelancer" (account aanmaken, Discord-rol, instructie
gelezen laten afvinken, testopdracht) en "nieuw kanaal" (alle
kanaalinstellingen, vault-items, Discord-kanaal, concurrentenlijst).
Maakt opschalen herhaalbaar in plaats van chaotisch.

### 9. Concurrenten-monitoring
De concurrentenlijst per kanaal periodiek langslopen (handmatig of via een
tool als NexLev): welke video's van hen zijn outliers? Die voeden direct de
ideeënbank (idee 1). Eventueel automatiseerbaar met een wekelijkse
Discord-post "outliers van de week bij jullie concurrenten".

### 10. Meertalige uitrol
Zodra een video bewezen goed presteert: dezelfde pipeline nogmaals draaien
voor een tweede taal (nieuw kanaal, zelfde script vertaald, zelfde
thumbnail-format). Het systeem ondersteunt meerdere kanalen al — dit is
puur een werkwijze-idee met heel hoge hefboom voor faceless content.

## Volgorde-advies

1. Ideeënbank (1) en QC-checklist (5) — klein, direct effect op kwaliteit
   en continuïteit.
2. Publicatiekalender (3) — bewaakt je belangrijkste KPI.
3. KPI-realisatie (2) + learnings-log (7) — maakt het systeem lerend.
4. Freelancer-administratie (4) — nodig zodra je >5 freelancers hebt.
5. De rest op het moment dat de schaal erom vraagt.
