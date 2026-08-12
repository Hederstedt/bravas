import { doubleCsrf } from "csrf-csrf";
import { config } from "./config.ts";
import { sessionCookie } from "./session.ts";

// Double-submit cookie CSRF protection, bound to the existing session cookie's
// value so a token issued for one session can't be replayed against another.
export const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => config.sessionSecret,
  getSessionIdentifier: (req) => req.cookies?.[sessionCookie.name] ?? "",
  cookieName: "bvs_csrf",
  cookieOptions: {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  },
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"],
});
