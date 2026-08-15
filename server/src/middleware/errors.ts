import type { ErrorRequestHandler, RequestHandler } from "express";

// Servern loggade tidigare exakt en rad under hela sin livstid — startraden.
// Ett fel gick rakt till Express standardhanterare, som skriver en stacktrace
// utan att berätta vilket anrop som orsakade den. Det gjorde driftfel omöjliga
// att härleda i journald.

function line(status: number, method: string, path: string, ms: number): string {
  return `${status} ${method} ${path} ${Math.round(ms)}ms`;
}

// Bara det som är värt att läsa i en logg: fel och långsamma svar. En rad per
// bildhämtning hade dränkt signalen — det här är en klanserver, inte ett
// analysverktyg.
const SLOW_MS = 1000;

export const requestLogger: RequestHandler = (req, res, next) => {
  const started = performance.now();
  res.on("finish", () => {
    const ms = performance.now() - started;
    if (res.statusCode >= 500 || ms >= SLOW_MS) {
      console.warn(line(res.statusCode, req.method, req.path, ms));
    }
  });
  next();
};

// Fel som bär en egen statuskod är avsiktliga svar, inte haverier. CSRF-skyddet
// kastar till exempel 403 för ett saknat token — den koden måste tas vidare,
// annars blir varje avvisat anrop ett "internt fel" och skyddet ser trasigt ut.
function statusOf(err: unknown): number {
  const code = (err as { statusCode?: unknown; status?: unknown })?.statusCode ?? (err as { status?: unknown })?.status;
  return typeof code === "number" && code >= 400 && code <= 599 ? code : 500;
}

// Sist i kedjan. Loggar med anropets sammanhang och svarar med samma
// JSON-form som resten av API:et, så att klienten aldrig får en HTML-sida
// där den väntar sig ett objekt.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = statusOf(err);

  // Bara riktiga haverier förtjänar en stacktrace. Ett avvisat anrop är
  // vardagsmat och ska inte fylla loggen med brus.
  if (status >= 500) {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error(`${status} ${req.method} ${req.path}\n${detail}`);
  }

  if (res.headersSent) return;
  res.status(status).json({
    error: status === 403 ? "forbidden" : status >= 500 ? "internal_error" : "bad_request",
  });
};
