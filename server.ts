import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Lazy-initialized Gemini Client
let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("La clave GEMINI_API_KEY no está configurada en las variables de entorno o Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

const AI_RESERVATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Nombre del titular o pasajero principal" },
    serviceType: { type: Type.STRING, description: "Tipo de servicio: 'Llegada y Salida', 'Solo Llegada', 'Solo Salida', 'Solo Traslado', 'Tour o Excursión', 'Circuito'" },
    transferSubtype: { type: Type.STRING, description: "Subtipo si es traslado: 'Traslado Sencillo', 'Traslado Redondo', 'Traslado Múltiple'" },
    tourType: { type: Type.STRING, description: "Tipo si es tour: 'Tour Compartido', 'Tour Privado'" },
    tourName: { type: Type.STRING, description: "Nombre del tour o excursión" },
    observations: { type: Type.STRING, description: "Notas u observaciones generales" },
    origin: { type: Type.STRING, description: "Origen o punto de encuentro (Llegada)" },
    arrivalDestination: { type: Type.STRING, description: "Destino u hotel (Llegada)" },
    peopleCountArrival: { type: Type.NUMBER, description: "Número de pasajeros (Llegada)" },
    dateArrival: { type: Type.STRING, description: "Fecha de llegada en formato YYYY-MM-DD" },
    arrivalTime: { type: Type.STRING, description: "Hora de llegada en formato HH:MM" },
    flightNoArrival: { type: Type.STRING, description: "Número de vuelo de llegada" },
    airlineArrival: { type: Type.STRING, description: "Aerolínea de llegada" },
    originDeparture: { type: Type.STRING, description: "Origen o Pick-up (Salida/Tour/Traslado)" },
    departureDestination: { type: Type.STRING, description: "Destino (Salida/Traslado)" },
    peopleCountDeparture: { type: Type.NUMBER, description: "Número de pasajeros (Salida/Tour/Traslado)" },
    dateDeparture: { type: Type.STRING, description: "Fecha de salida o tour en formato YYYY-MM-DD" },
    departureTimeHotel: { type: Type.STRING, description: "Hora de pick-up en hotel en formato HH:MM" },
    departureTimeFlight: { type: Type.STRING, description: "Hora de vuelo de salida en formato HH:MM" },
    peopleCount: { type: Type.NUMBER, description: "Número total de pasajeros" },
    depositMxn: { type: Type.NUMBER, description: "Depósito en MXN" },
    toPayMxn: { type: Type.NUMBER, description: "A pagar en MXN" },
    depositUsd: { type: Type.NUMBER, description: "Depósito en USD" },
    toPayUsd: { type: Type.NUMBER, description: "A pagar en USD" },
    roomNumber: { type: Type.STRING, description: "Número de habitación" },
    unitType: { type: Type.STRING, description: "Tipo de unidad para circuito: '1 a 8 personas', '9 a 10 personas', '11 a 15 personas'" },
    includedThings: { type: Type.STRING, description: "Servicios incluidos en el circuito o tour" },
    notIncludedThings: { type: Type.STRING, description: "Servicios no incluidos" },
    circuitoLegs: {
      type: Type.ARRAY,
      description: "Lista de días o itinerario si es circuito",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "ID único aleatorio" },
          date: { type: Type.STRING, description: "Fecha del día en formato YYYY-MM-DD" },
          placesToVisit: { type: Type.STRING, description: "Puntos o destinos a visitar" },
          schedule: { type: Type.STRING, description: "Horario para el día" },
          entranceCosts: { type: Type.STRING, description: "Costos de entradas estimados" },
          pricePerDay: { type: Type.STRING, description: "Precio específico del día" },
          observations: { type: Type.STRING, description: "Notas u observaciones de este día" }
        }
      }
    }
  }
};

// API Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "quick-travel-cancun-api" });
});

// API endpoint for Gemini Auto-complete parsing
app.post("/api/parse-reservation", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ success: false, error: "El texto es obligatorio para autocompletar." });
    }

    const ai = getAi();
    const currentDate = new Date().toISOString().split("T")[0];
    const modelsToTry = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"];
    let responseText = "";
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        const config: any = {
          systemInstruction: `Eres un asistente experto en logística y reservas para Quick Travel Cancún.
Tu objetivo es analizar el texto suministrado (mensajes de WhatsApp, correos, notas de traslados o tours) y extraer rigurosamente todos los datos para rellenar un voucher de servicio en formato JSON.
Fecha de referencia actual del sistema: ${currentDate}.

Reglas de interpretación:
1. serviceType: Debe ser exactamente una de estas opciones:
   - "Llegada y Salida": Traslado redondo (aeropuerto -> hotel -> aeropuerto).
   - "Solo Llegada": Traslado aeropuerto -> hotel.
   - "Solo Salida": Traslado hotel -> aeropuerto.
   - "Solo Traslado": Traslado entre dos hoteles o traslados punto a punto.
   - "Tour o Excursión": Parques o excursiones (Xcaret, Chichén Itzá, Catamarán Isla Mujeres, Tulum, etc.).
   - "Circuito": Itinerario o tour de varios días.

2. Claves a extraer en el JSON (si están presentes en el texto):
   - name: Nombre completo del titular o pasajero principal
   - serviceType: "Llegada y Salida" | "Solo Llegada" | "Solo Salida" | "Solo Traslado" | "Tour o Excursión" | "Circuito"
   - transferSubtype: "Traslado Redondo" | "Traslado Sencillo" | "Traslado Múltiple"
   - tourName: Nombre del tour (ej: "Xcaret Plus", "Chichén Itzá", "Catamarán Isla Mujeres", etc.)
   - tourType: "Tour Compartido" | "Tour Privado"
   - peopleCount: Número total de personas (número entero)
   - peopleCountArrival: Número de personas en llegada
   - peopleCountDeparture: Número de personas en salida o tour
   - dateArrival: Fecha de llegada en formato YYYY-MM-DD (asume año 2026 si no se especifica)
   - arrivalTime: Hora de llegada de vuelo en formato 24h HH:MM
   - flightNoArrival: Número de vuelo de llegada (ej: AA1234, VB205, AM502)
   - airlineArrival: Nombre de la aerolínea
   - origin: Origen de llegada (por defecto "Aeropuerto Internacional de Cancún" o terminal indicada)
   - arrivalDestination: Hotel o destino de llegada
   - dateDeparture: Fecha de salida o realización del tour en formato YYYY-MM-DD
   - departureTimeHotel: Hora de recogida en hotel en formato HH:MM (Pick-up)
   - departureTimeFlight: Hora de vuelo de salida en formato HH:MM
   - originDeparture: Hotel o punto donde se recoge para la salida, tour o traslado
   - departureDestination: Destino de salida (por defecto "Aeropuerto Internacional de Cancún")
   - roomNumber: Número de habitación del hotel si se menciona
   - depositMxn: Monto de anticipo o depósito en pesos mexicanos (número)
   - toPayMxn: Monto pendiente o saldo a pagar en pesos mexicanos (número)
   - depositUsd: Anticipo en dólares (número)
   - toPayUsd: Saldo a pagar en dólares (número)
   - observations: Notas u observaciones adicionales (equipaje, silla de bebé, etc.)

IMPORTANTE: Extrae SIEMPRE todos los campos que aparezcan en el texto (personas, hotel, fechas, habitación, precios). Devuelve única y exclusivamente el JSON válido.`,
          responseMimeType: "application/json",
        };

        if (modelName === "gemini-3.8-flash") {
          config.thinkingConfig = { thinkingBudget: 0 };
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents: `Texto del mensaje o reservación:\n"""\n${text.trim()}\n"""`,
          config,
        });

        if (response.text) {
          responseText = response.text;
          break; // Succeeded!
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Attempt with ${modelName} failed, trying fallback:`, err?.message || err);
      }
    }

    if (!responseText) {
      throw lastError || new Error("No se pudo obtener respuesta de los modelos de IA.");
    }

    let cleanText = responseText.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```(?:json)?\s*/i, "");
      cleanText = cleanText.replace(/\s*```$/, "");
      cleanText = cleanText.trim();
    }
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }
    const parsedData = JSON.parse(cleanText);

    // Normalization logic for maximum consistency
    if (parsedData.serviceType === "Tour o Excursión" || parsedData.serviceType === "Solo Salida") {
      if (parsedData.origin && !parsedData.originDeparture) {
        parsedData.originDeparture = parsedData.origin;
      }
      if (parsedData.dateArrival && !parsedData.dateDeparture) {
        parsedData.dateDeparture = parsedData.dateArrival;
      }
    }

    if (parsedData.serviceType === "Llegada y Salida") {
      if (parsedData.arrivalDestination && !parsedData.originDeparture) {
        parsedData.originDeparture = parsedData.arrivalDestination;
      }
      if (!parsedData.transferSubtype) {
        parsedData.transferSubtype = "Traslado Redondo";
      }
    }

    if (parsedData.name) {
      if (!parsedData.arrivalName) parsedData.arrivalName = parsedData.name;
      if (!parsedData.departureName) parsedData.departureName = parsedData.name;
    }

    if (parsedData.peopleCount !== undefined && parsedData.peopleCount !== null) {
      const pCount = Number(parsedData.peopleCount) || 1;
      parsedData.peopleCount = pCount;
      if (!parsedData.peopleCountArrival) parsedData.peopleCountArrival = pCount;
      if (!parsedData.peopleCountDeparture) parsedData.peopleCountDeparture = pCount;
    }

    // Number conversions for financial fields
    if (parsedData.depositMxn !== undefined) parsedData.depositMxn = Number(parsedData.depositMxn) || 0;
    if (parsedData.toPayMxn !== undefined) parsedData.toPayMxn = Number(parsedData.toPayMxn) || 0;
    if (parsedData.depositUsd !== undefined) parsedData.depositUsd = Number(parsedData.depositUsd) || 0;
    if (parsedData.toPayUsd !== undefined) parsedData.toPayUsd = Number(parsedData.toPayUsd) || 0;

    return res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error al procesar reserva con Gemini:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Ocurrió un error al procesar el texto con IA.",
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
  });
}

startServer();
