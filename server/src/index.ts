import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { startPresencePolling } from "./presencePoller.ts";
import { startValheimPolling } from "./valheimPoller.ts";
import { startDiscordPolling } from "./discordPoller.ts";

createApp().listen(config.port, () => {
  console.log(`bravas-api listening on :${config.port}`);
  // Startas här och inte i createApp: annars hade varje testfil som bygger en
  // app dragit igång en bakgrundstimer och anrop mot Steam/spelservern.
  startPresencePolling();
  startValheimPolling();
  // Hoppar över sig själv om DISCORD_SERVER_ID saknas.
  startDiscordPolling();
});
