import { doubleCsrf } from "csrf-csrf";
import { config } from "./config.ts";
import { cookieSecureFor, sessionCookie, verifySessionCookieValue } from "./session.ts";

// Double-submit cookie CSRF protection, bound to who the session belongs to so
// a token issued for one medlem can't be replayed against another.
//
// Bindningen går mot steamid:t, inte mot kakans värde: sessionen förnyas
// löpande, och ett nytt kakvärde skulle annars tyst ogiltigförklara ett token
// som frontenden redan hämtat — röstningen hade slutat fungera mitt i besöket
// utan att något syntes som fel.
export const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => config.sessionSecret,
  getSessionIdentifier: (req) => verifySessionCookieValue(req.cookies?.[sessionCookie.name]) ?? "",
  cookieName: "bvs_csrf",
  cookieOptions: {
    httpOnly: true,
    secure: cookieSecureFor(config.publicOrigin),
    sameSite: "lax",
    path: "/",
  },
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"],
});
