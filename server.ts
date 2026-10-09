import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// Driver status redirect endpoints:
// Short single-line links for driver service orders (/s/1/:code, /s/2/:code)
// Cleanly redirects to WhatsApp dispatch chat (529982127348) without multiline text or wa.me preview cards
app.get([
  "/s/:step/:code",
  "/s/:step",
  "/s",
  "/status/:code",
  "/status",
  "/estatus/:code",
  "/estatus"
], (req, res) => {
  const dispatchPhone = "529982127348";
  const stepParam = String(req.params.step || req.query.step || req.query.s || "1").toLowerCase();
  const codeParam = String(req.params.code || req.query.code || req.query.c || "QTC").trim();
  const paxParam = req.query.p || req.query.pax || "";

  const isCompleted = stepParam === "2" || stepParam === "completed" || stepParam === "finalizado";
  const statusLabel = isCompleted ? "SERVICIO FINALIZADO" : "CLIENTE A BORDO (En camino)";
  const statusIcon = isCompleted ? "✅" : "🟢";

  let reportText = `🚖 *REPORTE CHOFER - QUICK TRAVEL CANCÚN*\n📋 *Orden:* ${codeParam}\n`;
  if (paxParam) {
    reportText += `👤 *Pasajero:* ${decodeURIComponent(String(paxParam))}\n`;
  }
  reportText += `${statusIcon} *Estatus:* ${statusLabel}`;

  const targetWhatsAppUrl = `https://wa.me/${dispatchPhone}?text=${encodeURIComponent(reportText)}`;

  // For web crawlers / WhatsApp scrapers, return clean preview without wa.me branding
  const userAgent = req.headers["user-agent"] || "";
  if (/WhatsApp|facebookexternalhit|Facebot|Twitterbot/i.test(userAgent)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quick Travel Cancún</title>
  <meta property="og:title" content="Quick Travel Cancún - Control Operativo">
  <meta property="og:description" content="Reporte de Orden de Servicio">
</head>
<body>
  <p>Quick Travel Cancún</p>
</body>
</html>`);
  }

  // Direct 302 redirect opens WhatsApp natively with report pre-filled for Cabina
  return res.redirect(302, targetWhatsAppUrl);
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
