import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { doubleCsrfProtection } from "./csrf.ts";
import { authRouter } from "./routes/auth.ts";
import { membersRouter } from "./routes/members.ts";
import { statsRouter } from "./routes/stats.ts";
import { configRouter } from "./routes/config.ts";

export function createApp(): Express {
  const app = express();

  // cloudflared -> nginx -> here, so req.ip must come from the forwarding
  // headers; without this every visitor shares one rate-limit bucket.
  app.set("trust proxy", 1);

  app.use(express.json());
  app.use(cookieParser());
  app.use(doubleCsrfProtection);

  app.use("/api/auth", authRouter);
  app.use("/api/members", membersRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/config", configRouter);

  return app;
}
