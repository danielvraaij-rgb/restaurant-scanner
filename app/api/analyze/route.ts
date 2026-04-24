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

  // ── 1. HTML ophalen (homepage + veelgebruikte subpagina's) ────────────────
  const SUB_PATHS = [
    '/contact', '/over-ons', '/over-ons/', '/about', '/about-us',
    '/menu', '/menukaart', '/kaart', '/eten-drinken',
    '/reserveren', '/reservering', '/boeken', '/table',
    '/openingstijden', '/tijden', '/info', '/informatie',
  ];

  async function fetchPage(pageUrl: string): Promise<string> {
    try {
      const res = await fetch(pageUrl, {
        headers: { "User-Agent": "RestaurantScanner/2.0 (website quality check)" },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return "";
      return await res.text();
    } catch {
      return "";
    }
  }

  const base = url.replace(/\/$/, "");
  const subUrls = SUB_PATHS.map(p => base + p);

  let html = "";
  try {
    const [homepageHtml, ...subHtmls] = await Promise.all([
      fetchPage(url),
      ...subUrls.map(fetchPage),
    ]);
    html = [homepageHtml, ...subHtmls].filter(Boolean).join("\n");
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

      // Structured data (Lighthouse audit, niet grep)
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
    deadLinkScore: 3,
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
