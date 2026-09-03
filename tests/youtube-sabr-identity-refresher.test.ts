import { describe, expect, test } from "bun:test";
import type { TokenResult } from "../src/token-service.ts";
import { YoutubeSabrIdentityRefresher } from "../src/youtube-sabr-identity-refresher.ts";

describe("YouTube SABR identity refresh", () => {
	test("invalidates a rejected identity before requesting a fresh session", async () => {
		const events: string[] = [];
		const tokens = {
			visitorData: "new-visitor",
			visitorBoundPoToken: "new-player-token",
			videoBoundPoToken: "new-media-token",
			poToken: "new-player-token",
			streamingPot: "new-media-token",
		} satisfies TokenResult;
		const refresher = new YoutubeSabrIdentityRefresher<string>({
			refreshTokens: async (videoId) => {
				events.push(`refresh:${videoId}`);
				return tokens;
			},
			getSession: async (client, visitorData) => {
				events.push(`open:${client}:${visitorData}`);
				return "new-session";
			},
			invalidateSession: async (client, visitorData, session) => {
				events.push(`invalidate:${client}:${visitorData}:${session}`);
			},
		});

		expect(await refresher.refresh("video-id", "MWEB", "old-visitor", "old-session")).toEqual({
			tokens,
			session: "new-session",
		});
		expect(events).toEqual([
			"invalidate:MWEB:old-visitor:old-session",
			"refresh:video-id",
			"open:MWEB:new-visitor",
		]);
	});
});
