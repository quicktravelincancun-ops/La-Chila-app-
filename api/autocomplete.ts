import { extractReservationFieldsWithRegex } from '../geminiService';
import { GoogleGenAI } from '@google/genai';

type VercelRequest = any;
type VercelResponse = any;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const text = body?.text;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(200).json({
        success: false,
        error: 'El texto es requerido para autocompletar.'
      });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    // Try Gemini if API key is present in Vercel environment
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const currentDate = new Date().toISOString().split('T')[0];
        const systemPrompt = `Eres un asistente experto en logística para Quick Travel Cancún. Extrae todos los datos relevantes del texto en JSON válido. Fecha actual: ${currentDate}.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `${systemPrompt}\n\nTexto:\n"""\n${text.trim()}\n"""`,
          config: {
            responseMimeType: 'application/json',
          },
        });

        let cleaned = (response.text || '').replace(/```json|```/g, '').trim();
        const first = cleaned.indexOf('{');
        const last = cleaned.lastIndexOf('}');
        if (first !== -1 && last !== -1 && last > first) {
          cleaned = cleaned.substring(first, last + 1);
        }
        if (cleaned) {
          const parsed = JSON.parse(cleaned);
          if (parsed && typeof parsed === 'object') {
            return res.status(200).json({ success: true, data: parsed });
          }
        }
      } catch (geminiErr) {
        console.warn('Vercel Gemini error, falling back to regex:', geminiErr);
      }
    }

    // High-precision regex fallback
    const extracted = extractReservationFieldsWithRegex(text);
    return res.status(200).json({
      success: true,
      data: extracted
    });
  } catch (err: any) {
    console.error('Error in Vercel /api/autocomplete:', err);
    return res.status(200).json({
      success: false,
      error: 'No se pudo procesar el texto.'
    });
  }
}
