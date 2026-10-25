import { beforeAll, describe, expect, it, mock } from "bun:test";
import type { IntegrityTokenData } from "bgutils-js/shared-types";
import type { TokenResult } from "../src/token-service.ts";
import { type FakeBotGuardContext, fakeBotGuardModule } from "./botguard-context-fixtures.ts";

let markVisitorDataStarted: (() => void) | undefined;
const visitorDataStarted = new Promise<void>((resolve) => {
	markVisitorDataStarted = resolve;
});
let releaseVisitorData: (() => void) | undefined;
const visitorDataGate = new Promise<void>((resolve) => {
	releaseVisitorData = resolve;
});
const mockExecuteBotGuard = mock(async (): Promise<string> => "botguard-response");
let releaseRacingMint: (() => void) | undefined;
let markRacingMintStarted: (() => void) | undefined;
let releaseRefreshMint: (() => void) | undefined;
let markRefreshMintStarted: (() => void) | undefined;
let blockRefreshMint = false;
let refreshMintGeneration = 0;
const refreshEvents: string[] = [];
const mockMintPoToken = mock(async (_token: string, id: string): Promise<string> => {
	if (id === "refresh-video") {
		const generation = ++refreshMintGeneration;
		if (blockRefreshMint) {
			blockRefreshMint = false;
			markRefreshMintStarted?.();
			await new Promise<void>((resolve) => {
				releaseRefreshMint = resolve;
			});
		}
		return `pot-${id}-${generation}`;
	}
	if (id === "racing-video") {
		refreshEvents.push("mint-started");
		markRacingMintStarted?.();
		await new Promise<void>((resolve) => {
			releaseRacingMint = resolve;
		});
		refreshEvents.push("mint-finished");
	}
	return `pot-${id}`;
});
const openedContexts: FakeBotGuardContext[] = [];
let visitorDataRequests = 0;

mock.module("../src/botguard-page.ts", () =>
	fakeBotGuardModule(
		{
			execute: mockExecuteBotGuard,
			mint: mockMintPoToken,
			close: () => refreshEvents.push("page-close"),
		},
		openedContexts,
	),
);

mock.module("../src/botguard-challenge.ts", () => ({
	WEB_USER_AGENT: "web-agent",
	WEB_CLIENT_VERSION: "2.0",
	fetchChallenge: mock(async () => ({
		interpreterScript: "interpreter",
		program: "program",
		globalName: "trayride",
		eventId: "event-id",
	})),
}));

mock.module("../src/innertube.ts", () => ({
	fetchVisitorData: mock(async (): Promise<string> => {
		visitorDataRequests += 1;
		if (visitorDataRequests === 1) {
			markVisitorDataStarted?.();
			await visitorDataGate;
		}
		return "visitor-session";
	}),
	fetchIntegrityToken: mock(
		async (): Promise<IntegrityTokenData> => ({
			integrityToken: "integrity-token",
			estimatedTtlSecs: 60,
		}),
	),
}));

let fetchPoToken: (
	videoId: string,
	forceRefresh?: boolean,
	refreshVideo?: boolean,
) => Promise<TokenResult>;

describe("token refresh concurrency", () => {
	beforeAll(async () => {
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const module = await import("../src/token-service.ts?refresh-race-test");
		fetchPoToken = module.fetchPoToken;
	});

	it("joins a forced refresh to an active session refresh", async () => {
		const regular = fetchPoToken("regular-video");
		await visitorDataStarted;
		const forced = fetchPoToken("forced-video", true);
		releaseVisitorData?.();

		const [regularResult, forcedResult] = await Promise.all([regular, forced]);

		expect(regularResult.visitorData).toBe("visitor-session");
		expect(forcedResult.visitorData).toBe("visitor-session");
		expect(visitorDataRequests).toBe(1);
		expect(openedContexts.length).toBe(1);
		expect(mockExecuteBotGuard.mock.calls.length).toBe(1);
	});

	it("deduplicates concurrent video token refreshes", async () => {
		const initial = await fetchPoToken("refresh-video");
		const callsBefore = mockMintPoToken.mock.calls.length;
		const refreshMintStarted = new Promise<void>((resolve) => {
			markRefreshMintStarted = resolve;
		});
		blockRefreshMint = true;
		const firstRefresh = fetchPoToken("refresh-video", false, true);
		await refreshMintStarted;
		const joinedRefresh = fetchPoToken("refresh-video", false, true);
		releaseRefreshMint?.();
		const [firstResult, joinedResult] = await Promise.all([firstRefresh, joinedRefresh]);

		expect(mockMintPoToken.mock.calls.length).toBe(callsBefore + 1);
		expect(firstResult.videoBoundPoToken).toBe(joinedResult.videoBoundPoToken);
		expect(firstResult.videoBoundPoToken).not.toBe(initial.videoBoundPoToken);

		const sequentialResult = await fetchPoToken("refresh-video", false, true);
		expect(mockMintPoToken.mock.calls.length).toBe(callsBefore + 2);
		expect(sequentialResult.videoBoundPoToken).not.toBe(firstResult.videoBoundPoToken);
	});

	it("closes the previous BotGuard page only after its active mints finish", async () => {
		const racingMintStarted = new Promise<void>((resolve) => {
			markRacingMintStarted = resolve;
		});
		const eventsBefore = refreshEvents.length;
		const previousContext = openedContexts.at(-1);
		const activeMint = fetchPoToken("racing-video");
		await racingMintStarted;
		const forcedRefresh = fetchPoToken("forced-after-race", true);
		await forcedRefresh;
		expect(refreshEvents.slice(eventsBefore)).toEqual(["mint-started"]);
		expect(previousContext?.closed).toBe(false);

		releaseRacingMint?.();
		await activeMint;
		await Bun.sleep(0);

		expect(refreshEvents.slice(eventsBefore)).toEqual([
			"mint-started",
			"mint-finished",
			"page-close",
		]);
		expect(previousContext?.closed).toBe(true);
		expect(openedContexts.at(-1)?.closed).toBe(false);
	});

	it("bounds the video token cache", async () => {
		for (let index = 0; index <= 512; index += 1) {
			await fetchPoToken(`cache-limit-${index}`);
		}
		const callsBefore = mockMintPoToken.mock.calls.length;
		await fetchPoToken("cache-limit-0");
		expect(mockMintPoToken.mock.calls.length).toBe(callsBefore + 1);
	});
});
