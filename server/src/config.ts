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

  // Frågeporten är spelporten + 1 (Steams query-protokoll), och servern frågas
  // lokalt på maskinen den kör på — inte via den publika adressen som gubbarna
  // ansluter till, se valheimAddress.
  valheimQueryHost: process.env.VALHEIM_QUERY_HOST ?? "127.0.0.1",
  valheimQueryPort: Number(process.env.VALHEIM_QUERY_PORT ?? 2457),
  valheimAddress: process.env.VALHEIM_ADDRESS ?? "",
  valheimServerName: process.env.VALHEIM_SERVER_NAME ?? "",
  valheimPassword: process.env.VALHEIM_PASSWORD ?? "",

  // Blizzard/Battle.net för World of Warcraft. Två delar, till skillnad från
  // Wargamings enda application_id: OAuth 2.0 kräver en klienthemlighet, och
  // den lämnar aldrig servern. Saknas de ligger WoW-länkningen vilande —
  // samma valfria mönster som discordServerId.
  blizzardClientId: process.env.BLIZZARD_CLIENT_ID ?? "",
  blizzardClientSecret: process.env.BLIZZARD_CLIENT_SECRET ?? "",

  // Regionen styr både API-värden och namnrymden. Gänget är svenskt, så eu är
  // rätt förval — men en klan som flyttar ska inte behöva en kodändring.
  blizzardRegion: process.env.BLIZZARD_REGION ?? "eu",

  // Utan den här är WoT-länkningen bara osynlig — precis som med
  // discordServerId, inget krav vid uppstart.
  wargamingApplicationId: process.env.WARGAMING_APPLICATION_ID ?? "",

  // Vilka steamid:n som får se och använda admin-sidan. I env, inte i
  // databasen: en felskrivning i en tabell ska aldrig kunna låsa ut gänget från
  // sin egen admin-sida. Saknad variabel betyder "ingen admin", inte kraschande
  // uppstart — samma valfria mönster som discordServerId.
  adminSteamIds: (process.env.ADMIN_STEAMIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
