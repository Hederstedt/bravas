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
// Samma resonemang som sessionCookie i session.ts: en enda källa för kakans
// inställningar, så att utloggningen rensar den med exakt de flaggor den sattes
// med. Rensas den med andra flaggor läggs en ny kaka bredvid den gamla.
export const csrfCookie = {
  name: "bvs_csrf",
  options: {
    httpOnly: true,
    secure: cookieSecureFor(config.publicOrigin),
    sameSite: "lax" as const,
    path: "/",
  },
};

export const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => config.sessionSecret,
  getSessionIdentifier: (req) => verifySessionCookieValue(req.cookies?.[sessionCookie.name]) ?? "",
  cookieName: csrfCookie.name,
  cookieOptions: csrfCookie.options,
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"],
});
