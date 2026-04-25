import * as cheerio from "cheerio";
import type { Checks } from "./scoreModel";

// ─── Menu detectie (0-15 punten) ─────────────────────────────────────────────

// Matcht: €12, €12,50, €12.50, 12,50€, 12,- maar ook standalone 12,50 / 12.50
// in een menucontext (wordt gecombineerd met hasMenuSection voor standalone prijzen)
const PRICE_REGEX = /[€$£]\s?\d+(?:[.,]\d{0,2})?|\d+(?:[.,]\d{2})\s?[€$£]|\d+,-/g;
const MENU_KEYWORDS = [
  'menu', 'gerechten', 'kaart', 'starters', 'hoofdgerecht', 'voorgerecht',
  'dessert', 'lunch', 'diner', 'pasta', 'pizza', 'entrée', 'plat', 'carte',
  'à la carte', 'dagmenu', 'weekmenu', 'spijskaart',
];

function hasPdfMenuLink($: cheerio.CheerioAPI): boolean {
  return $('a').filter((_, el) => {
    const href = ($(el).attr('href') || '').toLowerCase();
    const linkText = $(el).text().toLowerCase();
    const isPdf = href.endsWith('.pdf') || href.includes('.pdf?');
    const isMenuRelated =
      href.includes('menu') || href.includes('kaart') || href.includes('spijs') ||
      linkText.includes('menu') || linkText.includes('kaart') || linkText.includes('menukaart') ||
      linkText.includes('gerechten') || linkText.includes('eten') || linkText.includes('drinken');
    return isPdf && isMenuRelated;
  }).length > 0;
}

function checkMenu($: cheerio.CheerioAPI, text: string): { score: number; detail: string } {
  const prices = text.match(PRICE_REGEX) || [];
  const hasPrices = prices.length >= 3;
  const hasMenuSection = MENU_KEYWORDS.some(kw => text.includes(kw));
  const pdfMenu = hasPdfMenuLink($);
  const menuImages = $('img[alt*="menu" i], img[src*="menu" i]').length > 0;

  // Beste geval: tekst met menu én prijzen zichtbaar
  if (hasPrices && hasMenuSection) return { score: 15, detail: 'prijzen_aanwezig' };

  if (hasMenuSection) {
    // Menu gevonden, maar prijzen staan waarschijnlijk in een PDF
    if (pdfMenu) return { score: 12, detail: 'pdf_menu' };

    const menuLinks = $('a').filter((_, el) => {
      const href = $(el).attr('href') || '';
      const linkText = $(el).text().toLowerCase();
      return linkText.includes('menu') || href.includes('menu') || href.includes('kaart');
    });
    return { score: menuLinks.length > 0 ? 10 : 7, detail: 'geen_prijzen' };
  }

  // Geen menuwoorden gevonden, maar er is wel een PDF of menu-afbeelding
  if (pdfMenu) return { score: 8, detail: 'pdf_only' };
  if (menuImages) return { score: 5, detail: 'afbeelding_only' };

  return { score: 0, detail: 'niet_gevonden' };
}

// ─── Adres detectie (0-10 punten) ────────────────────────────────────────────

const STREET_REGEX = /[A-Z][a-z]+(?:straat|weg|laan|plein|dijk|kade|gracht|steeg|pad|dreef)\s+\d+[a-zA-Z]*/;
const POSTCODE_REGEX = /\b[1-9]\d{3}\s?[A-Z]{2}\b/;

function checkAdres($: cheerio.CheerioAPI, text: string): number {
  const hasMapsLink = $('a[href*="maps.google"], a[href*="goo.gl/maps"], a[href*="maps.app.goo"], a[href*="apple.com/maps"], a[href*="waze.com"]').length > 0;
  const hasMapsEmbed = $('iframe[src*="maps.google"], iframe[src*="google.com/maps"]').length > 0;
  const hasStreet = STREET_REGEX.test(text);
  const hasPostcode = POSTCODE_REGEX.test(text);

  // JSON-LD schema.org adresdata
  const hasSchemaAddress = (() => {
    let found = false;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '');
        const entries = Array.isArray(data) ? data : [data];
        for (const entry of entries) {
          if (entry?.address || entry?.['@type'] === 'PostalAddress') { found = true; break; }
        }
      } catch { /* invalid JSON */ }
    });
    return found;
  })();

  if ((hasStreet || hasPostcode || hasSchemaAddress) && (hasMapsLink || hasMapsEmbed)) return 10;
  if (hasSchemaAddress) return 10;
  if (hasStreet && hasPostcode) return 6;
  if (hasStreet || hasPostcode) return 3;
  return 0;
}

// ─── Openingstijden detectie (0-10 punten) ───────────────────────────────────

// Tijdformaten: "11:00 - 20:00", "11.00-20.00", maar ook "11-20 uur"
const TIME_REGEX = /(?:\b(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})|\b\d{1,2}\s*[-–]\s*\d{1,2}\s*uur)/g;
const DAYS_REGEX = /\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo|zon|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi;

function checkTijden($: cheerio.CheerioAPI, text: string): number {
  const timeMatches = text.match(TIME_REGEX) || [];
  const dayMatches = text.match(DAYS_REGEX) || [];
  const hasSchemaHours = $('[itemprop="openingHours"], [itemprop="openingHoursSpecification"]').length > 0;

  // JSON-LD openingsuren
  const hasJsonLdHours = (() => {
    let found = false;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '');
        const entries = Array.isArray(data) ? data : [data];
        for (const entry of entries) {
          if (entry?.openingHours || entry?.openingHoursSpecification) { found = true; break; }
        }
      } catch { /* invalid JSON */ }
    });
    return found;
  })();

  if (hasSchemaHours || hasJsonLdHours) return 10;
  if (dayMatches.length >= 3 && timeMatches.length >= 1) return 10;
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
  'resengo.com', 'formitable.com', 'guestonline.io', 'sevenrooms.com',
  'eat-app.com', 'carbonara.app', 'tablein.com', 'resmio.com',
];

// Reserveringswoorden die ergens op de pagina kunnen voorkomen
const RESERVE_WORDS_REGEX = /\b(reserveer|reservering|reservatie|boek een tafel|tafel reserv|book a table|réservation)\b/i;
// Telefoonnummer (NL)
const PHONE_REGEX_SINGLE = /(\+31|0031|0)[1-9]([-\s]?\d){7,8}\b/;

function checkReservering($: cheerio.CheerioAPI, text: string): { score: number; detail: string } {
  const hasThirdParty = RESERVATION_SYSTEMS.some(system =>
    $(`a[href*="${system}"], iframe[src*="${system}"], script[src*="${system}"]`).length > 0
  );

  const hasOwnForm = $('form').filter((_, el) => {
    const formText = $(el).text().toLowerCase();
    return formText.includes('reserveer') || formText.includes('boek') ||
      formText.includes('tafel') || formText.includes('personen');
  }).length > 0;

  // WhatsApp reserveringen (wa.me of api.whatsapp.com links)
  const hasWhatsApp = $('a[href*="wa.me"], a[href*="api.whatsapp.com"], a[href*="whatsapp.com/send"]').length > 0
    && RESERVE_WORDS_REGEX.test(text);

  // Telefoon + reserveringswoord ergens op de pagina (los van afstand)
  const hasPhone = $('a[href^="tel:"]').length > 0 || PHONE_REGEX_SINGLE.test(text);
  const hasReserveWord = RESERVE_WORDS_REGEX.test(text);
  const hasTelReservation = hasPhone && hasReserveWord;

  // Email: kijk naar mailto-href én naar omliggende tekst van mailto-links
  const hasEmailReservation = (() => {
    let found = false;
    $('a[href^="mailto"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const linkText = $(el).text().toLowerCase();
      // het mailadres zelf bevat "reserv/boek", of de linktekst, of de context in de parent
      const parentText = ($(el).parent().text() || '').toLowerCase();
      if (/reserv|boek/i.test(href) || /reserv|boek/.test(linkText) || /reserv|boek/.test(parentText)) {
        found = true;
      }
    });
    // Ook: reserveringswoord + een mailto-link op de pagina
    if (!found && hasReserveWord && $('a[href^="mailto"]').length > 0) found = true;
    return found;
  })();

  if (hasThirdParty || hasOwnForm) return { score: 12, detail: 'systeem' };
  if (hasWhatsApp) return { score: 10, detail: 'whatsapp' };
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
