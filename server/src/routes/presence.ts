import { Router } from "express";
import { listMembers } from "../db.ts";
import { readLimiter } from "../middleware/rateLimit.ts";
import { currentPresence, publicPresence, refreshPresence } from "../presencePoller.ts";

export const presenceRouter = Router();

// Numera bara en avläsning av pollerns ögonblicksbild. Tidigare utlöste varje
// sidladdning ett eget anrop mot Steam; nu frågar pollern en gång och alla
// besökare läser samma svar.
//
// Endpointen finns kvar även med händelseströmmen på plats: den är det första
// som hämtas vid sidladdning, och reservvägen när EventSource inte går att
// öppna.
presenceRouter.get("/", readLimiter, async (_req, res) => {
  if (listMembers().length === 0) {
    res.json({ presence: {} });
    return;
  }

  // Kallstart: första besökaren efter en omstart hinner före pollerns första
  // varv och ska inte mötas av en tom roster.
  if (Object.keys(currentPresence()).length === 0) await refreshPresence();

  res.json({ presence: publicPresence() });
});
