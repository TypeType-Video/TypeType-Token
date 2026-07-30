import { describe, expect, it } from "bun:test";
import {
	fetchYoutubeMwebConfig,
	parseYoutubeMwebConfig,
	withYoutubeClientVersion,
} from "../src/youtube-mweb-config.ts";

const configBody = (clientVersion: string) => {
	const deviceInfo = Array.from({ length: 17 }, () => null);
	deviceInfo[16] = clientVersion;
	return `)]}'\n\n${JSON.stringify([["yt.sw.adr", null, [[deviceInfo], "api-key"]]])}`;
};

describe("YouTube MWEB config", () => {
	it("reads the current client version from structured service worker data", () => {
		expect(parseYoutubeMwebConfig(configBody("2.20260723.05.00"))).toEqual({
			clientVersion: "2.20260723.05.00",
		});
	});

	it("rejects malformed service worker data", () => {
		expect(() => parseYoutubeMwebConfig(`)]}'\n\n[]`)).toThrow(
			"YouTube MWEB service data is invalid",
		);
	});

	it("fetches the MWEB config with the mobile origin", async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
			calls.push({ url: String(url), init });
			return new Response(configBody("2.20260723.05.00"));
		};

		await expect(fetchYoutubeMwebConfig(fetcher)).resolves.toEqual({
			clientVersion: "2.20260723.05.00",
		});
		expect(calls[0]?.url).toBe("https://m.youtube.com/sw.js_data");
		expect(new Headers(calls[0]?.init?.headers).get("referer")).toBe("https://m.youtube.com/sw.js");
	});

	it("keeps the SABR URL aligned with the player client version", () => {
		expect(
			withYoutubeClientVersion(
				"https://example.com/videoplayback?c=MWEB&cver=old&cpn=session",
				"2.20260723.05.00",
			),
		).toBe("https://example.com/videoplayback?c=MWEB&cver=2.20260723.05.00&cpn=session");
	});
});
