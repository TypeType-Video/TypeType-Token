import { beforeAll, describe, expect, it, mock } from "bun:test";
import type { IntegrityTokenData } from "bgutils-js/shared-types";
import type { SessionTokenResult, TokenResult } from "../src/token-service.ts";

const VISITOR_DATA = "visitor-data-test-123";
const INTEGRITY_TOKEN = "integrity-token-test-xyz";
let currentVisitorData = VISITOR_DATA;

const mockExecuteBotGuard = mock(
	async (_script: string, _prog: string, _name: string, _eventId: string): Promise<string> =>
		"botguard-response-test",
);
const mockMintPoToken = mock(async (_token: string, id: string): Promise<string> => `pot-${id}`);
const mockResetBotGuardPage = mock(async (): Promise<void> => undefined);

mock.module("../src/botguard-page.ts", () => ({
	executeBotGuard: mockExecuteBotGuard,
	mintPoToken: mockMintPoToken,
	resetBotGuardPage: mockResetBotGuardPage,
}));

mock.module("../src/botguard-challenge.ts", () => ({
	fetchChallenge: mock(async (_visitorData: string) => ({
		interpreterScript: "/* noop */",
		program: "program-test",
		globalName: "vm_test",
		eventId: "event-test",
	})),
}));

mock.module("../src/innertube.ts", () => ({
	fetchVisitorData: mock(async (): Promise<string> => currentVisitorData),
	fetchIntegrityToken: mock(
		async (_response: string): Promise<IntegrityTokenData> => ({
			integrityToken: INTEGRITY_TOKEN,
			estimatedTtlSecs: 21600,
		}),
	),
}));

let fetchPoToken: (
	videoId: string,
	forceRefresh?: boolean,
	refreshVideo?: boolean,
) => Promise<TokenResult>;
let fetchSessionPoTokens: (
	videoId: string,
	sessionBinding: string,
	refreshVideo?: boolean,
) => Promise<SessionTokenResult>;

describe("fetchPoToken", () => {
	beforeAll(async () => {
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const module = await import("../src/token-service.ts?token-service-test");
		fetchPoToken = module.fetchPoToken;
		fetchSessionPoTokens = module.fetchSessionPoTokens;
	});

	it("does not call buildSession twice on concurrent requests", async () => {
		const [r1, r2] = await Promise.all([
			fetchPoToken("concurrent-1"),
			fetchPoToken("concurrent-2"),
		]);

		expect(r1.visitorData).toBe(VISITOR_DATA);
		expect(r2.visitorData).toBe(VISITOR_DATA);
		expect(r1.visitorBoundPoToken).toBe(`pot-${VISITOR_DATA}`);
		expect(r2.visitorBoundPoToken).toBe(`pot-${VISITOR_DATA}`);
		expect(r1.videoBoundPoToken).toBe("pot-concurrent-1");
		expect(r2.videoBoundPoToken).toBe("pot-concurrent-2");
		expect(r1.poToken).toBe(`pot-${VISITOR_DATA}`);
		expect(r2.poToken).toBe(`pot-${VISITOR_DATA}`);
		expect(r1.streamingPot).toBe("pot-concurrent-1");
		expect(r2.streamingPot).toBe("pot-concurrent-2");
		expect(mockExecuteBotGuard.mock.calls.length).toBe(1);
		expect(mockExecuteBotGuard).toHaveBeenCalledWith(
			"/* noop */",
			"program-test",
			"vm_test",
			"event-test",
		);
	});

	it("returns correct token structure on first call", async () => {
		const result = await fetchPoToken("video-id-1");

		expect(result.visitorData).toBe(VISITOR_DATA);
		expect(result.visitorBoundPoToken).toBe(`pot-${VISITOR_DATA}`);
		expect(result.videoBoundPoToken).toBe("pot-video-id-1");
		expect(result.poToken).toBe(`pot-${VISITOR_DATA}`);
		expect(result.streamingPot).toBe("pot-video-id-1");
		expect(mockExecuteBotGuard.mock.calls.length).toBe(1);
	});

	it("mints session and video tokens from one BotGuard session", async () => {
		const callsBefore = mockExecuteBotGuard.mock.calls.length;
		const result = await fetchSessionPoTokens("kids-video", "account-visitor");

		expect(result.visitorData).toBe(currentVisitorData);
		expect(result.videoBoundPoToken).toBe("pot-kids-video");
		expect(result.sessionBoundPoToken).toBe("pot-account-visitor");
		expect(mockExecuteBotGuard.mock.calls.length).toBe(callsBefore);
	});

	it("refreshes the video token without changing the session binding", async () => {
		const callsBefore = mockMintPoToken.mock.calls.length;
		const result = await fetchSessionPoTokens("kids-video", "account-visitor", true);

		expect(result.videoBoundPoToken).toBe("pot-kids-video");
		expect(result.sessionBoundPoToken).toBe("pot-account-visitor");
		expect(mockMintPoToken.mock.calls.length).toBe(callsBefore + 1);
	});

	it("uses cached session on subsequent calls without re-initializing", async () => {
		const callsBefore = mockExecuteBotGuard.mock.calls.length;

		await fetchPoToken("video-id-2");

		expect(mockExecuteBotGuard.mock.calls.length).toBe(callsBefore);
	});

	it("refreshes the BotGuard session when requested", async () => {
		const callsBefore = mockExecuteBotGuard.mock.calls.length;
		const refreshedVisitorData = `${VISITOR_DATA}-refresh`;
		currentVisitorData = refreshedVisitorData;

		const result = await fetchPoToken("video-id-refresh", true);

		expect(mockExecuteBotGuard.mock.calls.length).toBe(callsBefore + 1);
		expect(result.visitorData).toBe(refreshedVisitorData);
		expect(result.visitorBoundPoToken).toBe(`pot-${refreshedVisitorData}`);
		expect(result.videoBoundPoToken).toBe("pot-video-id-refresh");
	});

	it("mints a distinct videoBoundPoToken per videoId", async () => {
		const result1 = await fetchPoToken("video-alpha");
		const result2 = await fetchPoToken("video-beta");

		expect(result1.videoBoundPoToken).toBe("pot-video-alpha");
		expect(result2.videoBoundPoToken).toBe("pot-video-beta");
		expect(result1.videoBoundPoToken).not.toBe(result2.videoBoundPoToken);
		expect(result1.streamingPot).toBe("pot-video-alpha");
		expect(result2.streamingPot).toBe("pot-video-beta");
		expect(result1.streamingPot).not.toBe(result2.streamingPot);
	});

	it("reuses cached videoBoundPoToken for the same videoId", async () => {
		const callsBefore = mockMintPoToken.mock.calls.length;

		const result1 = await fetchPoToken("video-cache");
		const result2 = await fetchPoToken("video-cache");

		expect(result1.videoBoundPoToken).toBe("pot-video-cache");
		expect(result2.videoBoundPoToken).toBe("pot-video-cache");
		expect(mockMintPoToken.mock.calls.length).toBe(callsBefore + 1);
	});

	it("refreshes only the video-bound token when requested", async () => {
		const callsBefore = mockMintPoToken.mock.calls.length;
		const result = await fetchPoToken("video-cache", false, true);

		expect(result.visitorData).toBe(currentVisitorData);
		expect(result.visitorBoundPoToken).toBe(`pot-${currentVisitorData}`);
		expect(result.videoBoundPoToken).toBe("pot-video-cache");
		expect(mockMintPoToken.mock.calls.length).toBe(callsBefore + 1);
	});

	it("deduplicates concurrent videoBoundPoToken mints for the same videoId", async () => {
		const callsBefore = mockMintPoToken.mock.calls.length;

		const [result1, result2] = await Promise.all([
			fetchPoToken("video-concurrent-cache"),
			fetchPoToken("video-concurrent-cache"),
		]);

		expect(result1.videoBoundPoToken).toBe("pot-video-concurrent-cache");
		expect(result2.videoBoundPoToken).toBe("pot-video-concurrent-cache");
		expect(mockMintPoToken.mock.calls.length).toBe(callsBefore + 1);
	});

	it("preserves visitorData and visitorBoundPoToken across requests", async () => {
		const result = await fetchPoToken("video-id-3");

		expect(result.visitorData).toBe(currentVisitorData);
		expect(result.visitorBoundPoToken).toBe(`pot-${currentVisitorData}`);
		expect(result.poToken).toBe(`pot-${currentVisitorData}`);
	});
});
