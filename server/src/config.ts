import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  steamApiKey: required("STEAM_API_KEY"),
  sessionSecret: required("SESSION_SECRET"),
  discordServerId: process.env.DISCORD_SERVER_ID ?? "",
  discordInviteUrl: process.env.DISCORD_INVITE_URL ?? "",
  publicOrigin: process.env.PUBLIC_ORIGIN ?? "http://localhost:5173",
  port: Number(process.env.PORT ?? 3001),
  dbPath: process.env.DB_PATH ?? "./data/bravas.db",
};
