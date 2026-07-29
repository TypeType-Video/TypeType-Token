type CachedAvatar = {
	url: string;
	expiresAt: number;
};

const AVATAR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_AVATAR_CACHE_ENTRIES = 1024;
const avatarCache = new Map<string, CachedAvatar>();

export function getCachedYoutubeChannelAvatar(videoId: string): string | null {
	const cached = avatarCache.get(videoId);
	if (!cached) return null;
	if (cached.expiresAt <= Date.now()) {
		avatarCache.delete(videoId);
		return null;
	}
	avatarCache.delete(videoId);
	avatarCache.set(videoId, cached);
	return cached.url;
}

export function cacheYoutubeChannelAvatar(videoId: string, url: string): void {
	if (!url) return;
	avatarCache.delete(videoId);
	while (avatarCache.size >= MAX_AVATAR_CACHE_ENTRIES) {
		const oldestVideoId = avatarCache.keys().next().value;
		if (oldestVideoId === undefined) break;
		avatarCache.delete(oldestVideoId);
	}
	avatarCache.set(videoId, { url, expiresAt: Date.now() + AVATAR_CACHE_TTL_MS });
}

export function clearYoutubeChannelAvatarCache(): void {
	avatarCache.clear();
}
