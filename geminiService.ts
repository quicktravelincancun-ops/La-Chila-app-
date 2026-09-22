// Client-side reservation parsing and autocomplete service for Quick Travel Cancún.
// Designed to operate seamlessly both in Google AI Studio and on external mobile devices / Vercel
// without throwing unhandled JSON parsing errors.
import { GoogleGenAI } from '@google/genai';
import { Reservation } from './types';

const MONTHS_ES: Record<string, string> = {
  enero: '01', ene: '01',
  febrero: '02', feb: '02',
  marzo: '03', mar: '03',
  abril: '04', abr: '04',
  mayo: '05', may: '05',
  junio: '06', jun: '06',
  julio: '07', jul: '07',
  agosto: '08', ago: '08',
  septiembre: '09', sep: '09', setiembre: '09',
  octubre: '10', oct: '10',
  noviembre: '11', nov: '11',
  diciembre: '12', dic: '12'
};

const STOP_WORDS_SPANISH = new Set([
  'EL', 'LA', 'DE', 'EN', 'AL', 'UN', 'UNA', 'DEL', 'LOS', 'LAS', 'CON', 'POR', 'QUE', 'PARA', 'MAS', 'SIN', 'SUS', 'MIS', 'TUS'
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
  'delta': 'Delta Air Lines',
  'jetblue': 'JetBlue',
  'southwest': 'Southwest',
  'spirit': 'Spirit Airlines',
  'frontier': 'Frontier',
  'air canada': 'Air Canada',
  'westjet': 'WestJet',
  'copa': 'Copa Airlines',
  'sunwing': 'Sunwing',
  'air transat': 'Air Transat',
  'british airways': 'British Airways',
  'avianca': 'Avianca',
  'latam': 'LATAM'
};

/**
 * Retrieves the client-side Gemini API key if declared in any standard environment variable.
 */
function getClientApiKey(): string {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NEXT_PUBLIC_GEMINI_API_KEY) return process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    if (process.env.API_KEY) return process.env.API_KEY;
  }
  if (typeof import.meta !== 'undefined' && (import.meta as any)?.env) {
    const metaEnv = (import.meta as any).env;
    if (metaEnv.NEXT_PUBLIC_GEMINI_API_KEY) return metaEnv.NEXT_PUBLIC_GEMINI_API_KEY;
    if (metaEnv.VITE_GEMINI_API_KEY) return metaEnv.VITE_GEMINI_API_KEY;
    if (metaEnv.GEMINI_API_KEY) return metaEnv.GEMINI_API_KEY;
    if (metaEnv.API_KEY) return metaEnv.API_KEY;
  }
  if (typeof window !== 'undefined') {
    const win = window as any;
    if (win.NEXT_PUBLIC_GEMINI_API_KEY) return win.NEXT_PUBLIC_GEMINI_API_KEY;
    if (win.GEMINI_API_KEY) return win.GEMINI_API_KEY;
    if (win.__GEMINI_API_KEY__) return win.__GEMINI_API_KEY__;
  }
  return '';
}

/**
 * Normalizes time strings into standard 24h format (HH:MM).
 * Examples: "2:30 pm" -> "14:30", "11:20 am" -> "11:20", "14:30 hrs" -> "14:30"
 */
function normalizeTime(raw: string): string {
  if (!raw) return '';
  const clean = raw.trim().toLowerCase().replace(/hrs|hr|horas?/g, '').trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (!match) return clean;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const meridian = match[3];

  if (meridian === 'pm' && hours < 12) hours += 12;
  if (meridian === 'am' && hours === 12) hours = 0;

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

/**
 * Extracts and normalizes dates from Spanish text (e.g. "15 de Octubre", "12/04/2026", "2026-10-15").
 */
function parseSpanishDates(text: string): Array<{ date: string; index: number; raw: string }> {
  const results: Array<{ date: string; index: number; raw: string }> = [];
  const currentYear = new Date().getFullYear().toString();

  // Pattern 1: 15 de Octubre (de 2026)
  const regexNamed = /\b(\d{1,2})\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)(?:\s*(?:del?\s+)?(202\d))?\b/gi;
  let match;
  while ((match = regexNamed.exec(text)) !== null) {
    const day = match[1].padStart(2, '0');
    const month = MONTHS_ES[match[2].toLowerCase()];
    const year = match[3] || currentYear;
    if (month) {
      results.push({
        date: `${year}-${month}-${day}`,
        index: match.index,
        raw: match[0]
      });
    }
  }

  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY
  const regexNumeric = /\b(\d{1,2})[-/](\d{1,2})[-/](202\d)\b/g;
  while ((match = regexNumeric.exec(text)) !== null) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    results.push({
      date: `${year}-${month}-${day}`,
      index: match.index,
      raw: match[0]
    });
  }

  // Pattern 3: YYYY-MM-DD
  const regexIso = /\b(202\d)[-/](\d{1,2})[-/](\d{1,2})\b/g;
  while ((match = regexIso.exec(text)) !== null) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    results.push({
      date: `${year}-${month}-${day}`,
      index: match.index,
      raw: match[0]
    });
  }

  return results.sort((a, b) => a.index - b.index);
}

/**
 * High-precision, clean JavaScript regex extraction for all reservation fields.
 * Operates purely on the client side without requiring any external network or API key.
 */
export function extractReservationFieldsWithRegex(text: string): Partial<Reservation> {
  const result: Partial<Reservation> = {};
  if (!text || !text.trim()) return result;

  const lower = text.toLowerCase();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Service Type & Subtype
  const hasRedondo = lower.includes('redondo') || lower.includes('round trip') || lower.includes('traslado redondo');
  const hasLlegan = lower.includes('llegan') || lower.includes('llegada');
  const hasSalen = lower.includes('salen') || lower.includes('salida');
  const isTour = !hasRedondo && (
    lower.includes('tour') || lower.includes('excursion') || lower.includes('excursión') ||
    lower.includes('chichen') || lower.includes('cenote') || lower.includes('catamaran') || lower.includes('isla mujeres')
  );

  if (lower.includes('circuito')) {
    result.serviceType = 'Circuito';
  } else if (hasRedondo || (hasLlegan && hasSalen)) {
    result.serviceType = 'Llegada y Salida';
    result.transferSubtype = 'Traslado Redondo';
  } else if (isTour) {
    result.serviceType = 'Tour o Excursión';
    result.tourType = (lower.includes('privado') || lower.includes('private')) ? 'Tour Privado' : 'Tour Compartido';

    const tourMatch = text.match(/(?:tour|excursi[oó]n)[:\s]+([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ\s]+?)(?:,|\.|\n|para|pax|\$|$)/i);
    if (tourMatch && tourMatch[1]?.trim().length > 2) {
      result.tourName = tourMatch[1].trim();
    }
  } else if (hasLlegan) {
    result.serviceType = 'Solo Llegada';
    result.transferSubtype = 'Traslado Sencillo';
  } else if (hasSalen) {
    result.serviceType = 'Solo Salida';
    result.transferSubtype = 'Traslado Sencillo';
  } else if (lower.includes('traslado')) {
    result.serviceType = 'Solo Traslado';
    result.transferSubtype = 'Traslado Sencillo';
  }

  // 2. Passenger / Lead Name
  // Priority 1: Explicit Label
  const explicitNameMatch = text.match(/(?:titular|pasajero|nombre(?: del titular| del pasajero| del cliente)?|cliente|lead passenger|guest|pax name|a nombre de|hu[eé]sped)[:\s*]+([A-Za-zÁÉÍÓÚáéíóúñÑüÜ\s.'-]+?)(?:,|\.|\n|hotel|destino|van al|vuelo|flight|pax|personas|\d|$)/i);
  if (explicitNameMatch && explicitNameMatch[1]?.trim().length > 2) {
    const raw = explicitNameMatch[1].trim();
    if (!/^(hotel|vuelo|llegada|salida|tour|servicio|traslado)/i.test(raw)) {
      result.name = raw;
    }
  }

  // Priority 2: "reserva para X" or "para X" (avoiding verbs like "reservar")
  if (!result.name) {
    const paraMatch = text.match(/(?:reserva para|para)[:\s]+([A-Za-zÁÉÍÓÚáéíóúñÑüÜ\s.'-]+?)(?:,|\.|\n|hotel|destino|van al|vuelo|flight|pax|personas|\d|$)/i);
    if (paraMatch && paraMatch[1]?.trim().length > 2) {
      const raw = paraMatch[1].trim();
      if (!/^(reservar|cotizar|pedir|hacer|un|una|el|la|los|las|servicio|traslado|tour)/i.test(raw)) {
        result.name = raw;
      }
    }
  }

  // Priority 3: First line if person name
  if (!result.name && lines.length > 0) {
    const firstLine = lines[0].replace(/[*_#]/g, '').trim();
    if (/^[A-Za-zÁÉÍÓÚáéíóúñÑüÜ\s.'-]{3,35}$/.test(firstLine) && !/(reserva|traslado|quick|travel|voucher|tour|hotel|cancun|hola)/i.test(firstLine)) {
      result.name = firstLine;
    }
  }

  if (result.name) {
    result.arrivalName = result.name;
    result.departureName = result.name;
  }

  // 3. PAX count
  const paxMatch = text.match(/(?:pax|personas|pasajeros|adultos|paxs|guests|people)[:\s*]+(\d+)/i) ||
                   text.match(/(\d+)\s*(?:personas|pasajeros|pax|adultos|paxs|guests|people)/i);
  if (paxMatch && paxMatch[1]) {
    const count = parseInt(paxMatch[1], 10);
    if (!isNaN(count) && count > 0) {
      result.peopleCount = count;
      result.peopleCountArrival = count;
      result.peopleCountDeparture = count;
    }
  }

  // 4. Hotel / Destination
  const hotelRegex = /(?:hotel|destino|hospedaje|resort|destination|hacia el|van al|al hotel|recoger en|origen)[:\s*]+([A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ\s.'-]+?)(?:,|\.|\n|salen|llegan|vuelo|flight|\$|\d{1,2}:|$)/i;
  const hotelMatch = text.match(hotelRegex);
  if (hotelMatch && hotelMatch[1]?.trim().length > 2) {
    const cleanHotel = hotelMatch[1].trim();
    result.arrivalDestination = cleanHotel;
    result.originDeparture = cleanHotel;
    result.destination = cleanHotel;
  } else {
    const knownMatch = text.match(/\b(Riu\s+[A-Za-z0-9\s]+|Moon Palace[A-Za-z0-9\s]*|Hotel Xcaret[A-Za-z0-9\s]*|Hyatt[A-Za-z0-9\s]+|Hard Rock[A-Za-z0-9\s]*|Iberostar[A-Za-z0-9\s]+|Secrets[A-Za-z0-9\s]+|Dreams[A-Za-z0-9\s]+|Atelier[A-Za-z0-9\s]*|Grand Palladium[A-Za-z0-9\s]*|Barcel[oó][A-Za-z0-9\s]+)\b/i);
    if (knownMatch && knownMatch[1]) {
      const cleanHotel = knownMatch[1].trim();
      result.arrivalDestination = cleanHotel;
      result.originDeparture = cleanHotel;
      result.destination = cleanHotel;
    }
  }

  // 5. Airline
  for (const [key, val] of Object.entries(COMMON_AIRLINES)) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(text)) {
      result.airlineArrival = val;
      break;
    }
  }

  // 6. Flight Numbers
  const allFlightMatches: string[] = [];
  const flightRegex = /(?:vuelo|flight|vuelo no)[:\s*]*([A-Za-z0-9\s]{2,10}\b\d{2,5})/gi;
  let fMatch;
  while ((fMatch = flightRegex.exec(text)) !== null) {
    let rawCode = fMatch[1].replace(/\s+/g, ' ').trim().toUpperCase();
    // Strip leading airline name if captured together
    for (const airlineKey of Object.keys(COMMON_AIRLINES)) {
      const re = new RegExp(`^${airlineKey}\\s+`, 'i');
      rawCode = rawCode.replace(re, '');
    }
    const parts = rawCode.split(' ');
    if (parts[0] && !STOP_WORDS_SPANISH.has(parts[0])) {
      allFlightMatches.push(rawCode);
    }
  }

  // Fallback: Check standard airline IATA codes (e.g. AA 123, Y4 721, VB 205)
  if (allFlightMatches.length === 0) {
    const codeRegex = /\b([A-Z0-9]{2}\s*\d{2,5})\b/g;
    let cMatch;
    while ((cMatch = codeRegex.exec(text)) !== null) {
      const code = cMatch[1].trim().toUpperCase();
      const prefix = code.split(/[\s0-9]/)[0];
      if (prefix && !STOP_WORDS_SPANISH.has(prefix) && !/^(NO|SI|OK)$/.test(prefix)) {
        allFlightMatches.push(code);
      }
    }
  }

  if (allFlightMatches.length > 0) {
    result.flightNoArrival = allFlightMatches[0];
    if (allFlightMatches.length > 1) {
      result.observations = result.observations
        ? `${result.observations} | Vuelo salida: ${allFlightMatches[1]}`
        : `Vuelo salida: ${allFlightMatches[1]}`;
    }
  }

  // 7. Dates
  const parsedDates = parseSpanishDates(text);
  if (parsedDates.length > 0) {
    result.dateArrival = parsedDates[0].date;
    if (parsedDates.length > 1) {
      result.dateDeparture = parsedDates[1].date;
    }
  }

  // 8. Times
  // Arrival Time
  const arrivalTimeMatch = text.match(/(?:hora de llegada|llegada a las|llegan.*?a las|arribo|landing|arrival time)[:\s*]+(\d{1,2}:\d{2}(?:\s*(?:am|pm|hrs))?)/i);
  if (arrivalTimeMatch && arrivalTimeMatch[1]) {
    result.arrivalTime = normalizeTime(arrivalTimeMatch[1]);
  }

  // Departure Hotel Pickup Time
  const pickupMatch = text.match(/(?:pick(?:\s*|-)?up|recojo|salida del hotel|hora pick up|hotel pick up)[:\s*]+(\d{1,2}:\d{2}(?:\s*(?:am|pm|hrs))?)/i);
  if (pickupMatch && pickupMatch[1]) {
    result.departureTimeHotel = normalizeTime(pickupMatch[1]);
  }

  // Flight Departure Time
  const flightTimeMatch = text.match(/(?:hora vuelo|vuelo sale(?:\s+a\s+las)?|sale a las|flight time|hora de vuelo)[:\s*]+(\d{1,2}:\d{2}(?:\s*(?:am|pm|hrs))?)/i);
  if (flightTimeMatch && flightTimeMatch[1]) {
    result.departureTimeFlight = normalizeTime(flightTimeMatch[1]);
  }

  // General time fallback
  if (!result.arrivalTime && !result.departureTimeHotel) {
    const singleTime = text.match(/\b(\d{1,2}:\d{2}(?:\s*(?:am|pm|hrs))?)\b/i);
    if (singleTime && singleTime[1]) {
      const norm = normalizeTime(singleTime[1]);
      if (result.serviceType === 'Solo Salida') {
        result.departureTimeHotel = norm;
      } else {
        result.arrivalTime = norm;
      }
    }
  }

  // 9. Room number
  const roomMatch = text.match(/(?:habitaci[oó]n|room|hab|cuarto)[:\s*]*([A-Za-z0-9\-]+)/i);
  if (roomMatch && roomMatch[1]) {
    result.roomNumber = roomMatch[1].trim();
  }

  // 10. Financials
  // USD Balance
  const usdMatch = text.match(/(?:saldo|restante|a pagar|pendiente|balance|restan|total)[:\s*]+(?:\$|usd)?\s*([\d,]+(?:\.\d{2})?)\s*(?:usd|dolares|dólares)/i) ||
                   text.match(/(\d+(?:\.\d{2})?)\s*(?:usd|dolares|dólares)/i);
  if (usdMatch && usdMatch[1]) {
    const clean = parseFloat(usdMatch[1].replace(/,/g, ''));
    if (!isNaN(clean)) result.toPayUsd = clean;
  }

  // MXN Balance
  const mxnMatch = text.match(/(?:saldo|restante|a pagar|pendiente|balance|total|restan)[:\s*]+(?:\$|mxn)?\s*([\d,]+(?:\.\d{2})?)\s*(?:mxn|pesos)?/i) ||
                   text.match(/(\d+(?:\.\d{2})?)\s*(?:pesos|mxn)/i);
  if (mxnMatch && mxnMatch[1] && !usdMatch) {
    const clean = parseFloat(mxnMatch[1].replace(/,/g, ''));
    if (!isNaN(clean)) result.toPayMxn = clean;
  }

  return result;
}

/**
 * Normalizes extracted reservation fields into a consistent structure.
 */
function normalizeReservationData(parsedData: any): Partial<Reservation> {
  const normalized: any = { ...parsedData };

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

  return normalized;
}

/**
 * Executes autocomplete seamlessly.
 * 1. Checks if client-side Gemini key is available.
 * 2. If available, tries Gemini AI parsing with markdown stripping and try/catch.
 * 3. Always falls back to the client-side regex extraction if no key is available
 *    or if Gemini encounters quota/network issues.
 * 4. Never throws unhandled JSON errors.
 */
export async function parseReservationText(text: string): Promise<Partial<Reservation>> {
  if (!text || !text.trim()) {
    throw new Error("No hay texto para procesar.");
  }

  const apiKey = getClientApiKey();
  const currentDate = new Date().toISOString().split("T")[0];

  // Try direct client-side Gemini AI call if an API key is present
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const systemPrompt = `Eres un asistente experto en logística y reservas para Quick Travel Cancún.
Analiza el texto suministrado y extrae todos los datos relevantes para rellenar un voucher de reservación.
Fecha de referencia actual del sistema: ${currentDate}.

Reglas de servicio:
- serviceType debe ser: "Llegada y Salida", "Solo Llegada", "Solo Salida", "Solo Traslado", "Tour o Excursión" o "Circuito"
- transferSubtype: "Traslado Redondo", "Traslado Sencillo", o "Traslado Múltiple"
- tourType: "Tour Compartido" o "Tour Privado"

Campos esperados en formato JSON:
name, serviceType, transferSubtype, tourName, tourType, observations, origin, arrivalDestination,
peopleCountArrival, dateArrival (YYYY-MM-DD), arrivalTime (HH:MM), flightNoArrival, airlineArrival,
originDeparture, departureDestination, peopleCountDeparture, dateDeparture (YYYY-MM-DD),
departureTimeHotel (HH:MM), departureTimeFlight (HH:MM), peopleCount (número), depositMxn (número),
toPayMxn (número), depositUsd (número), toPayUsd (número), roomNumber, unitType, includedThings,
notIncludedThings, circuitoLegs: [{ date, placesToVisit, schedule, entranceCosts, pricePerDay, observations }]

Devuelve ÚNICAMENTE un objeto JSON válido con los campos extraídos.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `${systemPrompt}\n\nTexto a analizar:\n"""\n${text.trim()}\n"""`,
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text || "";

      // Clean and strip any markdown formatting from the Gemini response string
      let cleaned = responseText.replace(/```json|```/g, '').trim();

      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      if (cleaned) {
        try {
          const parsed = JSON.parse(cleaned);
          if (parsed && typeof parsed === 'object') {
            return normalizeReservationData(parsed);
          }
        } catch (jsonParseErr) {
          console.warn("Gemini JSON parse warning, falling back to regex extraction:", jsonParseErr);
        }
      }
    } catch (geminiError) {
      console.warn("Client Gemini call failed, falling back to regex extraction:", geminiError);
    }
  }

  // Client-side regex extraction fallback
  try {
    const fallbackData = extractReservationFieldsWithRegex(text);
    if (fallbackData && Object.keys(fallbackData).length > 0) {
      return normalizeReservationData(fallbackData);
    }
  } catch (fallbackError) {
    console.warn("Client regex extraction warning:", fallbackError);
  }

  throw new Error("No se pudo procesar el texto. Verifica los datos.");
}
