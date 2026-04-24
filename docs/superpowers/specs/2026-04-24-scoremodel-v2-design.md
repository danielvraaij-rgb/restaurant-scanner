# Score Model v2 — Design Document

**Date:** 2026-04-24
**Status:** Approved
**Source spec:** `public/restaurant_scoremodel_v2.docx`

---

## Doel

Het huidige 70-punten model (50% puur technisch) vervangen door een bezoeker-georiënteerd model dat échte websitekwaliteit voor restaurants meet. Inhoud en conversie zijn het primaire criterium; techniek is ondersteunend.

---

## Architectuur

### Nieuwe/gewijzigde bestanden

| Bestand | Actie | Verantwoordelijkheid |
|---|---|---|
| `lib/scoreModel.ts` | Nieuw | Types + `calcRestaurantScore()` + `calcProspectScore()` |
| `lib/contentChecks.ts` | Nieuw | Alle cheerio HTML-parsing functies |
| `app/api/analyze/route.ts` | Nieuw (vervangt pagespeed) | Orchestratie: fetch → parse → Lighthouse → score |
| `app/page.tsx` | Aanpassen | UI, types, state — alleen notitieveld in handmatig paneel |
| `app/api/pagespeed/route.ts` | Verwijderen | Functionaliteit zit in analyze route |

### Data flow

```
Gebruiker klikt "Analyseer website"
  → GET /api/analyze?url=...
  → fetch() HTML van restaurant URL
  → cheerio parset HTML → contentChecks.ts functies → ruwe scores
  → Google PageSpeed API → LCP, 3 mobile audits, meta-desc, structured data
  → calcRestaurantScore(checks) → { totaal, pijlers }
  → calcProspectScore(scoreResult, noWebsite) → prospectScore
  → Response: { noWebsite, totaalScore, prospectScore, pijlers, checks }
  → page.tsx: restaurant state update, UI herrendering
```

---

## Score Model v2 — 100 punten

### Pijler 1: Inhoud & Informatie (45pt)

| Check | Max | Methode |
|---|---|---|
| Menu aanwezig | 15 | Tekstanalyse + prijsregex (cheerio) |
| Adres + routeinfo | 10 | Straat/postcode regex + Maps-link detectie |
| Openingstijden | 10 | Dag + tijdpatronen regex |
| Foto's van gerechten | 5 | img-count + food alt-teksten |
| Over ons / verhaal | 5 | Keyword detectie |

**Menu gradaties:** 15pt (gerechten + prijzen) / 10pt (gerechten, geen prijzen) / 5pt (PDF of afbeelding) / 0pt

**Adres gradaties:** 10pt (adres + Maps link/embed) / 6pt (adres, geen kaart) / 3pt (alleen plaatsnaam) / 0pt

**Openingstijden gradaties:** 10pt (volledige dagen + tijden) / 6pt (gedeeltelijk) / 3pt (alleen tijden) / 0pt

### Pijler 2: Conversie & Contact (25pt)

| Check | Max | Methode |
|---|---|---|
| Online reservering | 12 | Bekende systemen + eigen formulier detectie |
| Telefoonnummer zichtbaar | 8 | tel: links + regex + prominentie check |
| E-mail of contactformulier | 5 | mailto: links + form detectie |

**Reservering gradaties:** 12pt (TheFork/OpenTable/eigen form) / 8pt (telefoon als primaire optie) / 4pt (email reservering) / 0pt

**Telefoon gradaties:** 8pt (prominent in header/nav) / 5pt (aanwezig maar niet prominent) / 0pt

### Pijler 3: Gebruikerservaring (20pt)

| Check | Max | Methode |
|---|---|---|
| Mobielvriendelijk | 10 | 3 Lighthouse audits: content-width + tap-targets + font-size |
| Laadsnelheid (LCP) | 7 | LCP < 1.5s=7, < 2.5s=5, < 4s=2, trager=0 |
| Dode links | 3 | Altijd 3pt (niet geïmplementeerd in v2, fetch-only aanpak) |

**Mobile gradaties:** alle 3 audits pass = 10pt / 2 van 3 = 6pt / 1 of 0 = 0pt

### Pijler 4: Technische Basis (10pt)

| Check | Max | Methode |
|---|---|---|
| HTTPS actief | 5 | URL-check |
| Meta description | 3 | Lighthouse audit |
| Structured data | 2 | Lighthouse audits (niet grep op JSON) |

---

## Prospect Score v2

```
noWebsite: true  →  prospect = 100 (altijd bovenaan, beste prospect)

Anders:
  verbeterpotentie = 100 - totaalScore
  contentKwaliteit = pijler.inhoud / 45  (0–1)
  prospect = round(verbeterpotentie * 0.6 + contentKwaliteit * 100 * 0.4)
  prospect = min(100, prospect)
```

**Rationale:** Hoge inhoudsscore maar slechte UX/tech = restaurant investeert in content maar site presteert slecht → goede prospect. Lage inhoudsscore = niet actief op website → moeilijkere prospect.

---

## Datastructuur (Analysis interface)

```typescript
interface Analysis {
  noWebsite: boolean;
  scoredAt: string;
  scoreModelVersion: '2.0';
  totaalScore: number;
  prospectScore: number;
  pijlers: {
    inhoud: number;   // max 45
    conversie: number; // max 25
    ux: number;        // max 20
    tech: number;      // max 10
  };
  checks: {
    menuScore: number;       // 0-15
    menuDetail: string;
    adresScore: number;      // 0-10
    tijdenScore: number;     // 0-10
    fotoScore: number;       // 0-5
    verhaalScore: number;    // 0-5
    reserveringScore: number; // 0-12
    reserveringDetail: string;
    telefoonScore: number;   // 0-8
    emailScore: number;      // 0-5
    mobileScore: number;     // 0-10
    mobileDetail: string;
    speedScore: number;      // 0-7
    lcpMs: number;
    deadLinkScore: number;   // altijd 3 in v2
    httpsScore: number;      // 0-5
    metaDescScore: number;   // 0-3
    structuredScore: number; // 0-2
  };
}
```

---

## UI wijzigingen (page.tsx)

### Kaart header (score rings)
- AUTO ring → toont `pijlers.inhoud`, weergegeven als `Math.round(inhoud/45*100)` (0-100 schaal voor ring), label "INHOUD"
- HAND ring → toont `pijlers.conversie`, weergegeven als `Math.round(conversie/25*100)` (0-100 schaal voor ring), label "CONV"
- PROSPECT ring → blijft, gebruikt `prospectScore` direct (0-100), label "PROSPECT"

### Detail paneel — links
Pijler breakdown tabel:
```
Inhoud      38/45  ████████░
Conversie   12/25  ████░░░░░
UX          12/20  ████░░░
Tech         5/10  ████░
```

### Detail paneel — rechts
Alleen notitieveld (geen design/menu/reservering/foto toggles meer).

### Handmatige score (ManualScore interface)
Wordt gereduceerd tot `{ notes: string }`.

### calcProspect in page.tsx
Verwijderd — prospectScore komt uit de API response.

---

## Dependencies

`cheerio` toevoegen aan package.json (HTML parsing, lichtgewicht, geen browser nodig).

---

## Wat verdwijnt

- `app/api/pagespeed/route.ts` — verwijderd
- `calcAutoScore()`, `calcManualScore()`, `calcProspect()` in page.tsx — verwijderd
- ManualScore velden: `designScore`, `menuOnline`, `onlineReservation`, `foodPhotos`
- CheckRow componenten die v1 analyse tonen

---

## Implementatievolgorde

1. `lib/scoreModel.ts` — types + scoring functies
2. `lib/contentChecks.ts` — HTML parsing functies
3. `app/api/analyze/route.ts` — orchestratie
4. `app/page.tsx` — UI update
5. `cheerio` installeren, `pagespeed` route verwijderen
