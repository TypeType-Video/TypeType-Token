import { afterEach, describe, expect, it, mock } from "bun:test";

const originalFetch = globalThis.fetch;
const originalProxyUrl = process.env.YOUTUBE_OUTBOUND_PROXY_URL;

afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalProxyUrl === undefined) {
		delete process.env.YOUTUBE_OUTBOUND_PROXY_URL;
	} else {
		process.env.YOUTUBE_OUTBOUND_PROXY_URL = originalProxyUrl;
	}
});

describe("youtubeFetch", () => {
	it("does not bypass a configured proxy after a transport failure", async () => {
		process.env.YOUTUBE_OUTBOUND_PROXY_URL = "http://proxy.internal:8080";
		const fetcher = mock(async (_input: RequestInfo | URL, init?: BunFetchRequestInit) => {
			if (init?.proxy !== undefined) throw new Error("proxy unavailable");
			return new Response("direct response");
		});
		globalThis.fetch = fetcher as unknown as typeof fetch;
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const { youtubeFetch } = await import("../src/youtube-fetch.ts?fail-closed-test");

		await expect(youtubeFetch("https://www.youtube.com")).rejects.toThrow("proxy unavailable");
		expect(fetcher).toHaveBeenCalledTimes(1);
		const init = fetcher.mock.calls[0]?.[1] as BunFetchRequestInit | undefined;
		expect(init?.proxy).toBe("http://proxy.internal:8080");
	});
});

describe("youtubeFetch timeout", () => {
	it("aborts a YouTube request that never answers", async () => {
		delete process.env.YOUTUBE_OUTBOUND_PROXY_URL;
		const fetcher = mock(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
				}),
		);
		globalThis.fetch = fetcher as unknown as typeof fetch;
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const { youtubeFetch } = await import("../src/youtube-fetch.ts?timeout-test");

		await expect(youtubeFetch("https://www.youtube.com", undefined, 20)).rejects.toThrow();
		const init = fetcher.mock.calls[0]?.[1];
		expect(init?.signal?.aborted).toBe(true);
	});

	it("keeps the caller abort signal", async () => {
		delete process.env.YOUTUBE_OUTBOUND_PROXY_URL;
		const fetcher = mock(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response());
		globalThis.fetch = fetcher as unknown as typeof fetch;
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const { youtubeFetch } = await import("../src/youtube-fetch.ts?caller-signal-test");
		const controller = new AbortController();

		await youtubeFetch("https://www.youtube.com", { signal: controller.signal });
		controller.abort();
		expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
	});
});
