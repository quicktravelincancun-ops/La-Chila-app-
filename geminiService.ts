// Client-side reservation parsing and autocomplete service for Quick Travel Cancún.
// Operates 100% on the client side using Google Gemini Client SDK (if key is available)
// combined with a deterministic client-side Regex parser fallback.
// Never calls relative backend endpoints and never throws raw JSON "Unexpected token" errors.
import { GoogleGenAI } from '@google/genai';
import { Reservation } from './types';
import { toMexicanDateFormat } from './utils';

const MONTHS_MAP: Record<string, string> = {
  enero: '01', ene: '01', january: '01', jan: '01',
  febrero: '02', feb: '02', february: '02',
  marzo: '03', mar: '03', march: '03',
  abril: '04', abr: '04', april: '04', apr: '04',
  mayo: '05', may: '05',
  junio: '06', jun: '06', june: '06',
  julio: '07', jul: '07', july: '07',
  agosto: '08', ago: '08', august: '08', aug: '08',
  septiembre: '09', sep: '09', setiembre: '09', sept: '09', september: '09',
  octubre: '10', oct: '10', october: '10',
  noviembre: '11', nov: '11', november: '11',
  diciembre: '12', dic: '12', december: '12', dec: '12'
};

const STOP_WORDS_SPANISH = new Set([
  'EL', 'LA', 'DE', 'EN', 'AL', 'UN', 'UNA', 'DEL', 'LOS', 'LAS', 'CON', 'POR', 'QUE', 'PARA', 'MAS', 'SIN', 'SUS', 'MIS', 'TUS', 'SON', 'VAN', 'DIA', 'MES', 'PAX', 'USD', 'MXN'
]);

const COMMON_AIRLINES: Record<string, string> = {
  'aeromexico': 'Aeroméxico',
  'aeroméxico': 'Aeroméxico',
  'volaris': 'Volaris',
  'vivaaerobus': 'VivaAerobus',
  'viva aerobus': 'VivaAerobus',
  'viva': 'VivaAerobus',
  'american airlines': 'American Airlines',
  'american': 'American Airlines',
  'united airlines': 'United Airlines',
  'united': 'United Airlines',
  'delta air lines': 'Delta Air Lines',
  'delta airlines': 'Delta Air Lines',
  'delta': 'Delta Air Lines',
  'jetblue': 'JetBlue',
  'southwest': 'Southwest',
  'spirit airlines': 'Spirit Airlines',
  'spirit': 'Spirit Airlines',
  'frontier': 'Frontier',
  'air canada': 'Air Canada',
  'westjet': 'WestJet',
  'copa airlines': 'Copa Airlines',
  'copa': 'Copa Airlines',
  'sunwing': 'Sunwing',
  'air transat': 'Air Transat',
  'british airways': 'British Airways',
  'avianca': 'Avianca',
  'latam': 'LATAM',
  'iberia': 'Iberia',
  'air france': 'Air France',
  'lufthansa': 'Lufthansa',
  'magnicharters': 'Magnicharters',
  'mexicana': 'Mexicana'
};

const IATA_AIRLINE_MAP: Record<string, string> = {
  'AM': 'Aeroméxico',
  'Y4': 'Volaris',
  'VB': 'VivaAerobus',
  'AA': 'American Airlines',
  'UA': 'United Airlines',
  'DL': 'Delta Air Lines',
  'B6': 'JetBlue',
  'WN': 'Southwest',
  'NK': 'Spirit Airlines',
  'F9': 'Frontier',
  'AC': 'Air Canada',
  'WS': 'WestJet',
  'CM': 'Copa Airlines',
  'WG': 'Sunwing',
  'TS': 'Air Transat',
  'BA': 'British Airways',
  'AV': 'Avianca',
  'LA': 'LATAM',
  'IB': 'Iberia',
  'AF': 'Air France',
  'LH': 'Lufthansa'
};

/**
 * Retrieves the client-side Gemini API key if available via process.env.NEXT_PUBLIC_GEMINI_API_KEY
 * or other standard client environment variables.
 */
function getClientApiKey(): string {
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.NEXT_PUBLIC_GEMINI_API_KEY) return process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
      if (process.env.API_KEY) return process.env.API_KEY;
    }
  } catch {
    // Ignore process access errors in strict browser environments
  }
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any)?.env) {
      const metaEnv = (import.meta as any).env;
      if (metaEnv.NEXT_PUBLIC_GEMINI_API_KEY) return metaEnv.NEXT_PUBLIC_GEMINI_API_KEY;
      if (metaEnv.VITE_GEMINI_API_KEY) return metaEnv.VITE_GEMINI_API_KEY;
      if (metaEnv.GEMINI_API_KEY) return metaEnv.GEMINI_API_KEY;
      if (metaEnv.API_KEY) return metaEnv.API_KEY;
    }
  } catch {
    // Ignore import.meta access errors
  }
  return '';
}

/**
 * Normalizes time strings into standard 24h format (HH:MM).
 * Examples: "2:30 pm" -> "14:30", "11:20 am" -> "11:20", "14:30 hrs" -> "14:30"
 */
function normalizeTime(raw: string): string {
  if (!raw) return '';
  const clean = raw.trim().toLowerCase().replace(/hrs\.?|hr\.?|horas?/g, '').trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})(?:\s*(a\.?m\.?|p\.?m\.?))?$/i);
  if (!match) return clean;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const meridian = match[3] ? match[3].replace(/\./g, '').toLowerCase() : undefined;

  if (meridian === 'pm' && hours < 12) hours += 12;
  if (meridian === 'am' && hours === 12) hours = 0;

  if (hours >= 0 && hours < 24) {
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  return clean;
}

/**
 * Extracts and normalizes dates from text into Mexican DD/MM/YYYY format.
 */
function parseDatesToMexicanFormat(text: string): Array<{ date: string; index: number; raw: string }> {
  const results: Array<{ date: string; index: number; raw: string }> = [];
  const currentYear = new Date().getFullYear().toString();

  // Pattern 1: DD de [Mes] (de YYYY) -> e.g. "15 de Octubre", "27 de Septiembre de 2026", "15 Oct 2026"
  const monthNamesPattern = Object.keys(MONTHS_MAP).join('|');
  const regexNamedDMY = new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+|of\\s+|[-/\\s]\\s*)(${monthNamesPattern})(?:\\s*(?:de\\s+|del?\\s+|,\\s*|[-/\\s]\\s*)(202\\d|\\d{2}))?\\b`, 'gi');
  let match;
  while ((match = regexNamedDMY.exec(text)) !== null) {
    const day = match[1].padStart(2, '0');
    const month = MONTHS_MAP[match[2].toLowerCase()];
    let year = match[3] || currentYear;
    if (year.length === 2) year = `20${year}`;
    if (month && parseInt(day, 10) >= 1 && parseInt(day, 10) <= 31) {
      results.push({
        date: `${day}/${month}/${year}`,
        index: match.index,
        raw: match[0]
      });
    }
  }

  // Pattern 2: [Month] DD, YYYY -> e.g. "October 15, 2026" or "Septiembre 27 2026"
  const regexNamedMDY = new RegExp(`\\b(${monthNamesPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(?:de\\s+|del?\\s+)?(202\\d|\\d{2}))?\\b`, 'gi');
  while ((match = regexNamedMDY.exec(text)) !== null) {
    const month = MONTHS_MAP[match[1].toLowerCase()];
    const day = match[2].padStart(2, '0');
    let year = match[3] || currentYear;
    if (year.length === 2) year = `20${year}`;
    if (month && parseInt(day, 10) >= 1 && parseInt(day, 10) <= 31) {
      // Avoid duplicates overlapping with Pattern 1
      const mIndex = match.index;
      if (!results.some(r => Math.abs(r.index - mIndex) < 5)) {
        results.push({
          date: `${day}/${month}/${year}`,
          index: mIndex,
          raw: match[0]
        });
      }
    }
  }

  // Pattern 3: Numeric DD/MM/YYYY or DD-MM-YYYY (with smart check if first part > 12 vs second part > 12)
  const regexNumeric = /\b(\d{1,2})[-/](\d{1,2})[-/](202\d|\d{2})\b/g;
  while ((match = regexNumeric.exec(text)) !== null) {
    let p1 = parseInt(match[1], 10);
    let p2 = parseInt(match[2], 10);
    let year = match[3];
    if (year.length === 2) year = `20${year}`;

    // In Mexico DD/MM/YYYY is standard, but if p2 > 12 and p1 <= 12 (e.g., 09/27/2026), swap to DD/MM/YYYY
    let day = p1;
    let month = p2;
    if (p2 > 12 && p1 <= 12) {
      day = p2;
      month = p1;
    }

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      results.push({
        date: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
        index: match.index,
        raw: match[0]
      });
    }
  }

  // Pattern 4: ISO YYYY-MM-DD or YYYY/MM/DD
  const regexIso = /\b(202\d)[-/](\d{1,2})[-/](\d{1,2})\b/g;
  while ((match = regexIso.exec(text)) !== null) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    if (parseInt(day, 10) >= 1 && parseInt(day, 10) <= 31 && parseInt(month, 10) >= 1 && parseInt(month, 10) <= 12) {
      results.push({
        date: `${day}/${month}/${year}`,
        index: match.index,
        raw: match[0]
      });
    }
  }

  return results.sort((a, b) => a.index - b.index);
}

/**
 * Pure client-side regular expression parser for reservation texts.
 * Extracts: Lead Passenger Name, Service Type, Flight Number, Airline,
 * Dates (DD/MM/YYYY), Origin/Destination Hotel, Passenger Count (PAX), and Price.
 */
export function extractReservationFieldsWithRegex(text: string): Partial<Reservation> {
  const result: Partial<Reservation> = {};
  if (!text || !text.trim()) return result;

  const lower = text.toLowerCase();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Service Type & Subtype
  const hasRedondo = /\b(redondo|round\s*trip|ida\s+y\s+vuelta|llegada\s+y\s+salida)\b/i.test(text);
  const hasLlegan = /\b(llegan|llegada|arribo|arrival|aterriza|vuelo\s+de\s+llegada)\b/i.test(text);
  const hasSalen = /\b(salen|salida|departure|regreso|pick\s*-?\s*up\s+hotel|vuelo\s+de\s+salida)\b/i.test(text);
  const isTour = !hasRedondo && /\b(tour|excursi[oó]n|chich[eé]n|cenote|catamar[aá]n|isla\s+mujeres|xcaret|xel-?h[aá]|xplor|tulum|cob[aá]|holbox|bacalar)\b/i.test(text);

  if (/\bcircuito\b/i.test(text)) {
    result.serviceType = 'Circuito';
  } else if (hasRedondo || (hasLlegan && hasSalen)) {
    result.serviceType = 'Llegada y Salida';
    result.transferSubtype = 'Traslado Redondo';
  } else if (isTour) {
    result.serviceType = 'Tour o Excursión';
    result.tourType = /\b(privado|private)\b/i.test(text) ? 'Tour Privado' : 'Tour Compartido';

    const tourMatch = text.match(/(?:tour|excursi[oó]n)[:\s*]+([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ\s-]+?)(?:,|\.|\n|para|pax|hotel|\$|$)/i);
    if (tourMatch && tourMatch[1]?.trim().length > 2) {
      result.tourName = tourMatch[1].trim();
    }
  } else if (hasLlegan) {
    result.serviceType = 'Solo Llegada';
    result.transferSubtype = 'Traslado Sencillo';
  } else if (hasSalen) {
    result.serviceType = 'Solo Salida';
    result.transferSubtype = 'Traslado Sencillo';
  } else if (/\b(traslado|transfer)\b/i.test(text)) {
    result.serviceType = 'Solo Traslado';
    result.transferSubtype = 'Traslado Sencillo';
  }

  // 2. Lead Passenger Name
  const explicitNameMatch = text.match(/(?:titular|pasajero(?:\s+principal)?|nombre(?:\s+del\s+titular|\s+del\s+pasajero|\s+del\s+cliente)?|cliente|lead\s+passenger|guest|pax\s+name|a\s+nombre\s+de|hu[eé]sped|familia|sr\.?|sra\.?)[:\s*]+([A-Za-zÁÉÍÓÚáéíóúñÑüÜ\s.'-]+?)(?:,|\.|\n|;|\||hotel|destino|van\s+al|vuelo|flight|pax|personas|adultos|\d|$)/i);
  if (explicitNameMatch && explicitNameMatch[1]?.trim().length > 2) {
    const raw = explicitNameMatch[1].trim();
    if (!/^(hotel|vuelo|llegada|salida|tour|servicio|traslado|aeropuerto|cancun|cancún)$/i.test(raw)) {
      result.name = raw;
    }
  }

  if (!result.name) {
    const paraMatch = text.match(/(?:reserva(?:ci[oó]n)?\s+para|servicio\s+para|traslado\s+para|para)[:\s*]+([A-Za-zÁÉÍÓÚáéíóúñÑüÜ\s.'-]+?)(?:,|\.|\n|;|\||hotel|destino|van\s+al|vuelo|flight|pax|personas|adultos|\d|$)/i);
    if (paraMatch && paraMatch[1]?.trim().length > 2) {
      const raw = paraMatch[1].trim();
      if (!/^(reservar|cotizar|pedir|hacer|un|una|el|la|los|las|servicio|traslado|tour|hotel|aeropuerto|ir|llegar|salir)/i.test(raw)) {
        result.name = raw;
      }
    }
  }

  if (!result.name && lines.length > 0) {
    const firstLine = lines[0].replace(/[*_#>-]/g, '').trim();
    if (/^[A-Za-zÁÉÍÓÚáéíóúñÑüÜ\s.'-]{3,40}$/.test(firstLine) && !/(reserva|traslado|quick|travel|voucher|tour|hotel|cancun|cancún|hola|buenos|buenas|cotizaci[oó]n)/i.test(firstLine)) {
      result.name = firstLine;
    }
  }

  if (result.name) {
    result.arrivalName = result.name;
    result.departureName = result.name;
  }

  // 3. Passenger Count (PAX)
  const paxMatch =
    text.match(/(?:pax|personas|pasajeros|adultos|paxs|guests|people)[:\s*]*(\d+)/i) ||
    text.match(/\b(\d+)\s*(?:personas|pasajeros|pax|adultos|paxs|guests|people)\b/i);
  if (paxMatch && paxMatch[1]) {
    const count = parseInt(paxMatch[1], 10);
    if (!isNaN(count) && count > 0 && count < 200) {
      result.peopleCount = count;
      result.peopleCountArrival = count;
      result.peopleCountDeparture = count;
    }
  }

  // 4. Origin & Destination Hotel
  const hotelRegex = /(?:hotel|destino|hospedaje|resort|destination|hacia\s+el|hacia|van\s+al|al\s+hotel|llegan\s+al?\s+hotel|recoger\s+en|pickup\s+en)[:\s*]+([A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ\s.'&-]+?)(?:,|\.|\n|;|\||salen|llegan|salida|llegada|vuelo|flight|pax|personas|habitaci[oó]n|room|\$|\d{1,2}:\d{2}|$)/i;
  const hotelMatch = text.match(hotelRegex);
  if (hotelMatch && hotelMatch[1]?.trim().length > 2) {
    let cleanHotel = hotelMatch[1].trim();
    if (!/^hotel\b/i.test(cleanHotel) && /\bhotel\b/i.test(hotelMatch[0])) {
      cleanHotel = `Hotel ${cleanHotel}`;
    }
    result.arrivalDestination = cleanHotel;
    result.originDeparture = cleanHotel;
    result.destination = cleanHotel;
  } else {
    const knownMatch = text.match(/\b((?:Hotel\s+)?(?:Riu|Moon\s+Palace|Xcaret|Hyatt|Hard\s+Rock|Iberostar|Secrets|Dreams|Atelier|Grand\s+Palladium|Palladium|Barcel[oó]|Garza\s+Blanca|Hilton|Marriott|Westin|Fiesta\s+Americana|Live\s+Aqua|Paradisus|Kempinski|Seadust|Crown\s+Paradise|Royalton|Planet\s+Hollywood|Majestic|Catalonia|Bahia\s+Principe|Ocean\s+Coral|Ocean\s+Riviera|Valentin\s+Imperial|Nickelodeon|breathless|Sunscape|Now\s+Emerald|Excellence|Finest|Beloved|TRS|Grand\s+Oasis|Oasis|Krystal|Emporio|Flamingo|Presidente\s+InterContinental|Nizuc|Le\s+Blanc|Sun\s+Palace|Beach\s+Palace|Playacar\s+Palace)[A-Za-z0-9ÁÉÍÓÚáéíóúñÑ\s]*?)(?:,|\.|\n|;|\||salen|llegan|vuelo|pax|\$|\d{1,2}:|$)/i);
    if (knownMatch && knownMatch[1]) {
      const cleanHotel = knownMatch[1].trim();
      result.arrivalDestination = cleanHotel;
      result.originDeparture = cleanHotel;
      result.destination = cleanHotel;
    }
  }

  // Origin / Terminal extraction
  const terminalMatch = text.match(/\b(terminal\s*[1234]|t[1234]|aeropuerto\s*(?:de\s*)?canc[uú]n)\b/i);
  if (terminalMatch && terminalMatch[1]) {
    result.origin = terminalMatch[1].toUpperCase().startsWith('T') && terminalMatch[1].length === 2
      ? `Aeropuerto Cancún (${terminalMatch[1].toUpperCase()})`
      : terminalMatch[1].trim();
  }

  // 5. Airline & Flight Number
  for (const [key, val] of Object.entries(COMMON_AIRLINES)) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(text)) {
      result.airlineArrival = val;
      break;
    }
  }

  const allFlightMatches: string[] = [];
  const flightLabeledRegex = /(?:vuelo|flight|vuelo\s+no\.?|#?\s*de\s+vuelo)[:\s#*-]*([A-Za-z0-9]{2,3}[\s-]?\d{2,5}|\d{3,5})/gi;
  let fMatch;
  while ((fMatch = flightLabeledRegex.exec(text)) !== null) {
    const rawCode = fMatch[1].replace(/\s+/g, ' ').trim().toUpperCase();
    const parts = rawCode.split(/[\s-]/);
    if (parts[0] && !STOP_WORDS_SPANISH.has(parts[0])) {
      allFlightMatches.push(rawCode);
    }
  }

  // Fallback: IATA flight number format (e.g. AA123, AA 1234, Y4 721, VB205, AM 540)
  if (allFlightMatches.length === 0) {
    const codeRegex = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/g;
    let cMatch;
    while ((cMatch = codeRegex.exec(text)) !== null) {
      const prefix = cMatch[1].toUpperCase();
      const num = cMatch[2];
      if (!STOP_WORDS_SPANISH.has(prefix) && !/^(NO|SI|OK|DE|EL|LA|AL|EN|UN|AM|PM|HR)$/.test(prefix) || IATA_AIRLINE_MAP[prefix]) {
        // Note: Only allow 'AM' if followed by 3-4 digits and not preceded by a time
        if (prefix === 'AM' && num.length < 3) continue;
        allFlightMatches.push(`${prefix}${num}`);
      }
    }
  }

  if (allFlightMatches.length > 0) {
    result.flightNoArrival = allFlightMatches[0];
    // Infer airline from IATA prefix if not already set
    if (!result.airlineArrival) {
      const prefixMatch = allFlightMatches[0].match(/^([A-Z0-9]{2})/);
      if (prefixMatch && IATA_AIRLINE_MAP[prefixMatch[1]]) {
        result.airlineArrival = IATA_AIRLINE_MAP[prefixMatch[1]];
      }
    }
    if (allFlightMatches.length > 1) {
      result.observations = result.observations
        ? `${result.observations} | Vuelo salida: ${allFlightMatches[1]}`
        : `Vuelo salida: ${allFlightMatches[1]}`;
    }
  }

  // Default airport origin/destination for arrival/departure services if not explicitly provided
  if ((result.serviceType === 'Solo Llegada' || result.serviceType === 'Llegada y Salida') && !result.origin) {
    result.origin = 'Aeropuerto Cancún';
  }
  if ((result.serviceType === 'Solo Salida' || result.serviceType === 'Llegada y Salida') && !result.departureDestination) {
    result.departureDestination = 'Aeropuerto Cancún';
  }

  // 6. Dates (DD/MM/YYYY)
  const parsedDates = parseDatesToMexicanFormat(text);
  if (parsedDates.length > 0) {
    if (result.serviceType === 'Solo Salida' || result.serviceType === 'Solo Traslado' || result.serviceType === 'Tour o Excursión' || result.serviceType === 'Circuito') {
      result.dateDeparture = parsedDates[0].date;
      result.dateArrival = parsedDates[0].date;
    } else {
      result.dateArrival = parsedDates[0].date;
      if (parsedDates.length > 1) {
        result.dateDeparture = parsedDates[1].date;
      }
    }
  }

  // 7. Times
  const arrivalTimeMatch = text.match(/(?:hora\s+de\s+llegada|llegada\s+a\s+las|llegan(?:.*?)a\s+las|arribo|landing|arrival\s+time)[:\s*]*(\d{1,2}:\d{2}(?:\s*(?:a\.?m\.?|p\.?m\.?|hrs?))?)/i);
  if (arrivalTimeMatch && arrivalTimeMatch[1]) {
    result.arrivalTime = normalizeTime(arrivalTimeMatch[1]);
  }

  const pickupMatch = text.match(/(?:pick(?:\s*|-)?up|recojo|recolecci[oó]n|salida\s+del\s+hotel|salen(?:.*?)a\s+las|hora\s+pick\s*up)[:\s*]*(\d{1,2}:\d{2}(?:\s*(?:a\.?m\.?|p\.?m\.?|hrs?))?)/i);
  if (pickupMatch && pickupMatch[1]) {
    result.departureTimeHotel = normalizeTime(pickupMatch[1]);
  }

  const flightTimeMatch = text.match(/(?:hora\s+vuelo|vuelo\s+sale(?:\s+a\s+las)?|sale\s+a\s+las|flight\s+time|hora\s+de\s+vuelo)[:\s*]*(\d{1,2}:\d{2}(?:\s*(?:a\.?m\.?|p\.?m\.?|hrs?))?)/i);
  if (flightTimeMatch && flightTimeMatch[1]) {
    result.departureTimeFlight = normalizeTime(flightTimeMatch[1]);
  }

  if (!result.arrivalTime && !result.departureTimeHotel) {
    const allTimes = Array.from(text.matchAll(/\b(\d{1,2}:\d{2}(?:\s*(?:a\.?m\.?|p\.?m\.?|hrs?))?)\b/gi)).map(m => normalizeTime(m[1]));
    if (allTimes.length > 0) {
      if (result.serviceType === 'Solo Salida' || result.serviceType === 'Tour o Excursión' || result.serviceType === 'Solo Traslado') {
        result.departureTimeHotel = allTimes[0];
        if (allTimes.length > 1) result.departureTimeFlight = allTimes[1];
      } else {
        result.arrivalTime = allTimes[0];
        if (allTimes.length > 1) result.departureTimeHotel = allTimes[1];
      }
    }
  }

  // 8. Room Number
  const roomMatch = text.match(/(?:habitaci[oó]n|room|hab\.?|cuarto)[:\s#*-]*([A-Za-z0-9-]+)/i);
  if (roomMatch && roomMatch[1]) {
    result.roomNumber = roomMatch[1].trim();
  }

  // 9. Price / Financials (Deposit & Balance in USD or MXN)
  const depositUsdMatch = text.match(/(?:dep[oó]sito|anticipo|deposit)[:\s*]*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:usd|d[oó]lares|dlls)/i);
  if (depositUsdMatch && depositUsdMatch[1]) {
    const val = parseFloat(depositUsdMatch[1].replace(/,/g, ''));
    if (!isNaN(val)) result.depositUsd = val;
  }

  const depositMxnMatch = text.match(/(?:dep[oó]sito|anticipo)[:\s*]*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:mxn|pesos|m\.?n\.?)?/i);
  if (depositMxnMatch && depositMxnMatch[1] && !depositUsdMatch) {
    const val = parseFloat(depositMxnMatch[1].replace(/,/g, ''));
    if (!isNaN(val)) result.depositMxn = val;
  }

  const usdMatch =
    text.match(/(?:saldo|restante|a\s+pagar|pendiente|balance|restan|total|precio|costo|tarifa|monto|price|amount)[:\s*]*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:usd|d[oó]lares|dlls)/i) ||
    text.match(/\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:usd|d[oó]lares|dlls)\b/i) ||
    text.match(/\busd\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (usdMatch && usdMatch[1]) {
    const clean = parseFloat(usdMatch[1].replace(/,/g, ''));
    if (!isNaN(clean)) result.toPayUsd = clean;
  }

  const mxnMatch =
    text.match(/(?:saldo|restante|a\s+pagar|pendiente|balance|total|restan|precio|costo|tarifa|monto|pagan|efectivo)[:\s*]*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:mxn|pesos|m\.?n\.?)?/i) ||
    text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:mxn|pesos|m\.?n\.?)?\b/i) ||
    text.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:pesos|mxn)\b/i);
  if (mxnMatch && mxnMatch[1] && !usdMatch) {
    const clean = parseFloat(mxnMatch[1].replace(/,/g, ''));
    if (!isNaN(clean)) result.toPayMxn = clean;
  }

  return result;
}

/**
 * Normalizes extracted reservation fields into a consistent structure with Mexican dates (DD/MM/YYYY).
 */
function normalizeReservationData(parsedData: any): Partial<Reservation> {
  const normalized: any = { ...parsedData };

  // Clean empty or null properties so we know if meaningful fields were found
  Object.keys(normalized).forEach(k => {
    if (normalized[k] === null || normalized[k] === undefined || normalized[k] === '') {
      delete normalized[k];
    }
  });

  if (normalized.serviceType === "Tour o Excursión" || normalized.serviceType === "Solo Salida") {
    if (normalized.origin && !normalized.originDeparture) {
      normalized.originDeparture = normalized.origin;
    }
    if (normalized.dateArrival && !normalized.dateDeparture) {
      normalized.dateDeparture = normalized.dateArrival;
    }
  }

  if (normalized.serviceType === "Llegada y Salida") {
    if (normalized.arrivalDestination && !normalized.originDeparture) {
      normalized.originDeparture = normalized.arrivalDestination;
    }
    if (!normalized.transferSubtype) {
      normalized.transferSubtype = "Traslado Redondo";
    }
  }

  if (normalized.name) {
    if (!normalized.arrivalName) normalized.arrivalName = normalized.name;
    if (!normalized.departureName) normalized.departureName = normalized.name;
  }

  if (normalized.peopleCount !== undefined && normalized.peopleCount !== null) {
    const pCount = Number(normalized.peopleCount) || 1;
    normalized.peopleCount = pCount;
    if (!normalized.peopleCountArrival) normalized.peopleCountArrival = pCount;
    if (!normalized.peopleCountDeparture) normalized.peopleCountDeparture = pCount;
  }

  if (normalized.depositMxn !== undefined) normalized.depositMxn = Number(normalized.depositMxn) || 0;
  if (normalized.toPayMxn !== undefined) normalized.toPayMxn = Number(normalized.toPayMxn) || 0;
  if (normalized.depositUsd !== undefined) normalized.depositUsd = Number(normalized.depositUsd) || 0;
  if (normalized.toPayUsd !== undefined) normalized.toPayUsd = Number(normalized.toPayUsd) || 0;

  // Enforce Mexican date conventions (DD/MM/YYYY) for all dates
  if (normalized.dateArrival) {
    normalized.dateArrival = toMexicanDateFormat(normalized.dateArrival);
  }
  if (normalized.dateDeparture) {
    normalized.dateDeparture = toMexicanDateFormat(normalized.dateDeparture);
  }
  if (Array.isArray(normalized.extraLegs)) {
    normalized.extraLegs = normalized.extraLegs.map((leg: any) => ({
      ...leg,
      date: toMexicanDateFormat(leg.date)
    }));
  }
  if (Array.isArray(normalized.extraTours)) {
    normalized.extraTours = normalized.extraTours.map((tour: any) => ({
      ...tour,
      dateDeparture: toMexicanDateFormat(tour.dateDeparture)
    }));
  }
  if (Array.isArray(normalized.circuitoLegs)) {
    normalized.circuitoLegs = normalized.circuitoLegs.map((leg: any) => ({
      ...leg,
      date: toMexicanDateFormat(leg.date)
    }));
  }

  return normalized;
}

/**
 * Parses reservation text 100% on the client side:
 * - Never calls relative backend routes like /api/autocomplete or /api/parse-reservation.
 * - Uses client-side regex extraction + optional client-side Gemini SDK (if NEXT_PUBLIC_GEMINI_API_KEY is defined).
 * - Wraps all JSON extraction in try/catch blocks so raw "UNEXPECTED TOKEN" errors can never occur.
 * - Throws "No se encontraron datos de reserva en el texto." if no reservation fields could be extracted.
 */
export async function parseReservationText(text: string): Promise<Partial<Reservation>> {
  if (!text || !text.trim()) {
    throw new Error("No se encontraron datos de reserva en el texto.");
  }

  // Always compute deterministic regex extraction first as a baseline
  let regexExtracted: Partial<Reservation> = {};
  try {
    regexExtracted = extractReservationFieldsWithRegex(text);
  } catch (regexErr) {
    console.warn("Regex extraction warning:", regexErr);
  }

  const apiKey = getClientApiKey();
  const currentDate = new Date().toISOString().split("T")[0];

  // If client-side Gemini API key is configured, enhance extraction via Google GenAI SDK
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
      });

      const systemPrompt = `Eres un asistente experto en logística y reservas para Quick Travel Cancún.
Analiza el texto suministrado y extrae todos los datos relevantes para rellenar un voucher de reservación.
Fecha de referencia actual del sistema: ${currentDate}.
REGLA CRÍTICA DE FECHAS: Todas las fechas deben extraerse y formatearse estrictamente en formato mexicano DD/MM/YYYY (ejemplo: 27/09/2026 en lugar de 2026-09-27 o 09/27/2026).

Reglas de servicio:
- serviceType debe ser: "Llegada y Salida", "Solo Llegada", "Solo Salida", "Solo Traslado", "Tour o Excursión" o "Circuito"
- transferSubtype: "Traslado Redondo", "Traslado Sencillo", o "Traslado Múltiple"
- tourType: "Tour Compartido" o "Tour Privado"

Campos esperados en formato JSON:
name, serviceType, transferSubtype, tourName, tourType, observations, origin, arrivalDestination,
peopleCountArrival, dateArrival (DD/MM/YYYY), arrivalTime (HH:MM), flightNoArrival, airlineArrival,
originDeparture, departureDestination, peopleCountDeparture, dateDeparture (DD/MM/YYYY),
departureTimeHotel (HH:MM), departureTimeFlight (HH:MM), peopleCount (número), depositMxn (número),
toPayMxn (número), depositUsd (número), toPayUsd (número), roomNumber, unitType, includedThings,
notIncludedThings, circuitoLegs: [{ date (DD/MM/YYYY), placesToVisit, schedule, entranceCosts, pricePerDay, observations }]

Si el texto no contiene ningún dato de reserva, devuelve un objeto JSON vacío {}.
Devuelve ÚNICAMENTE un objeto JSON válido.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `${systemPrompt}\n\nTexto a analizar:\n"""\n${text.trim()}\n"""`,
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text || "";
      let cleaned = responseText.replace(/```json|```/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      if (cleaned) {
        try {
          const parsed = JSON.parse(cleaned);
          if (parsed && typeof parsed === 'object') {
            const merged = { ...regexExtracted };
            for (const [k, v] of Object.entries(parsed)) {
              if (v !== null && v !== undefined && v !== '') {
                (merged as any)[k] = v;
              }
            }
            const normalized = normalizeReservationData(merged);
            if (Object.keys(normalized).length > 0) {
              return normalized;
            }
          }
        } catch (jsonParseErr) {
          console.warn("Gemini JSON parse warning, using client regex extraction:", jsonParseErr);
        }
      }
    } catch (geminiError) {
      console.warn("Client Gemini SDK call failed, using client regex extraction:", geminiError);
    }
  }

  const normalizedRegex = normalizeReservationData(regexExtracted);
  if (normalizedRegex && Object.keys(normalizedRegex).length > 0) {
    return normalizedRegex;
  }

  throw new Error("No se encontraron datos de reserva en el texto.");
}
