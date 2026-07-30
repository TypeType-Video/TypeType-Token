import { describe, expect, it, mock } from "bun:test";
import type { RawCaptionTrack } from "../src/innertube.ts";
import type { SubtitleTrack } from "../src/subtitles.ts";
import type { TokenResult } from "../src/token-service.ts";
import type { YoutubePlayerDecodeResponse } from "../src/youtube-player-decoder.ts";
import type { YoutubeSabrSession } from "../src/youtube-sabr-session.ts";

const mockFetchPoToken = mock(
	async (videoId: string, _forceRefresh = false, _refreshVideo = false): Promise<TokenResult> => ({
		visitorData: "visitor-data",
		visitorBoundPoToken: "visitor-bound-token",
		videoBoundPoToken: `video-bound-${videoId}`,
		poToken: "visitor-bound-token",
		streamingPot: `video-bound-${videoId}`,
	}),
);
const mockFetchYoutubeSabrSession = mock(
	async (
		videoId: string,
		client = "MWEB",
		_reloadPlaybackParams?: string,
		_isolated = false,
	): Promise<YoutubeSabrSession> => ({
		videoId,
		client: client === "WEB" ? "WEB" : "MWEB",
		visitorData: "visitor-data",
		poToken: "visitor-bound-token",
		streamingPot: `video-bound-${videoId}`,
		serverAbrStreamingUrl: "https://example.test/sabr",
		rawServerAbrStreamingUrl: "https://example.test/raw-sabr",
		hlsManifestUrl: "https://example.test/live.m3u8",
		videoPlaybackUstreamerConfig: "ustreamer-config",
		durationMs: 1000,
		title: "Test video",
		metadata: {
			title: "Test video",
			author: "Test channel",
			channelId: "channel-id",
			channelAvatarUrl: "https://example.test/avatar.jpg",
			description: "",
			durationMs: 1000,
			viewCount: 1,
			thumbnailUrl: "https://example.test/thumb.jpg",
			tags: [],
			isLive: false,
			isLiveContent: false,
		},
		formats: [],
		adaptiveFormats: [],
	}),
);

mock.module("../src/token-service.ts", () => ({
	fetchPoToken: mockFetchPoToken,
}));

mock.module("../src/innertube.ts", () => ({
	fetchCaptionTracks: mock(async (_videoId: string): Promise<RawCaptionTrack[]> => []),
	fetchVisitorData: mock(async (): Promise<string> => "visitor-data"),
	fetchChallenge: mock(async () => ({})),
	fetchIntegrityToken: mock(async () => ({ integrityToken: "integrity-token" })),
}));

mock.module("../src/youtube-sabr-session.ts", () => ({
	fetchYoutubeSabrSession: mockFetchYoutubeSabrSession,
}));

mock.module("../src/youtube-player-decoder.ts", () => ({
	decodeYoutubePlayerBatch: mock(
		async (): Promise<YoutubePlayerDecodeResponse> => ({
			playerId: "player-id",
			signatureTimestamp: 12345,
			signatures: { abc: "cba" },
			throttlingParameters: { xyz: "zyx" },
		}),
	),
}));

describe("handler", () => {
	it("GET /health returns 200 with status ok", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(new Request("http://localhost:8081/health"));

		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string };
		expect(body).toEqual({ status: "ok" });
	});

	it("GET /version returns build metadata", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(new Request("http://localhost:8081/version"));

		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ service: "token", version: "1.2.4-dev" });
	});

	it("GET /potoken without videoId returns 400", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(new Request("http://localhost:8081/potoken"));

		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("videoId query parameter is required");
	});

	it("GET /potoken with videoId returns token result", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(new Request("http://localhost:8081/potoken?videoId=abc"));

		expect(res.status).toBe(200);
		const body = (await res.json()) as TokenResult;
		expect(body.visitorData).toBe("visitor-data");
		expect(body.visitorBoundPoToken).toBe("visitor-bound-token");
		expect(body.videoBoundPoToken).toBe("video-bound-abc");
		expect(body.poToken).toBe("visitor-bound-token");
		expect(body.streamingPot).toBe("video-bound-abc");
	});

	it("GET /potoken forwards refresh requests", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(
			new Request("http://localhost:8081/potoken?videoId=abc&refresh=true"),
		);

		expect(res.status).toBe(200);
		expect(mockFetchPoToken.mock.calls.at(-1)?.[1]).toBe(true);
	});

	it("GET /potoken forwards video refresh requests", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(
			new Request("http://localhost:8081/potoken?videoId=abc&refreshVideo=true"),
		);

		expect(res.status).toBe(200);
		expect(mockFetchPoToken.mock.calls.at(-1)?.[2]).toBe(true);
	});

	it("GET /subtitles without videoId returns 400", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(new Request("http://localhost:8081/subtitles"));

		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("videoId query parameter is required");
	});

	it("GET /subtitles with videoId returns array", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(new Request("http://localhost:8081/subtitles?videoId=abc"));

		expect(res.status).toBe(200);
		const body = (await res.json()) as SubtitleTrack[];
		expect(Array.isArray(body)).toBe(true);
	});

	it("GET /youtube/sabr/session without videoId returns 400", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(new Request("http://localhost:8081/youtube/sabr/session"));

		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("videoId query parameter is required");
	});

	it("GET /youtube/sabr/session rejects unsupported clients", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(
			new Request("http://localhost:8081/youtube/sabr/session?videoId=abc&client=ANDROID_VR"),
		);

		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("client must be WEB or MWEB");
	});

	it("GET /youtube/sabr/session returns SABR metadata", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(
			new Request("http://localhost:8081/youtube/sabr/session?videoId=abc"),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as YoutubeSabrSession;
		expect(body.videoId).toBe("abc");
		expect(body.client).toBe("MWEB");
		expect(body.serverAbrStreamingUrl).toBe("https://example.test/sabr");
		expect(body.hlsManifestUrl).toBe("https://example.test/live.m3u8");
		expect(body.videoPlaybackUstreamerConfig).toBe("ustreamer-config");
	});

	it("GET /youtube/sabr/session forwards isolated requests", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(
			new Request("http://localhost:8081/youtube/sabr/session?videoId=abc&isolated=true"),
		);

		expect(res.status).toBe(200);
		expect(mockFetchYoutubeSabrSession.mock.calls.at(-1)).toEqual(["abc", "MWEB", undefined, true]);
	});

	it("POST /youtube/sabr/session/reload keeps the token out of the URL", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(
			new Request("http://localhost:8081/youtube/sabr/session/reload", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					videoId: "abc",
					client: "MWEB",
					reloadPlaybackParams: "reload-secret",
				}),
			}),
		);

		expect(res.status).toBe(200);
		expect(mockFetchYoutubeSabrSession.mock.calls.at(-1)).toEqual(["abc", "MWEB", "reload-secret"]);
		expect(res.url).not.toContain("reload-secret");
	});

	it("POST /youtube/sabr/session/reload rejects a missing reload token", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(
			new Request("http://localhost:8081/youtube/sabr/session/reload", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ videoId: "abc" }),
			}),
		);

		expect(res.status).toBe(400);
	});

	it("POST /youtube/player/decoder returns player decode result", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(
			new Request("http://localhost:8081/youtube/player/decoder", {
				method: "POST",
				body: JSON.stringify({ signatures: ["abc"], throttlingParameters: ["xyz"] }),
			}),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as YoutubePlayerDecodeResponse;
		expect(body.playerId).toBe("player-id");
		expect(body.signatureTimestamp).toBe(12345);
		expect(body.signatures.abc).toBe("cba");
		expect(body.throttlingParameters.xyz).toBe("zyx");
	});

	it("unknown route returns 404", async () => {
		const { handler } = await import("../src/index.ts");
		const res = await handler(new Request("http://localhost:8081/unknown"));

		expect(res.status).toBe(404);
	});
});
