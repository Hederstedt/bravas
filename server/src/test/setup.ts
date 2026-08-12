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

process.on("exit", () => {
  rmSync(dir, { recursive: true, force: true });
});
