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
		globalThis.fetch = fetcher as typeof fetch;
		const { youtubeFetch } = await import("../src/youtube-fetch.ts?fail-closed-test");

		await expect(youtubeFetch("https://www.youtube.com")).rejects.toThrow("proxy unavailable");
		expect(fetcher).toHaveBeenCalledTimes(1);
		const init = fetcher.mock.calls[0]?.[1] as BunFetchRequestInit | undefined;
		expect(init?.proxy).toBe("http://proxy.internal:8080");
	});
});
