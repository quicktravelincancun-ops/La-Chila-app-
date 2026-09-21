import { GoogleGenAI } from '@google/genai';

/**
 * Limpia el texto eliminando delimitadores de formato Markdown como ```json y ```
 * y extrae la porción que contiene el objeto JSON.
 */
export function cleanJsonFromMarkdown(raw: string): string {
  if (!raw || typeof raw !== 'string') return '{}';
  let text = raw.trim();

  // Eliminar bloques de código markdown ```json ... ``` o ``` ... ```
  text = text.replace(/^```(?:json)?\s*/gi, '');
  text = text.replace(/\s*```$/gi, '');
  text = text.replace(/```(?:json)?/gi, '');
  text = text.replace(/```/g, '');

  // Aislar el contenido delimitado por llaves { y }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  return text.trim();
}

/**
 * Parsea un string que contiene JSON potencialmente envuelto en markdown.
 */
export function parseJsonSafely(raw: string): any {
  const cleaned = cleanJsonFromMarkdown(raw);
  return JSON.parse(cleaned);
}

/**
 * Procesa el texto de una reserva con Gemini AI.
 * Primero intenta llamar directamente al SDK de Gemini en el cliente si hay API key disponible.
 * Como alternativa, realiza una petición segura al backend verificando response.ok y Content-Type
 * para evitar procesar páginas de error HTML (previniendo SyntaxError: Unexpected token 'T').
 */
export async function parseReservationWithAI(inputText: string): Promise<any> {
  const trimmed = inputText.trim();
  if (!trimmed) {
    throw new Error('Por favor ingresa o pega el texto de la reserva para autocompletar.');
  }

  // Obtener API key disponible en el cliente
  const clientApiKey = 
    (typeof process !== 'undefined' && (process.env?.GEMINI_API_KEY || process.env?.API_KEY)) ||
    ((typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) as string) ||
    '';

  const systemInstruction = `Eres un asistente experto en logística de Quick Travel Cancún.
Analiza minuciosamente el siguiente texto de reserva (mensaje de WhatsApp, email o nota) y extrae todos los datos en un JSON válido.

Reglas para serviceType:
- "Llegada y Salida": Traslado redondo aeropuerto <-> hotel
- "Solo Llegada": Traslado aeropuerto -> hotel
- "Solo Salida": Traslado hotel -> aeropuerto
- "Solo Traslado": Entre hoteles o punto a punto
- "Tour o Excursión": Tours o parques (Xcaret, Chichén Itzá, Tulum, etc.)
- "Circuito": Itinerario de varios días

Campos a extraer (extrae todos los que aparezcan):
- name: Nombre completo del pasajero o titular
- serviceType: "Llegada y Salida" | "Solo Llegada" | "Solo Salida" | "Solo Traslado" | "Tour o Excursión" | "Circuito"
- transferSubtype: "Traslado Redondo" | "Traslado Sencillo" | "Traslado Múltiple"
- tourName: Nombre del tour o parque
- tourType: "Tour Compartido" | "Tour Privado"
- origin: Origen de recogida
- arrivalDestination: Hotel o destino de llegada
- peopleCountArrival: Número de personas en llegada (número)
- dateArrival: Fecha de llegada en formato YYYY-MM-DD
- arrivalTime: Hora de llegada en formato HH:MM
- flightNoArrival: Número de vuelo de llegada
- airlineArrival: Aerolínea
- originDeparture: Origen de salida o recogida
- departureDestination: Destino de salida
- peopleCountDeparture: Número de personas en salida (número)
- dateDeparture: Fecha de salida o tour en formato YYYY-MM-DD
- departureTimeHotel: Hora de recogida en hotel (Pick-up) en formato HH:MM
- departureTimeFlight: Hora de vuelo en formato HH:MM
- peopleCount: Número total de personas (número)
- depositMxn: Depósito en MXN (número)
- toPayMxn: Saldo pendiente en MXN (número)
- depositUsd: Depósito en USD (número)
- toPayUsd: Saldo pendiente en USD (número)
- roomNumber: Número de habitación
- observations: Notas u observaciones

Devuelve ÚNICAMENTE el objeto JSON sin texto introductorio ni markdown adicional.`;

  // Intento 1: Llamada directa con el SDK de Gemini si hay API key
  if (clientApiKey) {
    const modelsToTry = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash'];
    for (const modelName of modelsToTry) {
      try {
        const ai = new GoogleGenAI({ apiKey: clientApiKey });
        const config: any = {
          systemInstruction,
          responseMimeType: 'application/json',
        };
        if (modelName === 'gemini-3.8-flash') {
          config.thinkingConfig = { thinkingBudget: 0 };
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents: `Texto de la reserva a parsear:\n"""\n${trimmed}\n"""`,
          config,
        });

        if (response && response.text) {
          const parsed = parseJsonSafely(response.text);
          if (parsed && typeof parsed === 'object') {
            return parsed;
          }
        }
      } catch (sdkError: any) {
        console.warn(`Intento cliente con ${modelName} no completó:`, sdkError?.message || sdkError);
      }
    }
  }

  // Intento 2: Fallback al backend Express con verificación rigurosa para evitar HTML de error
  try {
    const response = await fetch('/api/parse-reservation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ text: trimmed }),
    });

    // Validar SIEMPRE response.ok y Content-Type ANTES de intentar .json()
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      const errorText = await response.text();
      console.warn('El servidor devolvió un código o contenido no JSON:', response.status, errorText.slice(0, 150));
      throw new Error(`El servidor devolvió un error (${response.status}). No se recibió una respuesta JSON válida.`);
    }

    const result = await response.json();
    if (!result || !result.success || !result.data) {
      throw new Error(result?.error || 'No se pudieron extraer datos de la respuesta del servidor.');
    }

    // Si data vino como string, limpiamos y parseamos
    if (typeof result.data === 'string') {
      return parseJsonSafely(result.data);
    }

    return result.data;
  } catch (backendError: any) {
    console.error('Error en llamada a backend para IA:', backendError);
    throw new Error(backendError?.message || 'Error al conectar con el servicio de IA.');
  }
}
