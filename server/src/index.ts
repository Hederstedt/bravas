import express from "express";
import cookieParser from "cookie-parser";
import { config } from "./config.ts";
import { authRouter } from "./routes/auth.ts";
import { membersRouter } from "./routes/members.ts";
import { statsRouter } from "./routes/stats.ts";
import { configRouter } from "./routes/config.ts";

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/members", membersRouter);
app.use("/api/stats", statsRouter);
app.use("/api/config", configRouter);

app.listen(config.port, () => {
  console.log(`bravas-api listening on :${config.port}`);
});
