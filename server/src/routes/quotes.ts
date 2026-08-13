import { Router } from "express";
import { db } from "../db.ts";
import { mutationLimiter, readLimiter } from "../middleware/rateLimit.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { parseQuoteInput } from "../quotes.ts";

export const quotesRouter = Router();

interface QuoteRow {
  id: number;
  text: string;
  said_by: string;
  created_at: number;
  votes: number;
}

// Inskickare och röstande läggs medvetet inte med i svaret: väggen ska kunna
// läsas utan att det syns vem som tyckte vad.
function publicQuote(row: QuoteRow) {
  return {
    id: row.id,
    text: row.text,
    saidBy: row.said_by,
    createdAt: row.created_at,
    votes: row.votes,
  };
}

const LIST_SQL = `
  SELECT q.id, q.text, q.said_by, q.created_at,
         (SELECT COUNT(*) FROM quote_votes v WHERE v.quote_id = q.id) AS votes
  FROM quotes q
  ORDER BY votes DESC, q.created_at DESC
`;

quotesRouter.get("/", readLimiter, (_req, res) => {
  const rows = db.prepare(LIST_SQL).all() as QuoteRow[];
  res.json({ quotes: rows.map(publicQuote) });
});

quotesRouter.post("/", mutationLimiter, requireAuth, (req, res) => {
  const parsed = parseQuoteInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  // submitted_by kommer från sessionen, aldrig från anropet.
  const info = db
    .prepare("INSERT INTO quotes (text, said_by, submitted_by, created_at) VALUES (?, ?, ?, ?)")
    .run(parsed.value.text, parsed.value.saidBy, req.member!.steamid64, Date.now());

  res.status(201).json({
    id: Number(info.lastInsertRowid),
    text: parsed.value.text,
    saidBy: parsed.value.saidBy,
    votes: 0,
  });
});

// Express typar route-parametrar som string | string[]; en upprepad parameter
// är inget vi accepterar, och tomma strängar får inte bli Number("") === 0.
function quoteId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

quotesRouter.post("/:id/vote", mutationLimiter, requireAuth, (req, res) => {
  const id = quoteId(req.params.id);
  if (id === null) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const exists = db.prepare("SELECT 1 FROM quotes WHERE id = ?").get(id);
  if (!exists) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const steamid64 = req.member!.steamid64;
  const removed = db
    .prepare("DELETE FROM quote_votes WHERE quote_id = ? AND steamid64 = ?")
    .run(id, steamid64);

  // Samma anrop röstar och ångrar — knappen är en växel, inte en räknare som
  // kan skruvas upp genom att klicka igen.
  if (removed.changes === 0) {
    db.prepare("INSERT INTO quote_votes (quote_id, steamid64, created_at) VALUES (?, ?, ?)").run(
      id,
      steamid64,
      Date.now()
    );
  }

  const { votes } = db
    .prepare("SELECT COUNT(*) AS votes FROM quote_votes WHERE quote_id = ?")
    .get(id) as { votes: number };

  res.json({ id, votes, voted: removed.changes === 0 });
});

quotesRouter.delete("/:id", mutationLimiter, requireAuth, (req, res) => {
  const id = quoteId(req.params.id);
  if (id === null) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // Villkoret på submitted_by gör att någon annans citat är omöjligt att radera
  // och oskiljbart från ett som inte finns.
  const info = db
    .prepare("DELETE FROM quotes WHERE id = ? AND submitted_by = ?")
    .run(id, req.member!.steamid64);

  if (info.changes === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).end();
});
