import { describe, expect, it, mock } from "bun:test";
import type { YoutubeInnertube } from "../src/youtube-innertube-session.ts";

const firstSession = { id: "first" } as unknown as YoutubeInnertube;
const secondSession = { id: "second" } as unknown as YoutubeInnertube;

describe("YouTube caption tracks", () => {
	it("loads and normalizes tracks through the MWEB player contract", async () => {
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

		expect(getInnertube).toHaveBeenCalledWith("MWEB", "visitor");
		expect(fetchPlayer).toHaveBeenCalledWith("video", firstSession, "visitor-pot");
		expect(invalidateInnertube).not.toHaveBeenCalled();
		expect(tracks).toEqual([
			{
				baseUrl: "https://m.youtube.com/api/timedtext?v=video&lang=en",
				name: { simpleText: "English" },
				languageCode: "en",
				kind: undefined,
				vssId: ".en",
			},
		]);
	});

	it("recreates a rejected anonymous MWEB session only once", async () => {
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
				: { playability_status: { status: "OK" } },
		);

		await fetchCaptionTracks("video", "visitor", "visitor-pot", {
			getInnertube,
			invalidateInnertube,
			fetchPlayer,
		});

		expect(getInnertube).toHaveBeenCalledTimes(2);
		expect(invalidateInnertube).toHaveBeenCalledWith("MWEB", "visitor", firstSession);
		expect(fetchPlayer).toHaveBeenCalledTimes(2);
	});
});
