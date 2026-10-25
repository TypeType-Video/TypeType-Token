import { afterEach, describe, expect, it, mock } from "bun:test";
import { TvPlayerCache } from "../src/youtube-tv-player.ts";

const PAGE = '{"player_url":"\\/s\\/player\\/abc123\\/tv-player-ias.vflset\\/tv-player-ias.js"}';
const originalFetch = globalThis.fetch;

function tvFetch(): ReturnType<typeof mock<(input: RequestInfo | URL) => Promise<Response>>> {
	return mock(async (input: RequestInfo | URL) =>
		String(input).endsWith("/tv")
			? new Response(PAGE)
			: new Response("var a={signatureTimestamp:20000};"),
	);
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("TV player cache", () => {
	it("loads the TV player through the bounded YouTube fetch", async () => {
		const inits: Array<RequestInit | undefined> = [];
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			inits.push(init);
			return tvFetch()(input);
		}) as unknown as typeof fetch;

		const player = await new TvPlayerCache().get();

		expect(player).toMatchObject({ playerId: "abc123", signatureTimestamp: 20000 });
		expect(inits.length).toBe(2);
		expect(inits.every((init) => init?.signal instanceof AbortSignal)).toBe(true);
	});

	it("reloads the player after its lifetime or an invalidation", async () => {
		const fetcher = tvFetch();
		let now = 0;
		const cache = new TvPlayerCache(fetcher, 1_000, () => now);

		await cache.get();
		await cache.get();
		expect(fetcher).toHaveBeenCalledTimes(2);

		now = 1_000;
		await cache.get();
		expect(fetcher).toHaveBeenCalledTimes(4);

		cache.invalidate();
		await cache.get();
		expect(fetcher).toHaveBeenCalledTimes(6);
	});

	it("does not keep a failed load", async () => {
		let fail = true;
		const fetcher = mock(async (input: RequestInfo | URL) => {
			if (fail) return new Response("", { status: 503 });
			return tvFetch()(input);
		});
		const cache = new TvPlayerCache(fetcher);

		await expect(cache.get()).rejects.toThrow("TV page request failed: 503");
		fail = false;
		await expect(cache.get()).resolves.toMatchObject({ playerId: "abc123" });
	});
});
