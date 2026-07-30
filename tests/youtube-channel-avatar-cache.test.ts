import { beforeEach, describe, expect, it } from "bun:test";
import {
	cacheYoutubeChannelAvatar,
	clearYoutubeChannelAvatarCache,
	getCachedYoutubeChannelAvatar,
} from "../src/youtube-channel-avatar-cache.ts";

describe("youtube channel avatar cache", () => {
	beforeEach(() => {
		clearYoutubeChannelAvatarCache();
	});

	it("stores non-empty avatar URLs by video", () => {
		cacheYoutubeChannelAvatar("video-one", "https://example.test/avatar.jpg");

		expect(getCachedYoutubeChannelAvatar("video-one")).toBe("https://example.test/avatar.jpg");
		expect(getCachedYoutubeChannelAvatar("video-two")).toBeNull();
	});

	it("does not cache empty URLs", () => {
		cacheYoutubeChannelAvatar("video-empty", "");

		expect(getCachedYoutubeChannelAvatar("video-empty")).toBeNull();
	});

	it("evicts the least recently used avatar at capacity", () => {
		for (let index = 0; index < 1024; index++) {
			cacheYoutubeChannelAvatar(`video-${index}`, `https://example.test/${index}.jpg`);
		}
		expect(getCachedYoutubeChannelAvatar("video-0")).toBe("https://example.test/0.jpg");

		cacheYoutubeChannelAvatar("video-new", "https://example.test/new.jpg");

		expect(getCachedYoutubeChannelAvatar("video-1")).toBeNull();
		expect(getCachedYoutubeChannelAvatar("video-0")).toBe("https://example.test/0.jpg");
		expect(getCachedYoutubeChannelAvatar("video-new")).toBe("https://example.test/new.jpg");
	});
});
