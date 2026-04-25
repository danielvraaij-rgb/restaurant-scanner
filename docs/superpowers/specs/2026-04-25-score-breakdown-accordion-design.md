# Score Breakdown Accordion — Design Spec

**Date:** 2026-04-25
**Status:** Approved

## Doel

Gebruikers kunnen nu per pijler zien hoe de score is opgebouwd. Door op een pijler-balk te klikken opent een accordion met de individuele criteria, hun score en een leesbare detail-string.

## Scope

Alleen `app/page.tsx` wijzigt. Geen backend-, API- of scoremodel-aanpassingen nodig — alle benodigde data zit al in `analysis.checks`.

## Component: PijlerBar (uitbreiding)

### Nieuwe prop

```ts
criteria: Array<{ label: string; score: number; max: number; detail?: string }>
```

### Gedrag

- Component houdt eigen `open` state bij via `useState(false)`.
- De bestaande balk-markup blijft intact.
- Rechts van de `score/max` tekst komt een pijltje (`▾` dicht, `▴` open); cursor wordt `pointer`.
- Bij klik toggled `open`; bij `open === true` verschijnt een lijst met criteria onder de balk.
- Klikken stopt propagatie zodat de kaart niet ook open/dicht klapt.

### Criteria-rij layout

Per rij: `label` (links, vaste breedte) — mini progress bar — `score/max` — `detail` (indien aanwezig, grijs).

### Detail-string rendering

Helper `humanDetail(s: string): string` vervangt underscores door spaties. LCP-waarde wordt doorgegeven als `"${lcpMs}ms"`.

## Data mapping per pijler

| Pijler | Criterium | Score veld | Max | Detail veld |
|--------|-----------|-----------|-----|-------------|
| Inhoud | Menu | `menuScore` | 15 | `menuDetail` |
| Inhoud | Adres | `adresScore` | 10 | — |
| Inhoud | Tijden | `tijdenScore` | 10 | — |
| Inhoud | Foto's | `fotoScore` | 5 | — |
| Inhoud | Verhaal | `verhaalScore` | 5 | — |
| Conversie | Reservering | `reserveringScore` | 12 | `reserveringDetail` |
| Conversie | Telefoon | `telefoonScore` | 8 | — |
| Conversie | E-mail | `emailScore` | 5 | — |
| UX | Mobiel | `mobileScore` | 10 | `mobileDetail` |
| UX | Snelheid | `speedScore` | 7 | `"${lcpMs}ms"` |
| UX | Dead links | `deadLinkScore` | 3 | — |
| Techniek | HTTPS | `httpsScore` | 5 | — |
| Techniek | Meta description | `metaDescScore` | 3 | — |
| Techniek | Structured data | `structuredScore` | 2 | — |

## Wat niet verandert

- De pijler-balken zelf (kleur, breedte, score/max label).
- De kaart-header met ScoreRings.
- Backend, scoremodel, API routes.
- De bestaande kleine detail-regel onderaan (`Menu: · Reservering: · LCP:`) — wordt verwijderd omdat die informatie nu in de accordion zit.
