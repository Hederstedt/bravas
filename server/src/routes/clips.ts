import { Router } from "express";
import { parseClipInput } from "../clipUrl.ts";
import { db } from "../db.ts";
import { broadcast } from "../events.ts";
import { mutationLimiter, readLimiter } from "../middleware/rateLimit.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { sessionCookie, verifySessionCookieValue } from "../session.ts";

export const clipsRouter = Router();

interface ClipRow {
  id: number;
  provider: string;
  video_id: string;
  title: string;
  submitted_by: string;
  created_at: number;
  votes: number;
}

// Samma regel som citatväggen: den som lagt upp ett klipp visas aldrig. `mine`
// berättar bara för dig vilka som är dina, så raderingsknappen hamnar rätt.
function publicClip(row: ClipRow, steamid64: string | null) {
  return {
    id: row.id,
    provider: row.provider,
    videoId: row.video_id,
    title: row.title,
    createdAt: row.created_at,
    votes: row.votes,
    mine: steamid64 !== null && row.submitted_by === steamid64,
  };
}

const LIST_SQL = `
  SELECT c.id, c.provider, c.video_id, c.title, c.submitted_by, c.created_at,
         (SELECT COUNT(*) FROM clip_votes v WHERE v.clip_id = c.id) AS votes
  FROM clips c
  ORDER BY votes DESC, c.created_at DESC
`;

clipsRouter.get("/", readLimiter, (req, res) => {
  const steamid64 = verifySessionCookieValue(req.cookies?.[sessionCookie.name]);
  const rows = db.prepare(LIST_SQL).all() as ClipRow[];
  res.json({ clips: rows.map((row) => publicClip(row, steamid64)) });
});

clipsRouter.post("/", mutationLimiter, requireAuth, (req, res) => {
  const parsed = parseClipInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { provider, videoId, title } = parsed.value;

  // Unikhetskravet ligger i databasen, så kontrollen görs genom att låta den
  // säga ifrån i stället för genom en läsning som en annan skrivning hinner
  // förbi mellan raderna.
  const existing = db
    .prepare("SELECT 1 FROM clips WHERE provider = ? AND video_id = ?")
    .get(provider, videoId);
  if (existing) {
    res.status(409).json({ error: "already_added" });
    return;
  }

  // submitted_by kommer från sessionen, aldrig från anropet.
  const info = db
    .prepare(
      "INSERT INTO clips (provider, video_id, title, submitted_by, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(provider, videoId, title, req.member!.steamid64, Date.now());

  broadcast("clip", { reason: "added" });

  res.status(201).json({
    id: Number(info.lastInsertRowid),
    provider,
    videoId,
    title,
    createdAt: Date.now(),
    votes: 0,
    mine: true,
  });
});

// Express typar route-parametrar som string | string[]; en upprepad parameter
// är inget vi accepterar, och tomma strängar får inte bli Number("") === 0.
function clipId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

clipsRouter.post("/:id/vote", mutationLimiter, requireAuth, (req, res) => {
  const id = clipId(req.params.id);
  if (id === null) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const exists = db.prepare("SELECT 1 FROM clips WHERE id = ?").get(id);
  if (!exists) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const steamid64 = req.member!.steamid64;
  const removed = db
    .prepare("DELETE FROM clip_votes WHERE clip_id = ? AND steamid64 = ?")
    .run(id, steamid64);

  // Samma anrop röstar och ångrar — knappen är en växel, inte en räknare som
  // kan skruvas upp genom att klicka igen.
  if (removed.changes === 0) {
    db.prepare("INSERT INTO clip_votes (clip_id, steamid64, created_at) VALUES (?, ?, ?)").run(
      id,
      steamid64,
      Date.now()
    );
  }

  const { votes } = db
    .prepare("SELECT COUNT(*) AS votes FROM clip_votes WHERE clip_id = ?")
    .get(id) as { votes: number };

  broadcast("clip", { reason: "voted", id });

  res.json({ id, votes, voted: removed.changes === 0 });
});

clipsRouter.delete("/:id", mutationLimiter, requireAuth, (req, res) => {
  const id = clipId(req.params.id);
  if (id === null) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // Villkoret på submitted_by gör att någon annans klipp är omöjligt att
  // radera och oskiljbart från ett som inte finns. Rösterna följer med via
  // ON DELETE CASCADE.
  const info = db
    .prepare("DELETE FROM clips WHERE id = ? AND submitted_by = ?")
    .run(id, req.member!.steamid64);

  if (info.changes === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  broadcast("clip", { reason: "removed", id });
  res.status(204).end();
});
