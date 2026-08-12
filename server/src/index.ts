import { createApp } from "./app.ts";
import { config } from "./config.ts";

createApp().listen(config.port, () => {
  console.log(`bravas-api listening on :${config.port}`);
});
