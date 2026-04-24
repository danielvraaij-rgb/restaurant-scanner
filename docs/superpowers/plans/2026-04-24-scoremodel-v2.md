# Score Model v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vervang het v1 70-punten model (70% technisch) door een bezoeker-gericht 100-punten model met 4 pijlers (inhoud 45pt, conversie 25pt, UX 20pt, tech 10pt).

**Architecture:** HTML-scraping via `fetch()` + cheerio voor inhoudschecks (pijler 1+2); Google PageSpeed API voor Lighthouse-audits (pijler 3+4). Scoring logica zit in losse modules (`lib/scoreModel.ts`, `lib/contentChecks.ts`). De API route `app/api/analyze/route.ts` orkestreert alles en vervangt `app/api/pagespeed/route.ts`.

**Tech Stack:** Next.js 16 App Router, TypeScript, cheerio (HTML parsing), Google PageSpeed API v5

> **Belangrijk voor AGENTS.md:** Lees `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` voordat je de API route schrijft.

---

## Bestandsoverzicht

| Bestand | Actie | Verantwoordelijkheid |
|---|---|---|
| `lib/scoreModel.ts` | Aanmaken | Types (Checks, ScoreResult, Analysis) + calcRestaurantScore() + calcProspectScore() |
| `lib/contentChecks.ts` | Aanmaken | Alle cheerio HTML-parsing functies (menu, adres, tijden, fotos, verhaal, reservering, telefoon, email) |
| `app/api/analyze/route.ts` | Aanmaken | GET handler: fetch HTML → contentChecks → PageSpeed → score → response |
| `app/page.tsx` | Aanpassen | Types updaten, scoring functies verwijderen, UI naar pijler-weergave, handmatig paneel → alleen notes |
| `app/api/pagespeed/route.ts` | Verwijderen | Vervangen door analyze route |

---

## Task 1: Installeer cheerio

**Files:**
- Modify: `package.json`

- [ ] **Stap 1: Installeer cheerio**

```bash
npm install cheerio
```

Verwachte output: `added N packages` zonder errors.

- [ ] **Stap 2: Verifieer TypeScript types beschikbaar**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Verwacht: geen nieuwe errors (cheerio shipt eigen types).

- [ ] **Stap 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install cheerio for HTML parsing"
```

---

## Task 2: Maak `lib/scoreModel.ts` aan

**Files:**
- Create: `lib/scoreModel.ts`

- [ ] **Stap 1: Maak het bestand aan met types en scoring functies**

Maak `lib/scoreModel.ts` aan met de volgende inhoud:

```typescript
// ─── Types ───────────────────────────────────────────────────────────────────

export interface Checks {
  menuScore: number;       // 0-15
  menuDetail: string;      // 'prijzen_aanwezig' | 'geen_prijzen' | 'pdf_only' | 'niet_gevonden'
  adresScore: number;      // 0-10
  tijdenScore: number;     // 0-10
  fotoScore: number;       // 0-5
  verhaalScore: number;    // 0-5
  reserveringScore: number; // 0-12
  reserveringDetail: string; // 'systeem' | 'telefoon' | 'email' | 'niet_gevonden'
  telefoonScore: number;   // 0-8
  emailScore: number;      // 0-5
  mobileScore: number;     // 0-10
  mobileDetail: string;    // bijv. '3/3' | '2/3 tap_targets_fail'
  speedScore: number;      // 0-7
  lcpMs: number;
  deadLinkScore: number;   // altijd 3 in v2 (fetch-only)
  httpsScore: number;      // 0-5
  metaDescScore: number;   // 0-3
  structuredScore: number; // 0-2
}

export interface ScoreResult {
  totaal: number;
  pijlers: {
    inhoud: number;    // max 45
    conversie: number; // max 25
    ux: number;        // max 20
    tech: number;      // max 10
  };
  checks: Checks;
}

export interface Analysis {
  noWebsite: boolean;
  scoredAt: string;
  scoreModelVersion: '2.0';
  totaalScore: number;
  prospectScore: number;
  pijlers: {
    inhoud: number;
    conversie: number;
    ux: number;
    tech: number;
  };
  checks: Checks;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export function calcRestaurantScore(checks: Checks): ScoreResult {
  const inhoud = Math.min(45,
    checks.menuScore + checks.adresScore + checks.tijdenScore +
    checks.fotoScore + checks.verhaalScore
  );
  const conversie = Math.min(25,
    checks.reserveringScore + checks.telefoonScore + checks.emailScore
  );
  const ux = Math.min(20,
    checks.mobileScore + checks.speedScore + checks.deadLinkScore
  );
  const tech = Math.min(10,
    checks.httpsScore + checks.metaDescScore + checks.structuredScore
  );

  return {
    totaal: inhoud + conversie + ux + tech,
    pijlers: { inhoud, conversie, ux, tech },
    checks,
  };
}

export function calcProspectScore(scoreResult: ScoreResult, noWebsite: boolean): number {
  if (noWebsite) return 100;
  const verbeterpotentie = 100 - scoreResult.totaal;
  const contentKwaliteit = scoreResult.pijlers.inhoud / 45;
  return Math.min(100, Math.round(verbeterpotentie * 0.6 + contentKwaliteit * 100 * 0.4));
}
```

- [ ] **Stap 2: Verifieer TypeScript**

```bash
npx tsc --noEmit
```

Verwacht: geen errors.

- [ ] **Stap 3: Commit**

```bash
git add lib/scoreModel.ts
git commit -m "feat: add score model v2 types and scoring functions"
```

---

## Task 3: Maak `lib/contentChecks.ts` aan

**Files:**
- Create: `lib/contentChecks.ts`

- [ ] **Stap 1: Maak het bestand aan**

Maak `lib/contentChecks.ts` aan:

```typescript
import * as cheerio from "cheerio";
import type { Checks } from "./scoreModel";

// ─── Menu detectie (0-15 punten) ─────────────────────────────────────────────

const PRICE_REGEX = /[€$£]\s?\d+[.,]\d{0,2}|\d+[.,]\d{2}\s?[€$£]|\d+,-/g;
const MENU_KEYWORDS = [
  'menu', 'gerechten', 'kaart', 'starters', 'hoofdgerecht', 'voorgerecht',
  'dessert', 'lunch', 'diner', 'pasta', 'pizza', 'entrée', 'plat', 'carte',
];

function checkMenu($: cheerio.CheerioAPI, text: string): { score: number; detail: string } {
  const prices = text.match(PRICE_REGEX) || [];
  const hasPrices = prices.length >= 3;
  const hasMenuSection = MENU_KEYWORDS.some(kw => text.includes(kw));

  if (hasPrices && hasMenuSection) return { score: 15, detail: 'prijzen_aanwezig' };

  if (hasMenuSection) {
    const menuLinks = $('a').filter((_, el) => {
      const href = $(el).attr('href') || '';
      const linkText = $(el).text().toLowerCase();
      return linkText.includes('menu') || href.includes('menu') || href.includes('kaart');
    });
    return { score: menuLinks.length > 0 ? 10 : 7, detail: 'geen_prijzen' };
  }

  const pdfLinks = $('a[href$=".pdf"], a[href*="menu"][href$=".pdf"]');
  const menuImages = $('img[alt*="menu"], img[src*="menu"]');
  if (pdfLinks.length > 0 || menuImages.length > 0) return { score: 5, detail: 'pdf_only' };

  return { score: 0, detail: 'niet_gevonden' };
}

// ─── Adres detectie (0-10 punten) ────────────────────────────────────────────

const STREET_REGEX = /[A-Z][a-z]+(?:straat|weg|laan|plein|dijk|kade|gracht|steeg|pad|dreef)\s+\d+[a-zA-Z]*/;
const POSTCODE_REGEX = /\b[1-9]\d{3}\s?[A-Z]{2}\b/;

function checkAdres($: cheerio.CheerioAPI, text: string): number {
  const hasMapsLink = $('a[href*="maps.google"], a[href*="goo.gl/maps"], a[href*="maps.app.goo"]').length > 0;
  const hasMapsEmbed = $('iframe[src*="maps.google"], iframe[src*="google.com/maps"]').length > 0;
  const hasStreet = STREET_REGEX.test(text);
  const hasPostcode = POSTCODE_REGEX.test(text);

  if ((hasStreet || hasPostcode) && (hasMapsLink || hasMapsEmbed)) return 10;
  if (hasStreet && hasPostcode) return 6;
  if (hasStreet || hasPostcode) return 3;
  return 0;
}

// ─── Openingstijden detectie (0-10 punten) ───────────────────────────────────

const TIME_REGEX = /\b(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/g;
const DAYS_REGEX = /\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi;

function checkTijden($: cheerio.CheerioAPI, text: string): number {
  const timeMatches = text.match(TIME_REGEX) || [];
  const dayMatches = text.match(DAYS_REGEX) || [];
  const hasSchemaHours = $('[itemprop="openingHours"], [itemprop="openingHoursSpecification"]').length > 0;

  if (dayMatches.length >= 3 && timeMatches.length >= 3) return 10;
  if (hasSchemaHours) return 10;
  if (dayMatches.length > 0 && timeMatches.length > 0) return 6;
  if (timeMatches.length > 0) return 3;
  return 0;
}

// ─── Foto's detectie (0-5 punten) ────────────────────────────────────────────

const FOOD_ALTS = ['gerecht', 'eten', 'food', 'dish', 'meal', 'pasta', 'vlees', 'vis'];

function checkFotos($: cheerio.CheerioAPI): number {
  const images = $('img').filter((_, el) => {
    const src = $(el).attr('src') || '';
    const alt = ($(el).attr('alt') || '').toLowerCase();
    return !src.includes('logo') && !src.includes('icon') && !src.includes('flag') && !alt.includes('logo');
  });

  const hasFoodAlt = images.filter((_, el) => {
    const alt = ($(el).attr('alt') || '').toLowerCase();
    return FOOD_ALTS.some(w => alt.includes(w));
  }).length > 0;

  const count = images.length;
  if (count >= 5 && hasFoodAlt) return 5;
  if (count >= 5) return 3;
  if (count >= 2) return 2;
  return 0;
}

// ─── Verhaal / Over ons detectie (0-5 punten) ────────────────────────────────

const STORY_KEYWORDS = [
  'over ons', 'ons verhaal', 'over het restaurant', 'onze keuken', 'onze chef',
  'wie zijn wij', 'our story', 'about us', 'notre histoire',
];

function checkVerhaal(text: string): number {
  return STORY_KEYWORDS.some(kw => text.includes(kw)) ? 5 : 0;
}

// ─── Reservering detectie (0-12 punten) ──────────────────────────────────────

const RESERVATION_SYSTEMS = [
  'opentable.com', 'thefork.com', 'iens.nl', 'resy.com',
  'bookatable.com', 'zenchef.com', 'dimmi.com', 'quandoo.nl',
];
const PHONE_RESERVE_REGEX = /(reserveer|boek|reservatie).{0,50}(bel|telefoon|0[1-9]\d{8})/is;

function checkReservering($: cheerio.CheerioAPI, text: string): { score: number; detail: string } {
  const hasThirdParty = RESERVATION_SYSTEMS.some(system =>
    $(`a[href*="${system}"], iframe[src*="${system}"]`).length > 0
  );

  const hasOwnForm = $('form').filter((_, el) => {
    const formText = $(el).text().toLowerCase();
    return formText.includes('reserveer') || formText.includes('boek') ||
      formText.includes('tafel') || formText.includes('personen');
  }).length > 0;

  const hasTelReservation = PHONE_RESERVE_REGEX.test(text);
  const hasEmailReservation = /mailto:.*(reserv|boek)/i.test(
    $('a[href^="mailto"]').attr('href') || ''
  );

  if (hasThirdParty || hasOwnForm) return { score: 12, detail: 'systeem' };
  if (hasTelReservation) return { score: 8, detail: 'telefoon' };
  if (hasEmailReservation) return { score: 4, detail: 'email' };
  return { score: 0, detail: 'niet_gevonden' };
}

// ─── Telefoon detectie (0-8 punten) ──────────────────────────────────────────

const PHONE_REGEX = /(\+31|0031|0)[1-9]([-\s]?\d){7,8}\b/g;

function checkTelefoon($: cheerio.CheerioAPI, text: string): number {
  const hasTelLink = $('a[href^="tel:"]').length > 0;
  const textPhones = text.match(PHONE_REGEX) || [];
  const isProminent = $('header a[href^="tel:"], nav a[href^="tel:"]').length > 0;

  if (hasTelLink && isProminent) return 8;
  if (hasTelLink || textPhones.length > 0) return 5;
  return 0;
}

// ─── Email / contactformulier detectie (0-5 punten) ──────────────────────────

function checkEmail($: cheerio.CheerioAPI): number {
  const hasMailto = $('a[href^="mailto"]').length > 0;
  const hasContactForm = $('form').filter((_, el) => {
    const formText = $(el).text().toLowerCase();
    return formText.includes('contact') || formText.includes('mail') || formText.includes('bericht');
  }).length > 0;
  return (hasMailto || hasContactForm) ? 5 : 0;
}

// ─── Hoofdfunctie ─────────────────────────────────────────────────────────────

export function runContentChecks(html: string): Omit<Checks,
  'mobileScore' | 'mobileDetail' | 'speedScore' | 'lcpMs' | 'deadLinkScore' |
  'httpsScore' | 'metaDescScore' | 'structuredScore'
> {
  const $ = cheerio.load(html);

  // Strip nav, script, style voor schonere tekst
  $('script, style, nav, footer').remove();
  const text = $('body').text().toLowerCase().replace(/\s+/g, ' ').trim();

  const menu = checkMenu($, text);
  const adresScore = checkAdres($, text);
  const tijdenScore = checkTijden($, text);
  const fotoScore = checkFotos($);
  const verhaalScore = checkVerhaal(text);
  const reservering = checkReservering($, text);
  const telefoonScore = checkTelefoon($, text);
  const emailScore = checkEmail($);

  return {
    menuScore: menu.score,
    menuDetail: menu.detail,
    adresScore,
    tijdenScore,
    fotoScore,
    verhaalScore,
    reserveringScore: reservering.score,
    reserveringDetail: reservering.detail,
    telefoonScore,
    emailScore,
  };
}
```

- [ ] **Stap 2: Verifieer TypeScript**

```bash
npx tsc --noEmit
```

Verwacht: geen errors.

- [ ] **Stap 3: Commit**

```bash
git add lib/contentChecks.ts
git commit -m "feat: add content checks module for score model v2"
```

---

## Task 4: Maak `app/api/analyze/route.ts` aan

**Files:**
- Create: `app/api/analyze/route.ts`

Lees eerst `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` voor de exacte Next.js 16 route handler conventions.

- [ ] **Stap 1: Maak de route aan**

Maak `app/api/analyze/route.ts` aan:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { runContentChecks } from "@/lib/contentChecks";
import { calcRestaurantScore, calcProspectScore } from "@/lib/scoreModel";
import type { Checks, Analysis } from "@/lib/scoreModel";

const API_KEY = process.env.GOOGLE_API_KEY!;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  // ── 1. HTML ophalen ────────────────────────────────────────────────────────
  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RestaurantScanner/2.0 (website quality check)" },
      signal: AbortSignal.timeout(8000),
    });
    html = await res.text();
  } catch {
    // Site niet bereikbaar — geef lege content checks
  }

  // ── 2. Inhoudschecks (pijler 1 + 2) ───────────────────────────────────────
  const contentChecks = html ? runContentChecks(html) : {
    menuScore: 0, menuDetail: 'niet_bereikbaar',
    adresScore: 0, tijdenScore: 0, fotoScore: 0, verhaalScore: 0,
    reserveringScore: 0, reserveringDetail: 'niet_bereikbaar',
    telefoonScore: 0, emailScore: 0,
  };

  // ── 3. Technische checks ───────────────────────────────────────────────────
  const httpsScore = url.startsWith("https") ? 5 : 0;

  // ── 4. PageSpeed API (pijler 3 + 4) ───────────────────────────────────────
  let mobileScore = 0;
  let mobileDetail = "niet_beschikbaar";
  let speedScore = 0;
  let lcpMs = 0;
  let metaDescScore = 0;
  let structuredScore = 0;

  try {
    const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=PERFORMANCE&strategy=MOBILE&key=${API_KEY}`;
    const psRes = await fetch(psUrl);
    const psData = await psRes.json();

    if (psData.lighthouseResult) {
      const audits = psData.lighthouseResult.audits;

      // Mobile: 3 audits
      const contentWidth = audits['content-width']?.score === 1;
      const tapTargets = audits['tap-targets']?.score === 1;
      const fontSize = audits['font-size']?.score === 1;
      const mobilePass = [contentWidth, tapTargets, fontSize].filter(Boolean).length;
      mobileScore = mobilePass === 3 ? 10 : mobilePass === 2 ? 6 : 0;
      const failedAudits = [
        !contentWidth && 'content_width',
        !tapTargets && 'tap_targets',
        !fontSize && 'font_size',
      ].filter(Boolean).join('_');
      mobileDetail = `${mobilePass}/3${failedAudits ? `_fail_${failedAudits}` : ''}`;

      // LCP
      const lcpAudit = audits['largest-contentful-paint'];
      lcpMs = Math.round(lcpAudit?.numericValue ?? 99999);
      if (lcpMs < 1500) speedScore = 7;
      else if (lcpMs < 2500) speedScore = 5;
      else if (lcpMs < 4000) speedScore = 2;
      else speedScore = 0;

      // Meta description
      metaDescScore = audits['meta-description']?.score === 1 ? 3 : 0;

      // Structured data (Lighthouse structured-data audit, niet grep)
      const sdAudit = audits['structured-data'];
      structuredScore = sdAudit?.score === 1 ? 2 : 0;
    }
  } catch {
    // PageSpeed niet beschikbaar — pijler 3+4 blijft 0
  }

  // ── 5. Score berekenen ─────────────────────────────────────────────────────
  const checks: Checks = {
    ...contentChecks,
    mobileScore,
    mobileDetail,
    speedScore,
    lcpMs,
    deadLinkScore: 3, // altijd 3 in fetch-only v2
    httpsScore,
    metaDescScore,
    structuredScore,
  };

  const scoreResult = calcRestaurantScore(checks);
  const prospectScore = calcProspectScore(scoreResult, false);

  const analysis: Analysis = {
    noWebsite: false,
    scoredAt: new Date().toISOString(),
    scoreModelVersion: '2.0',
    totaalScore: scoreResult.totaal,
    prospectScore,
    pijlers: scoreResult.pijlers,
    checks: scoreResult.checks,
  };

  return NextResponse.json(analysis);
}
```

- [ ] **Stap 2: Verifieer TypeScript**

```bash
npx tsc --noEmit
```

Verwacht: geen errors.

- [ ] **Stap 3: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "feat: add /api/analyze route for score model v2"
```

---

## Task 5: Verwijder pagespeed route

**Files:**
- Delete: `app/api/pagespeed/route.ts`

- [ ] **Stap 1: Verwijder het bestand**

```bash
git rm app/api/pagespeed/route.ts
```

- [ ] **Stap 2: Commit**

```bash
git commit -m "chore: remove pagespeed route (replaced by analyze route)"
```

---

## Task 6: Update `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

Dit is de grootste stap. Vervang de volledige inhoud van `app/page.tsx` met de versie hieronder.

Wijzigingen t.o.v. v1:
- `Analysis` interface → v2 structuur (pijlers, checks, prospectScore, etc.)
- `ManualScore` interface → alleen `{ notes: string }`
- `calcAutoScore`, `calcManualScore`, `calcProspect` → verwijderd
- `prospectLabel` → ongewijzigd, gebruikt nog steeds 0-100 score
- `Card` component → `inhoudPct` + `conversiePct` i.p.v. auto/man
- Score rings: AUTO → INHOUD, HAND → CONV
- Detail paneel links → pijler breakdown tabel
- Detail paneel rechts → alleen notes + links
- `analyzeWebsite` → roept `/api/analyze` aan i.p.v. `/api/pagespeed`
- No-website case → bouwt `Analysis` object client-side met `prospectScore: 100`

- [ ] **Stap 1: Vervang app/page.tsx**

```tsx
"use client";

import { useState } from "react";
import type { Analysis } from "@/lib/scoreModel";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ManualScore {
  notes: string;
}

interface Restaurant {
  place_id: string;
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
  website: string | null;
  googleMapsUrl: string | null;
  phone: string | null;
  analysis: Analysis | null;
  manual: ManualScore | null;
}

// ─── Prospect label ──────────────────────────────────────────────────────────

function prospectLabel(s: number | null) {
  if (s === null) return { text: "Niet beoordeeld", color: "#6b7280", bg: "#6b728015" };
  if (s >= 70) return { text: "Hot prospect", color: "#ef4444", bg: "#ef444420" };
  if (s >= 50) return { text: "Interessant", color: "#f59e0b", bg: "#f59e0b20" };
  if (s >= 30) return { text: "Mogelijk", color: "#3b82f6", bg: "#3b82f620" };
  return { text: "Lage prioriteit", color: "#6b7280", bg: "#6b728015" };
}

// ─── Small Components ───────────────────────────────────────────────────────

function ScoreRing({ score, size = 40 }: { score: number | null; size?: number }) {
  const color = score === null ? "#374151" : score >= 80 ? "#059669" : score >= 60 ? "#f59e0b" : score >= 40 ? "#ef4444" : "#dc2626";
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const offset = score != null ? c * (1 - score / 100) : c;
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1f2937" strokeWidth="3"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} className="transition-all duration-500"/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill={score != null ? color : "#6b7280"} fontSize={size * 0.3} fontWeight="700"
        className="font-mono">{score != null ? score : "—"}</text>
    </svg>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24"
          style={{ opacity: rating >= i ? 1 : rating >= i-0.5 ? 0.5 : 0.2 }}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill="#fbbf24"/>
        </svg>
      ))}
    </div>
  );
}

// ─── Pijler bar ─────────────────────────────────────────────────────────────

function PijlerBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = Math.round((score / max) * 100);
  const color = pct >= 70 ? "#059669" : pct >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-[#1f2937] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}/>
      </div>
      <span className="text-xs font-mono text-gray-400 w-10 text-right">{score}/{max}</span>
    </div>
  );
}

// ─── Restaurant Card ────────────────────────────────────────────────────────

function Card({ restaurant, onAnalyze, onManual, busy }: {
  restaurant: Restaurant;
  onAnalyze: (id: string) => void;
  onManual: (id: string, m: ManualScore) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(restaurant.manual?.notes ?? "");

  const a = restaurant.analysis;
  const inhoudPct = a ? Math.round((a.pijlers.inhoud / 45) * 100) : null;
  const conversiePct = a ? Math.round((a.pijlers.conversie / 25) * 100) : null;
  const prospect = a?.prospectScore ?? null;
  const pl = prospectLabel(prospect);

  const saveNotes = (value: string) => {
    setNotes(value);
    onManual(restaurant.place_id, { notes: value });
  };

  return (
    <div className="bg-[#111318] rounded-xl border border-[#1e2028] overflow-hidden hover:border-[#2a2d38] transition-colors">
      <div onClick={() => setOpen(!open)}
        className="px-5 py-4 cursor-pointer grid items-center gap-4"
        style={{ gridTemplateColumns: "1fr auto auto auto auto" }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h3 className="text-[15px] font-semibold text-gray-200 truncate">{restaurant.name}</h3>
            <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide font-mono"
              style={{ background: pl.bg, color: pl.color }}>{pl.text}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">{restaurant.address}</p>
          {restaurant.website && (
            <p className="text-[11px] text-gray-600 font-mono truncate mt-0.5">{restaurant.website}</p>
          )}
          {!restaurant.website && restaurant.analysis && (
            <p className="text-[11px] text-red-400/70 font-mono mt-0.5">Geen website</p>
          )}
        </div>

        <div className="text-center">
          <Stars rating={restaurant.rating || 0}/>
          <div className="text-[11px] text-gray-500 font-mono mt-0.5">
            {restaurant.rating} ({restaurant.reviewCount})
          </div>
        </div>

        <div className="text-center">
          <ScoreRing score={inhoudPct} size={36}/>
          <div className="text-[9px] text-gray-500 mt-0.5 font-mono">INHOUD</div>
        </div>
        <div className="text-center">
          <ScoreRing score={conversiePct} size={36}/>
          <div className="text-[9px] text-gray-500 mt-0.5 font-mono">CONV</div>
        </div>
        <div className="text-center">
          <ScoreRing score={prospect} size={48}/>
          <div className="text-[9px] text-gray-500 mt-0.5 font-mono">PROSPECT</div>
        </div>
      </div>

      {open && (
        <div className="border-t border-[#1e2028] p-5">
          <div className="grid grid-cols-2 gap-6">
            {/* Links: analyse resultaten */}
            <div>
              <h4 className="text-xs text-gray-500 uppercase tracking-widest font-mono mb-3">Analyse</h4>
              {!a ? (
                <button onClick={(e) => { e.stopPropagation(); onAnalyze(restaurant.place_id); }}
                  disabled={busy}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${busy ? "bg-gray-800 text-gray-500 cursor-wait" : "bg-blue-600 text-white hover:bg-blue-500 cursor-pointer"}`}>
                  {busy ? "Bezig..." : "Analyseer website"}
                </button>
              ) : a.noWebsite ? (
                <div className="px-4 py-3 bg-red-900/20 rounded-lg text-red-300 text-sm">
                  Geen website — beste prospect!
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <PijlerBar label="Inhoud" score={a.pijlers.inhoud} max={45}/>
                  <PijlerBar label="Conversie" score={a.pijlers.conversie} max={25}/>
                  <PijlerBar label="UX" score={a.pijlers.ux} max={20}/>
                  <PijlerBar label="Techniek" score={a.pijlers.tech} max={10}/>
                  <div className="mt-2 pt-2 border-t border-[#1e2028] flex justify-between text-xs font-mono">
                    <span className="text-gray-500">Totaal</span>
                    <span className="text-gray-300">{a.totaalScore}/100</span>
                  </div>
                  <div className="text-[10px] text-gray-600 font-mono mt-1">
                    Menu: {a.checks.menuDetail} · Reservering: {a.checks.reserveringDetail} · LCP: {a.checks.lcpMs}ms
                  </div>
                </div>
              )}
            </div>

            {/* Rechts: notities + links */}
            <div>
              <h4 className="text-xs text-gray-500 uppercase tracking-widest font-mono mb-3">Notities</h4>
              <div className="flex flex-col gap-2.5">
                <textarea value={notes} onChange={e => saveNotes(e.target.value)}
                  onClick={e => e.stopPropagation()} placeholder="Observaties, contactinfo..."
                  className="w-full p-2 bg-[#1a1d24] border border-gray-700 rounded text-xs text-gray-200 resize-y min-h-[80px] outline-none focus:border-gray-500 transition-colors"/>
                <div className="flex gap-2 mt-1">
                  {restaurant.website && (
                    <a href={restaurant.website} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-mono">
                      → Website openen
                    </a>
                  )}
                  {restaurant.googleMapsUrl && (
                    <a href={restaurant.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-mono">
                      → Google Maps
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Home() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [analyzeAllRunning, setAnalyzeAllRunning] = useState(false);
  const [searchArea, setSearchArea] = useState("Nijmegen");
  const [minRating, setMinRating] = useState(4.0);
  const [sortBy, setSortBy] = useState("prospect");
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const fetchRestaurants = async () => {
    setLoading(true);
    setError(null);
    setProgress("Locatie opzoeken...");

    try {
      const geoRes = await fetch(`/api/places/geocode?address=${encodeURIComponent(searchArea)}`);
      const geoData = await geoRes.json();
      if (!geoData.results?.length) throw new Error("Locatie niet gevonden");

      const { lat, lng } = geoData.results[0].geometry.location;
      let allPlaces: any[] = [];
      let nextPageToken: string | null = null;

      for (let page = 0; page < 3; page++) {
        setProgress(`Pagina ${page + 1} ophalen...`);
        const queryStr: string = nextPageToken
          ? `pagetoken=${nextPageToken}`
          : `lat=${lat}&lng=${lng}&radius=5000`;
        const res = await fetch(`/api/places/search?${queryStr}`);
        const data = await res.json();
        if (data.results) allPlaces = [...allPlaces, ...data.results];
        if (data.next_page_token) {
          nextPageToken = data.next_page_token;
          await new Promise(r => setTimeout(r, 2000));
        } else break;
      }

      const filtered = allPlaces.filter((p: any) => p.rating && p.rating >= minRating);
      setProgress(`Details ophalen voor ${filtered.length} restaurants...`);

      const detailed: Restaurant[] = await Promise.all(
        filtered.map(async (place: any) => {
          try {
            const dRes = await fetch(`/api/places/details?place_id=${place.place_id}`);
            const dData = await dRes.json();
            return {
              place_id: place.place_id,
              name: place.name,
              address: place.vicinity || place.formatted_address || "",
              rating: place.rating,
              reviewCount: place.user_ratings_total || 0,
              website: dData.result?.website || null,
              googleMapsUrl: dData.result?.url || null,
              phone: dData.result?.formatted_phone_number || null,
              analysis: null,
              manual: null,
            };
          } catch {
            return {
              place_id: place.place_id,
              name: place.name,
              address: place.vicinity || "",
              rating: place.rating,
              reviewCount: place.user_ratings_total || 0,
              website: null, googleMapsUrl: null, phone: null, analysis: null, manual: null,
            };
          }
        })
      );

      setRestaurants(detailed);
      setFetched(true);
      setProgress("");
    } catch (err: any) {
      setError(err.message || "Er ging iets mis");
    } finally {
      setLoading(false);
    }
  };

  const analyzeWebsite = async (placeId: string) => {
    const r = restaurants.find(x => x.place_id === placeId);
    if (!r) return;
    setAnalyzing(placeId);

    try {
      if (!r.website) {
        const noWebsiteAnalysis: Analysis = {
          noWebsite: true,
          scoredAt: new Date().toISOString(),
          scoreModelVersion: '2.0',
          totaalScore: 0,
          prospectScore: 100,
          pijlers: { inhoud: 0, conversie: 0, ux: 0, tech: 0 },
          checks: {
            menuScore: 0, menuDetail: 'geen_website',
            adresScore: 0, tijdenScore: 0, fotoScore: 0, verhaalScore: 0,
            reserveringScore: 0, reserveringDetail: 'geen_website',
            telefoonScore: 0, emailScore: 0,
            mobileScore: 0, mobileDetail: 'geen_website',
            speedScore: 0, lcpMs: 0, deadLinkScore: 0,
            httpsScore: 0, metaDescScore: 0, structuredScore: 0,
          },
        };
        setRestaurants(prev => prev.map(x =>
          x.place_id === placeId ? { ...x, analysis: noWebsiteAnalysis } : x
        ));
        return;
      }

      const res = await fetch(`/api/analyze?url=${encodeURIComponent(r.website)}`);
      const analysis: Analysis = await res.json();
      setRestaurants(prev => prev.map(x =>
        x.place_id === placeId ? { ...x, analysis } : x
      ));
    } finally {
      setAnalyzing(null);
    }
  };

  const analyzeAll = async () => {
    setAnalyzeAllRunning(true);
    const todo = restaurants.filter(r => !r.analysis);
    for (const r of todo) {
      await analyzeWebsite(r.place_id);
      await new Promise(res => setTimeout(res, 800));
    }
    setAnalyzeAllRunning(false);
  };

  const updateManual = (placeId: string, manual: ManualScore) => {
    setRestaurants(prev => prev.map(r => r.place_id === placeId ? { ...r, manual } : r));
  };

  const sorted = [...restaurants].sort((a, b) => {
    if (sortBy === "prospect") {
      const sa = a.analysis?.prospectScore ?? null;
      const sb = b.analysis?.prospectScore ?? null;
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa;
    }
    if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
    if (sortBy === "reviews") return (b.reviewCount || 0) - (a.reviewCount || 0);
    if (sortBy === "website") {
      const sa = a.analysis?.totaalScore ?? null;
      const sb = b.analysis?.totaalScore ?? null;
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sa - sb;
    }
    return 0;
  });

  const analyzed = restaurants.filter(r => r.analysis).length;
  const hot = restaurants.filter(r => (r.analysis?.prospectScore ?? 0) >= 70).length;
  const noSite = restaurants.filter(r => !r.website).length;

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-gray-200">
      {/* Header */}
      <div className="px-10 pt-8 pb-6 border-b border-[#1e2028]" style={{ background: "linear-gradient(180deg, #111318, #0a0b0e)" }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-blue-600" style={{ boxShadow: "0 0 12px #2563eb88" }}/>
          <h1 className="text-xl font-bold text-gray-100 tracking-tight">Restaurant Scanner</h1>
        </div>
        <p className="text-sm text-gray-500 font-mono">Vind restaurants met hoge reviews en slechte websites</p>
      </div>

      {/* Controls */}
      <div className="px-10 py-5 border-b border-[#1e2028] flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] text-gray-500 uppercase tracking-widest font-mono block mb-1">Regio</label>
          <input type="text" value={searchArea} onChange={e => setSearchArea(e.target.value)}
            className="px-3 py-2 bg-[#111318] border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-gray-500 w-48 transition-colors"/>
        </div>
        <div>
          <label className="text-[11px] text-gray-500 uppercase tracking-widest font-mono block mb-1">Min. rating</label>
          <select value={minRating} onChange={e => setMinRating(parseFloat(e.target.value))}
            className="px-3 py-2 bg-[#111318] border border-gray-700 rounded-lg text-sm text-gray-200 outline-none">
            <option value={3.5}>3.5+</option>
            <option value={4.0}>4.0+</option>
            <option value={4.2}>4.2+</option>
            <option value={4.5}>4.5+</option>
          </select>
        </div>
        <button onClick={fetchRestaurants} disabled={loading}
          className={`px-6 py-2 rounded-lg text-sm font-semibold h-[38px] transition-colors ${loading ? "bg-gray-800 text-gray-500 cursor-wait" : "bg-blue-600 text-white hover:bg-blue-500 cursor-pointer"}`}>
          {loading ? progress || "Laden..." : "🔍 Scan regio"}
        </button>

        {fetched && restaurants.length > 0 && (
          <>
            <button onClick={analyzeAll} disabled={analyzeAllRunning || analyzing != null}
              className={`px-6 py-2 rounded-lg text-sm font-semibold h-[38px] transition-colors ${analyzeAllRunning ? "bg-gray-800 text-gray-500 cursor-wait" : "bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer"}`}>
              {analyzeAllRunning ? `Analyseren... (${analyzed}/${restaurants.length})` : "⚡ Analyseer alles"}
            </button>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-[11px] text-gray-500 uppercase tracking-widest font-mono">Sorteer</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="px-2.5 py-1.5 bg-[#111318] border border-gray-700 rounded text-xs text-gray-200 outline-none">
                <option value="prospect">Prospect score</option>
                <option value="rating">Google rating</option>
                <option value="reviews">Aantal reviews</option>
                <option value="website">Website score (laag→hoog)</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* Stats */}
      {fetched && (
        <div className="px-10 py-3.5 border-b border-[#1e2028] flex gap-10">
          {[
            { label: "Gevonden", value: restaurants.length, hl: false },
            { label: "Geanalyseerd", value: `${analyzed}/${restaurants.length}`, hl: false },
            { label: "Hot prospects", value: hot, hl: true },
            { label: "Zonder website", value: noSite, hl: true },
          ].map(s => (
            <div key={s.label}>
              <div className={`text-lg font-bold font-mono ${s.hl ? "text-blue-500" : "text-gray-200"}`}>{String(s.value)}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-10 mt-5 px-4 py-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>
      )}

      {/* List */}
      <div className="px-10 py-5 flex flex-col gap-2">
        {!fetched && !loading && (
          <div className="text-center py-20 text-gray-600">
            <div className="text-5xl mb-4">🍽️</div>
            <p className="text-sm mb-1">Voer een regio in en klik op &quot;Scan regio&quot;</p>
            <p className="text-xs font-mono">Restaurants worden opgehaald via Google Places</p>
          </div>
        )}
        {sorted.map(r => (
          <Card key={r.place_id} restaurant={r} onAnalyze={analyzeWebsite}
            onManual={updateManual} busy={analyzing === r.place_id}/>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Stap 2: Verifieer TypeScript**

```bash
npx tsc --noEmit
```

Verwacht: geen errors.

- [ ] **Stap 3: Test de dev server**

```bash
npm run dev
```

Open de browser op `http://localhost:3000`. Verifieer dat de pagina laadt zonder runtime errors.

- [ ] **Stap 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: update UI to score model v2 (pijler rings, notes only)"
```

---

## Task 7: Eindverificatie

**Files:** geen wijzigingen

- [ ] **Stap 1: Clean build**

```bash
npm run build
```

Verwacht: `✓ Compiled successfully` zonder TypeScript errors.

- [ ] **Stap 2: Controleer dat pagespeed route weg is**

```bash
ls app/api/
```

Verwacht: mappen `analyze/`, `places/` — geen `pagespeed/`.

- [ ] **Stap 3: Commit (als nog niet gedaan)**

Als er uncommitted wijzigingen zijn:

```bash
git status
git add -A
git commit -m "feat: score model v2 complete"
```
