import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "bravas-test-"));

process.env.STEAM_API_KEY = "test-steam-key";
process.env.SESSION_SECRET = "test-session-secret";
process.env.DISCORD_SERVER_ID = "323523542312419348";
process.env.DISCORD_INVITE_URL = "https://discord.gg/testinvite";
process.env.PUBLIC_ORIGIN = "https://bravas.test";
process.env.DB_PATH = join(dir, "test.db");
process.env.WARGAMING_APPLICATION_ID = "test-wargaming-id";
// En enda admin i testerna, och medvetet ingen av gubbarna i app.test.ts — så
// att "är medlem" och "är admin" aldrig råkar bli samma sak i ett test.
process.env.ADMIN_STEAMIDS = "76561190000000009";

process.on("exit", () => {
  rmSync(dir, { recursive: true, force: true });
});
