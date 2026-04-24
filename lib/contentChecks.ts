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
const PHONE_RESERVE_REGEX = /(reserveer|boek|reservatie)[\s\S]{0,50}(bel|telefoon|0[1-9]\d{8})/i;

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
