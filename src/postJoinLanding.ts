export const POST_JOIN_LANDING_KEY = 'noiou.post-join-landing.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PostJoinLanding {
  gameId: string;
  playerId: string;
}

export function storePostJoinLanding(storage: StorageLike, gameId: string, playerId: string): void {
  storage.setItem(POST_JOIN_LANDING_KEY, JSON.stringify({ gameId, playerId } satisfies PostJoinLanding));
}

export function consumePostJoinLanding(storage: StorageLike, gameId: string): string | null {
  const raw = storage.getItem(POST_JOIN_LANDING_KEY);
  if (!raw) return null;

  storage.removeItem(POST_JOIN_LANDING_KEY);
  try {
    const parsed = JSON.parse(raw) as Partial<PostJoinLanding>;
    if (parsed.gameId !== gameId || typeof parsed.playerId !== 'string' || !parsed.playerId) return null;
    return parsed.playerId;
  } catch {
    return null;
  }
}
