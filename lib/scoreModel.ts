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
