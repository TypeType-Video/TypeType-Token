import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import type { IntegrityTokenData } from "bgutils-js/shared-types";
import type { TokenResult } from "../src/token-service.ts";
import type { TvPoToken } from "../src/tv-po-token.ts";
import { sharedChromium as chromium } from "./botguard-browser-fixtures.ts";

const originalFetch = globalThis.fetch;
let releaseTvIntegrityToken: (() => void) | undefined;
let markTvIntegrityTokenRequested: (() => void) | undefined;
let webVisitor = 0;

mock.module("playwright", () => ({ chromium }));
mock.module("../src/botguard-challenge.ts", () => ({
	WEB_USER_AGENT: "web-agent",
	WEB_CLIENT_VERSION: "2.0",
	fetchChallenge: async () => ({
		interpreterScript: "s",
		program: "p",
		globalName: "g",
		eventId: "e",
	}),
}));
mock.module("../src/innertube.ts", () => ({
	fetchVisitorData: async (): Promise<string> => `web-visitor-${++webVisitor}`,
	fetchIntegrityToken: async (): Promise<IntegrityTokenData> => ({
		integrityToken: "web-integrity",
		estimatedTtlSecs: 21600,
	}),
}));

async function tvResponse(url: string): Promise<Response> {
	if (url.includes("/GenerateIT")) {
		markTvIntegrityTokenRequested?.();
		await new Promise<void>((resolve) => {
			releaseTvIntegrityToken = resolve;
		});
		return Response.json({ integrityToken: "tv-integrity" });
	}
	if (url.includes("/Create")) {
		return Response.json({
			challenge: {
				program: "p",
				globalName: "g",
				interpreterJavascript: { privateDoNotAccessOrElseSafeScriptWrappedValue: "s" },
			},
		});
	}
	if (url.includes("tv_config")) return new Response('{"challengeRequestKey":"request-key"}');
	if (url.endsWith("/tv")) {
		return new Response(
			'{"EVENT_ID":"tv-event","LIVING_ROOM_PO_TOKEN_ID":"living-room","visitorData":"tv-visitor"}',
		);
	}
	return new Response('{"EVENT_ID":"home-event"}');
}

let fetchPoToken: (videoId: string, forceRefresh?: boolean) => Promise<TokenResult>;
let mintTvToken: () => Promise<TvPoToken>;

describe("BotGuard page isolation", () => {
	beforeAll(async () => {
		globalThis.fetch = (async (input: RequestInfo | URL) =>
			tvResponse(String(input))) as unknown as typeof fetch;
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const fetchModule = await import("../src/youtube-fetch.ts?botguard-isolation-test");
		mock.module("../src/youtube-fetch.ts", () => fetchModule);
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const pageModule = await import("../src/botguard-page.ts?botguard-isolation-test");
		mock.module("../src/botguard-page.ts", () => pageModule);
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const tokenModule = await import("../src/token-service.ts?botguard-isolation-test");
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const tvModule = await import("../src/tv-po-token.ts?botguard-isolation-test");
		fetchPoToken = tokenModule.fetchPoToken;
		const minter = new tvModule.TvPoTokenMinter();
		mintTvToken = () => minter.get();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	it("keeps an in-flight TV mint alive while the WEB session refreshes", async () => {
		const pagesBefore = chromium.allPages();
		const first = await fetchPoToken("web-video");
		const tvIntegrityTokenRequested = new Promise<void>((resolve) => {
			markTvIntegrityTokenRequested = resolve;
		});
		const tvToken = mintTvToken();
		await tvIntegrityTokenRequested;

		const refreshed = await fetchPoToken("web-video", true);
		releaseTvIntegrityToken?.();

		expect(refreshed.visitorData).not.toBe(first.visitorData);
		expect((await tvToken).poToken).toBe("pot-living-room");
		const tvPages = chromium
			.allPages()
			.filter((page) => page.userAgent !== "web-agent" && !pagesBefore.includes(page));
		expect(tvPages.length).toBe(1);
		expect(tvPages.every((page) => page.closed)).toBe(true);
	});
});
