export type Summary = {
  user: { id: string; username: string; usernameNormalized: string; isDemo?: boolean };
  wallet: { coins: number };
  equipment: { rod: string; ownedRods?: string[]; rpgWeapon: string };
  inventory: Record<string, { quantity: number; metadata: Record<string, unknown> }>;
  stats: {
    fishing: { catches: number; rareCatches: number; bestCatch: { name: string; value: number; rarity: string } | null };
    mines: { gamesPlayed: number; wins: number; losses: number; coinsWon: number };
    rpg: { characterName: string | null; level: number; xp: number };
  };
  activeHours: Record<string, number>;
};

export type BoardEntry = { rank: number; user: Summary['user']; value: number };

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `Request failed: ${res.status}` }));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export function hoursText(value: number) {
  return `${value.toFixed(2)}h`;
}
