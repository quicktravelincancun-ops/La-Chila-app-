// Security Note: Client-side Gemini API invocation is implemented per explicit user request
// to ensure seamless execution on static deployments (e.g., Vercel / GitHub Pages) without
// depending on relative backend endpoints (such as /api/parse-reservation).
import { GoogleGenAI } from '@google/genai';
import { Reservation, CircuitoLeg } from './types';

function getClientApiKey(): string {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    if (process.env.API_KEY) return process.env.API_KEY;
  }
  if (typeof import.meta !== 'undefined' && (import.meta as any)?.env) {
    const metaEnv = (import.meta as any).env;
    if (metaEnv.VITE_GEMINI_API_KEY) return metaEnv.VITE_GEMINI_API_KEY;
    if (metaEnv.GEMINI_API_KEY) return metaEnv.GEMINI_API_KEY;
  }
  return '';
}

/**
 * Safely parse unstructured text locally using heuristic regex patterns
 * as a robust fallback if Gemini is offline or unreachable.
 */
function safelyStructuredPromptParsing(text: string): Partial<Reservation> {
  const result: Partial<Reservation> = {};
  const lower = text.toLowerCase();

  // Detect Service Type
  if (lower.includes('circuito')) {
    result.serviceType = 'Circuito';
  } else if (lower.includes('tour') || lower.includes('excursion') || lower.includes('excursión') || lower.includes('xcaret') || lower.includes('chichen') || lower.includes('tulum')) {
    result.serviceType = 'Tour o Excursión';
  } else if (lower.includes('llegada y salida') || lower.includes('redondo') || (lower.includes('llegan') && lower.includes('salen'))) {
    result.serviceType = 'Llegada y Salida';
    result.transferSubtype = 'Traslado Redondo';
  } else if (lower.includes('solo llegada') || lower.includes('llegada')) {
    result.serviceType = 'Solo Llegada';
  } else if (lower.includes('solo salida') || lower.includes('salida')) {
    result.serviceType = 'Solo Salida';
  } else if (lower.includes('traslado')) {
    result.serviceType = 'Solo Traslado';
    result.transferSubtype = 'Traslado Sencillo';
  }

  // Extract Passenger / Lead Name
  const nameMatch = text.match(/(?:para|nombre|titular|pasajero|cliente|reserva a nombre de)[:\s]+([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+?)(?:,|\.|\n|para|\d|pax|personas|$)/i);
  if (nameMatch && nameMatch[1]?.trim().length > 2) {
    const cleanName = nameMatch[1].trim();
    result.name = cleanName;
    result.arrivalName = cleanName;
    result.departureName = cleanName;
  }

  // Extract Pax count
  const paxMatch = text.match(/(\d+)\s*(?:personas|pasajeros|pax|adultos|paxs)/i) || text.match(/(?:personas|pasajeros|pax)[:\s]+(\d+)/i);
  if (paxMatch && paxMatch[1]) {
    const count = parseInt(paxMatch[1], 10);
    if (!isNaN(count) && count > 0) {
      result.peopleCount = count;
      result.peopleCountArrival = count;
      result.peopleCountDeparture = count;
    }
  }

  // Extract Hotel / Destination
  const hotelMatch = text.match(/(?:hotel|destino|hacia el|van al|al hotel|hospedaje)[:\s]+([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ\s]+?)(?:,|\.|\n|salen|llegan|\$|\d{1,2}:|$)/i);
  if (hotelMatch && hotelMatch[1]?.trim().length > 2) {
    const hotel = hotelMatch[1].trim();
    result.arrivalDestination = hotel;
    result.originDeparture = hotel;
    result.destination = hotel;
  }

  // Extract Flight number
  const flightMatch = text.match(/(?:vuelo|flight|vuelo de llegada)[:\s]*([A-Za-z]{2,3}\s*\d{2,5})/i);
  if (flightMatch && flightMatch[1]) {
    result.flightNoArrival = flightMatch[1].replace(/\s+/g, '').toUpperCase();
  }

  // Extract Room number
  const roomMatch = text.match(/(?:habitaci[oó]n|room|hab|cuarto)[:\s]*([A-Za-z0-9\-]+)/i);
  if (roomMatch && roomMatch[1]) {
    result.roomNumber = roomMatch[1].trim();
  }

  // Extract Dates (YYYY-MM-DD, DD/MM/YYYY, etc.)
  const isoDates = text.match(/\b(202\d[-/]\d{1,2}[-/]\d{1,2})\b/g);
  if (isoDates && isoDates.length > 0) {
    result.dateArrival = isoDates[0].replace(/\//g, '-');
    if (isoDates.length > 1) {
      result.dateDeparture = isoDates[1].replace(/\//g, '-');
    }
  }

  // Extract Prices / Balance
  const mxnMatch = text.match(/(?:mxn|pesos|\$)\s*(\d+(?:\.\d{2})?)\s*(?:a pagar|saldo|restante|pendiente)/i) || text.match(/(?:a pagar|saldo|pendiente)[:\s]*(?:\$|mxn)?\s*(\d+(?:\.\d{2})?)/i);
  if (mxnMatch && mxnMatch[1]) {
    result.toPayMxn = parseFloat(mxnMatch[1]);
  }

  const usdMatch = text.match(/(\d+(?:\.\d{2})?)\s*(?:usd|dolares|dólares)/i);
  if (usdMatch && usdMatch[1]) {
    result.toPayUsd = parseFloat(usdMatch[1]);
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
 * Executes autocomplete directly on the client side using @google/genai,
 * stripping markdown formatting, robustly parsing JSON, and falling back
 * safely to structured prompt parsing.
 */
export async function parseReservationText(text: string): Promise<Partial<Reservation>> {
  if (!text || !text.trim()) {
    throw new Error("No hay texto para procesar.");
  }

  const apiKey = getClientApiKey();
  const currentDate = new Date().toISOString().split("T")[0];

  // Try direct client-side Gemini AI call if an API key is available
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

      let responseText = response.text || "";

      // Clean and strip any markdown formatting (like ```json ... ```) from the Gemini response string
      let cleaned = responseText.replace(/```json|```/g, '').trim();

      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      if (cleaned) {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === 'object') {
          return normalizeReservationData(parsed);
        }
      }
    } catch (geminiError) {
      console.warn("Direct client Gemini call encountered an issue, trying structured parser fallback:", geminiError);
    }
  }

  // Fallback: safely structured prompt parsing without throwing unhandled JSON errors
  const fallbackData = safelyStructuredPromptParsing(text);
  if (Object.keys(fallbackData).length > 0) {
    return normalizeReservationData(fallbackData);
  }

  throw new Error("No se pudo procesar el texto con IA. Inténtalo de nuevo.");
}
