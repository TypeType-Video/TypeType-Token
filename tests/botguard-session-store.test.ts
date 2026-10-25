import { describe, expect, it } from "bun:test";
import type { BotGuardContext } from "../src/botguard-page.ts";
import { BotGuardSessionStore } from "../src/botguard-session-store.ts";
import type { CachedSession } from "../src/video-bound-po-token.ts";
import { FakeBotGuardContext } from "./botguard-context-fixtures.ts";

let built = 0;

function session(expiresAt: number): CachedSession {
	const context = new FakeBotGuardContext({
		execute: async () => "response",
		mint: async (_token, id) => `pot-${id}`,
	});
	return {
		context: context as unknown as BotGuardContext,
		generation: `generation-${++built}`,
		retired: false,
		visitorData: `visitor-${built}`,
		visitorBoundPoToken: "visitor-token",
		integrityToken: "integrity-token",
		expiresAt,
		videoBoundPoTokens: new Map(),
		videoBoundPoTokenRequests: new Map(),
	};
}

describe("BotGuard session store status", () => {
	it("reports the last refresh failure until a refresh succeeds", async () => {
		let failing = true;
		const now = 1_000_000;
		const store = new BotGuardSessionStore({
			build: async () => {
				if (failing) throw new Error("GenerateIT request failed: 403");
				return session(now + 60_000);
			},
			retire: async () => undefined,
			now: () => now,
		});

		await expect(store.get()).rejects.toThrow("403");
		expect(store.status()).toMatchObject({
			generation: null,
			usable: false,
			lastError: "GenerateIT request failed: 403",
		});

		failing = false;
		const current = await store.get();
		expect(store.status()).toEqual({
			generation: current.generation,
			expiresAt: now + 60_000,
			usable: true,
			refreshing: false,
			lastRefreshAt: now,
			lastError: null,
		});
	});
});
