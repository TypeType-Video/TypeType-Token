import { YTNodes } from "youtubei.js";
import {
	getYoutubeInnertube,
	invalidateYoutubeInnertube,
	isRejectedAnonymousSession,
	type YoutubeInnertube,
} from "./youtube-innertube-session.ts";
import { buildYoutubeSabrPlayerRequest } from "./youtube-sabr-player-request.ts";
import type { YoutubeSabrClient } from "./youtube-sabr-types.ts";

export type RawCaptionTrack = {
	baseUrl?: string;
	name?: { simpleText?: string; runs?: { text?: string }[] };
	languageCode?: string;
	kind?: string;
	vssId?: string;
};

type CaptionTrackData = {
	base_url: string;
	name: { toString(): string };
	language_code: string;
	kind?: string;
	vss_id: string;
};

type CaptionPlayerResponse = {
	playability_status?: { status?: string; reason?: string };
	captions?: { caption_tracks?: CaptionTrackData[] };
};

type CaptionTrackDependencies = {
	getInnertube(client: YoutubeSabrClient, visitorData: string): Promise<YoutubeInnertube>;
	invalidateInnertube(
		client: YoutubeSabrClient,
		visitorData: string,
		innertube: YoutubeInnertube,
	): Promise<void>;
	fetchPlayer(
		videoId: string,
		innertube: YoutubeInnertube,
		playerPoToken: string,
	): Promise<CaptionPlayerResponse>;
};

const dependencies: CaptionTrackDependencies = {
	getInnertube: getYoutubeInnertube,
	invalidateInnertube: invalidateYoutubeInnertube,
	fetchPlayer: fetchCaptionPlayer,
};

export async function fetchCaptionTracks(
	videoId: string,
	visitorData: string,
	playerPoToken: string,
	deps: CaptionTrackDependencies = dependencies,
): Promise<RawCaptionTrack[]> {
	const webTracks = await fetchCaptionTracksForClient(
		"WEB",
		videoId,
		visitorData,
		playerPoToken,
		deps,
	).catch(() => []);
	if (webTracks.length > 0) return webTracks;
	return fetchCaptionTracksForClient("MWEB", videoId, visitorData, playerPoToken, deps);
}

async function fetchCaptionTracksForClient(
	client: YoutubeSabrClient,
	videoId: string,
	visitorData: string,
	playerPoToken: string,
	deps: CaptionTrackDependencies,
): Promise<RawCaptionTrack[]> {
	let innertube = await deps.getInnertube(client, visitorData);
	let response = await deps.fetchPlayer(videoId, innertube, playerPoToken);
	if (
		isRejectedAnonymousSession(
			response.playability_status?.status,
			response.playability_status?.reason,
		)
	) {
		await deps.invalidateInnertube(client, visitorData, innertube);
		innertube = await deps.getInnertube(client, visitorData);
		response = await deps.fetchPlayer(videoId, innertube, playerPoToken);
	}
	if (response.playability_status?.status !== "OK") {
		throw new Error(
			`YouTube ${client} player response is ${response.playability_status?.status ?? "missing"}: ${response.playability_status?.reason ?? "no reason"}`,
		);
	}
	return (response.captions?.caption_tracks ?? []).map((track) => toRawCaptionTrack(track, client));
}

async function fetchCaptionPlayer(
	videoId: string,
	innertube: YoutubeInnertube,
	playerPoToken: string,
): Promise<CaptionPlayerResponse> {
	const endpoint = new YTNodes.NavigationEndpoint({ watchEndpoint: { videoId } });
	return endpoint.call(innertube.actions, {
		...buildYoutubeSabrPlayerRequest(innertube.session.player?.signature_timestamp, playerPoToken),
		parse: true,
	});
}

function toRawCaptionTrack(track: CaptionTrackData, client: YoutubeSabrClient): RawCaptionTrack {
	return {
		baseUrl: new URL(
			track.base_url,
			client === "WEB" ? "https://www.youtube.com" : "https://m.youtube.com",
		).toString(),
		name: { simpleText: track.name.toString() },
		languageCode: track.language_code,
		...(track.kind ? { kind: track.kind } : {}),
		vssId: track.vss_id,
	};
}
