import { apiHost, appToken, profileNamespace } from "./wowAuth.ts";

// Karaktärens publika data. Läses med en apptoken och inte med gubbens egen
// OAuth-token: den senare lever 24 timmar och hade krävt att vi lagrade och
// förnyade någons personliga token. Apptokenen är vår egen, och profilen är
// ändå publik — inloggningen behövdes bara för att bevisa vem som äger vad.

export interface WowCharacterStats {
  name: string;
  realmSlug: string;
  level: number;
  achievementPoints: number;
  equippedItemLevel: number;
  // Sparas för att kunna visa "senast sedd" och för att upptäcka en main som
  // bytts ut. Millisekunder, som allt annat i kodbasen.
  lastLogin: number;
}

interface CharacterProfileResponse {
  name?: string;
  level?: number;
  achievement_points?: number;
  equipped_item_level?: number;
  average_item_level?: number;
  last_login_timestamp?: number;
  realm?: { slug?: string };
}

// Namnet i adressen måste vara gemener — Blizzard svarar 404 på "Bravasdruid"
// men 200 på "bravasdruid", och felet ser ut som en borttagen karaktär.
export function characterPath(realmSlug: string, name: string): string {
  return `/profile/wow/character/${encodeURIComponent(realmSlug.toLowerCase())}/${encodeURIComponent(name.toLowerCase())}`;
}

export async function fetchCharacter(
  realmSlug: string,
  name: string,
  token?: string
): Promise<WowCharacterStats | null> {
  const bearer = token ?? (await appToken());
  if (!bearer) return null;

  const url = new URL(`${apiHost()}${characterPath(realmSlug, name)}`);
  url.searchParams.set("namespace", profileNamespace());

  const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
  // 404 betyder oftast omdöpt, flyttad eller raderad karaktär — ett giltigt
  // läge, inte ett fel. Kortet tappar sina WoW-attribut tills gubben länkar om.
  if (!res.ok) return null;

  const data = (await res.json()) as CharacterProfileResponse;
  if (!data.name) return null;

  return {
    name: data.name,
    realmSlug: data.realm?.slug ?? realmSlug,
    level: data.level ?? 0,
    achievementPoints: data.achievement_points ?? 0,
    // equipped är vad han faktiskt bär; average räknar in bankade föremål och
    // smickrar därför den som råkat få en bra bit han inte använder.
    equippedItemLevel: data.equipped_item_level ?? data.average_item_level ?? 0,
    lastLogin: data.last_login_timestamp ?? 0,
  };
}

export interface WowMemberStats {
  steamid64: string;
  stats: WowCharacterStats;
}
