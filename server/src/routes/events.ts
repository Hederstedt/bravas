import { Router } from "express";
import { subscribe } from "../events.ts";

export const eventsRouter = Router();

// Ingen readLimiter här: den räknar anrop per minut, och det här är ett enda
// anrop som lever i timmar. Taket sitter i stället på antalet samtidiga
// strömmar per besökare, inne i subscribe.
eventsRouter.get("/", (req, res) => {
  const unsubscribe = subscribe({
    ip: req.ip ?? "okänd",
    write: (chunk) => res.write(chunk),
  });

  if (!unsubscribe) {
    res.status(429).json({ error: "too_many_streams" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    // no-transform är lika viktigt som no-cache: utan det komprimerar
    // mellanliggande proxyer strömmen och buffrar den därmed.
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // nginx buffrar annars svaret tills det är färdigt — vilket det aldrig
    // blir. Det här är den vanligaste anledningen till att SSE "inte fungerar
    // i produktion".
    "X-Accel-Buffering": "no",
  });

  // Ett första meddelande direkt så att anslutningen räknas som etablerad hela
  // vägen genom kedjan i stället för att sitta och vänta på första händelsen.
  res.write(": ansluten\n\n");
  res.flushHeaders?.();

  req.on("close", unsubscribe);
});
