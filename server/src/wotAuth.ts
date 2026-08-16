import { config } from "./config.ts";

// Samma OpenID 2.0-protokoll som Steam, bara en annan leverantör — Wargamings
// egen inloggningswrapper sköter själva OpenID-utväxlingen mot eu.wargaming.net
// och skickar oss tillbaka ett account_id + access_token direkt, utan att vi
// behöver bygga openid.*-parametrarna för hand som i steamAuth.ts.
const WOT_HOST = "api.worldoftanks.eu";

export function buildLoginRedirectUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    application_id: config.wargamingApplicationId,
    redirect_uri: redirectUri,
    display: "page",
  });
  return `https://${WOT_HOST}/wot/auth/login/?${params.toString()}`;
}

export interface WotCallbackResult {
  accountId: string;
  nickname: string;
}

// Redirectens querysträng är inte i sig ett bevis — vem som helst kan gissa
// ett account_id och anropa vår callback-URL direkt. Beviset är att
// access_token faktiskt öppnar det kontot hos Wargaming, så den kollen görs
// alltid innan något litas på.
export async function verifyCallback(query: Record<string, string>): Promise<WotCallbackResult | null> {
  if (query.status !== "ok") return null;
  const accountId = query.account_id;
  const accessToken = query.access_token;
  if (!accountId || !accessToken) return null;

  const url = new URL(`https://${WOT_HOST}/wot/account/info/`);
  url.searchParams.set("application_id", config.wargamingApplicationId);
  url.searchParams.set("account_id", accountId);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", "account_id,nickname");

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: string;
    data?: Record<string, { account_id: number; nickname: string } | null>;
  };
  if (data.status !== "ok") return null;

  const info = data.data?.[accountId];
  if (!info || String(info.account_id) !== accountId) return null;

  return { accountId, nickname: info.nickname };
}
