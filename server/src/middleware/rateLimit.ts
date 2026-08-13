import rateLimit, { MemoryStore } from "express-rate-limit";

// Butikerna hålls kvar så att testerna kan nollställa dem mellan fall. Utan det
// hade begränsningen antingen behövt stängas av under test — och därmed aldrig
// blivit provad — eller läckt räknare mellan orelaterade tester.
const authStore = new MemoryStore();
const mutationStore = new MemoryStore();
const readStore = new MemoryStore();

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: authStore,
});

export const mutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: mutationStore,
});

// De publika läs-endpointerna slår mot databasen utan inloggning. Taket är
// tilltaget så att vanligt surfande aldrig märker det, men en enskild besökare
// kan inte hamra API:et hur som helst. Trafiken kommer via Cloudflare och
// nginx skickar vidare CF-Connecting-IP, så räkningen sker per besökare.
export const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: readStore,
});

export function resetRateLimits(): void {
  authStore.resetAll?.();
  mutationStore.resetAll?.();
  readStore.resetAll?.();
}
