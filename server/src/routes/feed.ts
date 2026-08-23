import { Router } from "express";
import { getFeed } from "../feedService.ts";
import { readLimiter } from "../middleware/rateLimit.ts";

export const feedRouter = Router();

// Publik som rostern, siffrorna och citatväggen: allt i loggboken går redan
// att läsa på sajten var för sig. Det nya är att det står i tidsordning.
feedRouter.get("/", readLimiter, (_req, res) => {
  res.json({ items: getFeed() });
});
