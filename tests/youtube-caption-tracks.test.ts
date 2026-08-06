import { describe, expect, it, mock } from "bun:test";
import type { YoutubeInnertube } from "../src/youtube-innertube-session.ts";

const firstSession = { id: "first" } as unknown as YoutubeInnertube;
const secondSession = { id: "second" } as unknown as YoutubeInnertube;

describe("YouTube caption tracks", () => {
	it("loads and normalizes tracks through the WEB player contract", async () => {
		const { fetchCaptionTracks } = await import(
			"../src/youtube-caption-tracks.ts?caption-contract"
		);
		const getInnertube = mock(async () => firstSession);
		const invalidateInnertube = mock(async () => undefined);
		const fetchPlayer = mock(async () => ({
			playability_status: { status: "OK" },
			captions: {
				caption_tracks: [
					{
						base_url: "/api/timedtext?v=video&lang=en",
						name: { toString: () => "English" },
						language_code: "en",
						vss_id: ".en",
						is_translatable: true,
					},
				],
			},
		}));

		const tracks = await fetchCaptionTracks("video", "visitor", "visitor-pot", {
			getInnertube,
			invalidateInnertube,
			fetchPlayer,
		});

		expect(getInnertube).toHaveBeenCalledWith("WEB", "visitor");
		expect(fetchPlayer).toHaveBeenCalledWith("video", firstSession, "visitor-pot");
		expect(invalidateInnertube).not.toHaveBeenCalled();
		expect(tracks).toEqual([
			{
				baseUrl: "https://www.youtube.com/api/timedtext?v=video&lang=en",
				name: { simpleText: "English" },
				languageCode: "en",
				kind: undefined,
				vssId: ".en",
			},
		]);
	});

	it("falls back to MWEB when WEB does not return caption tracks", async () => {
		const { fetchCaptionTracks } = await import(
			"../src/youtube-caption-tracks.ts?caption-fallback"
		);
		const getInnertube = mock(async (client: "WEB" | "MWEB") =>
			client === "WEB" ? firstSession : secondSession,
		);
		const invalidateInnertube = mock(async () => undefined);
		const fetchPlayer = mock(async (_videoId: string, session: YoutubeInnertube) => ({
			playability_status: { status: "OK" },
			captions:
				session === secondSession
					? {
							caption_tracks: [
								{
									base_url: "/api/timedtext?v=video&lang=en",
									name: { toString: () => "English" },
									language_code: "en",
									vss_id: ".en",
								},
							],
						}
					: undefined,
		}));

		const tracks = await fetchCaptionTracks("video", "visitor", "visitor-pot", {
			getInnertube,
			invalidateInnertube,
			fetchPlayer,
		});

		expect(getInnertube.mock.calls.map(([client]) => client)).toEqual(["WEB", "MWEB"]);
		expect(tracks[0]?.baseUrl).toBe("https://m.youtube.com/api/timedtext?v=video&lang=en");
	});

	it("recreates a rejected anonymous WEB session only once", async () => {
		const { fetchCaptionTracks } = await import(
			"../src/youtube-caption-tracks.ts?caption-contract"
		);
		const getInnertube = mock(async () =>
			getInnertube.mock.calls.length === 1 ? firstSession : secondSession,
		);
		const invalidateInnertube = mock(async () => undefined);
		const fetchPlayer = mock(async () =>
			fetchPlayer.mock.calls.length === 1
				? {
						playability_status: {
							status: "LOGIN_REQUIRED",
							reason: "Sign in to confirm you are not a bot",
						},
					}
				: {
						playability_status: { status: "OK" },
						captions: {
							caption_tracks: [
								{
									base_url: "/api/timedtext?v=video&lang=en",
									name: { toString: () => "English" },
									language_code: "en",
									vss_id: ".en",
								},
							],
						},
					},
		);

		await fetchCaptionTracks("video", "visitor", "visitor-pot", {
			getInnertube,
			invalidateInnertube,
			fetchPlayer,
		});

		expect(getInnertube).toHaveBeenCalledTimes(2);
		expect(invalidateInnertube).toHaveBeenCalledWith("WEB", "visitor", firstSession);
		expect(fetchPlayer).toHaveBeenCalledTimes(2);
	});
});
