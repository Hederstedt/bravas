import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { doubleCsrfProtection } from "./csrf.ts";
import { errorHandler, requestLogger } from "./middleware/errors.ts";
import { authRouter } from "./routes/auth.ts";
import { membersRouter } from "./routes/members.ts";
import { presenceRouter } from "./routes/presence.ts";
import { quotesRouter } from "./routes/quotes.ts";
import { statsRouter } from "./routes/stats.ts";
import { configRouter } from "./routes/config.ts";
import { eventsRouter } from "./routes/events.ts";
import { managerRouter } from "./routes/manager.ts";
import { valheimRouter } from "./routes/valheim.ts";

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

  app.use("/api/auth", authRouter);
  app.use("/api/members", membersRouter);
  app.use("/api/presence", presenceRouter);
  app.use("/api/quotes", quotesRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/config", configRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/manager", managerRouter);
  app.use("/api/valheim", valheimRouter);

  // Sist: allt som kastat sig förbi routrarna landar här i stället för i
  // Express standardhanterare, som svarar med en HTML-sida och loggar utan
  // att berätta vilket anrop det gällde.
  app.use(errorHandler);

  return app;
}
