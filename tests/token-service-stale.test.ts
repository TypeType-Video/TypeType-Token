import { afterAll, beforeAll, describe, expect, it, mock, setSystemTime } from "bun:test";
import type { IntegrityTokenData } from "bgutils-js/shared-types";
import type { TokenResult } from "../src/token-service.ts";
import {
	type FakeBotGuardContext,
	FakeBotGuardContextClosedError,
	fakeBotGuardModule,
	passForcedRefreshCooldown,
} from "./botguard-context-fixtures.ts";

let visitorRequests = 0;
let visitorGate: Promise<void> | null = null;
let markVisitorRequested: (() => void) | undefined;
let closePageOnNextMint = false;
const openedContexts: FakeBotGuardContext[] = [];

async function mint(_token: string, id: string): Promise<string> {
	if (closePageOnNextMint && id === "closed-page-video") {
		closePageOnNextMint = false;
		await openedContexts.at(-1)?.close();
		throw new FakeBotGuardContextClosedError();
	}
	return `pot-${id}`;
}

mock.module("../src/botguard-page.ts", () =>
	fakeBotGuardModule({ execute: async () => "botguard-response", mint }, openedContexts),
);
mock.module("../src/botguard-challenge.ts", () => ({
	WEB_USER_AGENT: "web-agent",
	WEB_CLIENT_VERSION: "2.0",
	fetchChallenge: async () => ({
		interpreterScript: "interpreter",
		program: "program",
		globalName: "vm",
		eventId: "event",
	}),
}));
mock.module("../src/innertube.ts", () => ({
	fetchVisitorData: async (): Promise<string> => {
		const visitor = `visitor-${++visitorRequests}`;
		markVisitorRequested?.();
		if (visitorGate !== null) await visitorGate;
		return visitor;
	},
	fetchIntegrityToken: async (): Promise<IntegrityTokenData> => ({
		integrityToken: "integrity-token",
		estimatedTtlSecs: 21600,
	}),
}));

let fetchPoToken: (videoId: string, forceRefresh?: boolean) => Promise<TokenResult>;

function holdNextRefresh(): { requested: Promise<void>; release: () => void } {
	let release: () => void = () => undefined;
	visitorGate = new Promise<void>((resolve) => {
		release = () => {
			visitorGate = null;
			resolve();
		};
	});
	const requested = new Promise<void>((resolve) => {
		markVisitorRequested = resolve;
	});
	return { requested, release };
}

async function settlesWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T | "pending"> {
	return Promise.race([promise, Bun.sleep(timeoutMs).then(() => "pending" as const)]);
}

describe("token session refresh while serving", () => {
	beforeAll(async () => {
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const module = await import("../src/token-service.ts?token-service-stale-test");
		fetchPoToken = module.fetchPoToken;
	});

	afterAll(() => {
		setSystemTime();
	});

	it("keeps serving the unexpired session while a refresh builds", async () => {
		const first = await fetchPoToken("first-video");
		passForcedRefreshCooldown();
		const hold = holdNextRefresh();
		const forced = fetchPoToken("forced-video", true);
		await hold.requested;

		const served = await settlesWithin(fetchPoToken("served-video"), 200);
		hold.release();

		expect(served).not.toBe("pending");
		expect(served === "pending" ? null : served.visitorData).toBe(first.visitorData);
		expect((await forced).visitorData).not.toBe(first.visitorData);
	});

	it("mints on a new session when the session page closed before minting", async () => {
		const before = await fetchPoToken("before-close-video");
		closePageOnNextMint = true;

		const result = await fetchPoToken("closed-page-video");

		expect(result.videoBoundPoToken).toBe("pot-closed-page-video");
		expect(result.visitorData).not.toBe(before.visitorData);
	});

	it("returns the fresh session to forced refreshes inside the cooldown", async () => {
		passForcedRefreshCooldown();
		const refreshed = await fetchPoToken("cooldown-first", true);
		const requestsAfterRefresh = visitorRequests;

		const repeated = await fetchPoToken("cooldown-second", true);

		expect(repeated.visitorData).toBe(refreshed.visitorData);
		expect(visitorRequests).toBe(requestsAfterRefresh);

		passForcedRefreshCooldown();
		const later = await fetchPoToken("cooldown-third", true);
		expect(later.visitorData).not.toBe(refreshed.visitorData);
	});
});
