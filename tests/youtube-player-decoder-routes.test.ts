import { describe, expect, it } from "bun:test";
import { createYoutubePlayerDecoderRoutes } from "../src/youtube-player-decoder-routes.ts";
import { maxConcurrency } from "./concurrency-fixtures.ts";

const DECODED = { playerId: "p", signatureTimestamp: 1, signatures: {}, throttlingParameters: {} };

function decodeRequest(playerId: string): { request: Request; url: URL } {
	const request = new Request("http://localhost:8081/youtube/player/decoder", {
		method: "POST",
		body: JSON.stringify({ playerId, signatures: ["s"] }),
	});
	return { request, url: new URL(request.url) };
}

describe("player decoder route", () => {
	it("decodes at most two batches at once", async () => {
		const tasks = new Map<string, () => Promise<void>>();
		const routes = createYoutubePlayerDecoderRoutes(async (request) => {
			await tasks.get(request.playerId ?? "")?.();
			return DECODED;
		});

		const peak = await maxConcurrency(4, async (task) => {
			const playerId = `player-${tasks.size}`;
			tasks.set(playerId, task);
			const { request, url } = decodeRequest(playerId);
			return routes(request, url);
		});

		expect(peak).toBe(2);
	});
});
