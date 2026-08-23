import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { doubleCsrfProtection } from "./csrf.ts";
import { errorHandler, requestLogger } from "./middleware/errors.ts";
import { adminRouter } from "./routes/admin.ts";
import { authRouter } from "./routes/auth.ts";
import { membersRouter } from "./routes/members.ts";
import { presenceRouter } from "./routes/presence.ts";
import { quotesRouter } from "./routes/quotes.ts";
import { statsRouter } from "./routes/stats.ts";
import { clipsRouter } from "./routes/clips.ts";
import { configRouter } from "./routes/config.ts";
import { eventsRouter } from "./routes/events.ts";
import { feedRouter } from "./routes/feed.ts";
import { managerRouter } from "./routes/manager.ts";
import { valheimRouter } from "./routes/valheim.ts";
import { discordRouter } from "./routes/discord.ts";

// Monteringstabellen är exporterad med flit. csrfCoverage.test.ts läser den
// och går igenom varje routers egna rutter, i stället för att upprepa en
// handskriven lista som glöms bort dagen någon lägger till en endpoint — och
// det är den genomgången som är beviset för att CSRF-skyddet sitter, sedan
// CodeQL:s js/missing-token-validation stängts av (den modellerar deprecerade
// csurf och kan inte känna igen csrf-csrf; se .github/codeql/codeql-config.yml).
//
// Express 5 lämnar inte ut monteringsprefixet ur sina lager, så prefixet måste
// stå någonstans båda kan läsa. Här.
export const API_ROUTERS = [
  ["/api/auth", authRouter],
  ["/api/admin", adminRouter],
  ["/api/members", membersRouter],
  ["/api/presence", presenceRouter],
  ["/api/quotes", quotesRouter],
  ["/api/stats", statsRouter],
  ["/api/clips", clipsRouter],
  ["/api/config", configRouter],
  ["/api/events", eventsRouter],
  ["/api/feed", feedRouter],
  ["/api/manager", managerRouter],
  ["/api/valheim", valheimRouter],
  ["/api/discord", discordRouter],
] as const;

export function createApp(): Express {
  const app = express();

  // cloudflared -> nginx -> here, so req.ip must come from the forwarding
  // headers; without this every visitor shares one rate-limit bucket.
  app.set("trust proxy", 1);

  app.use(requestLogger);
  app.use(express.json());
  app.use(cookieParser());
  app.use(doubleCsrfProtection);

  // Lever processen men databasen är låst eller Steam-nyckeln utgången syns
  // inget i systemd — Restart=on-failure fångar bara krasch.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, uptime: Math.round(process.uptime()) });
  });

  for (const [path, router] of API_ROUTERS) app.use(path, router);

  // Sist: allt som kastat sig förbi routrarna landar här i stället för i
  // Express standardhanterare, som svarar med en HTML-sida och loggar utan
  // att berätta vilket anrop det gällde.
  app.use(errorHandler);

  return app;
}
