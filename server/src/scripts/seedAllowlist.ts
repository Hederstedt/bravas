import { db } from "../db.ts";
import { allowlistSeed } from "../data/allowlistSeed.ts";

const insert = db.prepare(
  "INSERT OR IGNORE INTO allowlist (steamid64, note, added_at) VALUES (?, ?, ?)"
);

const now = Date.now();
let added = 0;
for (const entry of allowlistSeed) {
  const result = insert.run(entry.steamid64, entry.note, now);
  if (result.changes > 0) added++;
}

console.log(`Allowlist seed: ${added} new, ${allowlistSeed.length - added} already present.`);
