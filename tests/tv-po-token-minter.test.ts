import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { BotGuardContext } from "../src/botguard-page.ts";
import { TvPoTokenMinter } from "../src/tv-po-token.ts";
import { createTvPoTokenRoutes } from "../src/tv-po-token-routes.ts";
import { FakeBotGuardContext } from "./botguard-context-fixtures.ts";
import { stubTvFetch } from "./tv-po-token-fixtures.ts";

let restoreFetch: () => void = () => undefined;
let mints = 0;

function minter(): TvPoTokenMinter {
	return new TvPoTokenMinter(
		async () =>
			new FakeBotGuardContext({
				execute: async () => "botguard-response",
				mint: async () => `tv-pot-${++mints}`,
			}) as unknown as BotGuardContext,
	);
}

describe("TV PO token minter", () => {
	beforeAll(() => {
		restoreFetch = stubTvFetch();
	});

	afterAll(() => {
		restoreFetch();
	});

	it("mints a new token on a forced refresh once the cooldown passed", async () => {
		const tv = minter();
		const now = Date.now();
		const first = await tv.get(false, now);

		expect((await tv.get(false, now + 1_000)).poToken).toBe(first.poToken);
		expect((await tv.get(true, now + 31_000)).poToken).not.toBe(first.poToken);
	});

	it("keeps a token minted inside the cooldown on a forced refresh", async () => {
		const tv = minter();
		const now = Date.now();
		const first = await tv.get(false, now);

		expect((await tv.get(true, now + 5_000)).poToken).toBe(first.poToken);
	});

	it("reports a failed mint", async () => {
		const tv = new TvPoTokenMinter(async () => {
			throw new Error("browser unavailable");
		});

		await expect(tv.get()).rejects.toThrow("browser unavailable");
		expect(tv.status()).toEqual({
			expiresAt: null,
			lastMintAt: null,
			lastError: "browser unavailable",
		});
	});

	it("forwards the refresh query to the minter", async () => {
		const forced: boolean[] = [];
		const recording = {
			get: async (forceRefresh: boolean) => {
				forced.push(forceRefresh);
				return { poToken: "p", visitorData: "v", livingRoomPoTokenId: "l", expiresAt: 1 };
			},
		} as unknown as TvPoTokenMinter;
		const routes = createTvPoTokenRoutes(recording);

		await routes(get("/tv-token"), url("/tv-token"));
		await routes(get("/tv-token?refresh=true"), url("/tv-token?refresh=true"));

		expect(forced).toEqual([false, true]);
	});
});

function get(path: string): Request {
	return new Request(`http://localhost:8081${path}`);
}

function url(path: string): URL {
	return new URL(`http://localhost:8081${path}`);
}
