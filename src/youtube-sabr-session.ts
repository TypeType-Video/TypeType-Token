import { buildSabrFormat } from "googlevideo/utils";
import { type IPlayerResponse, YTNodes } from "youtubei.js";
import { KeyedSingleFlight } from "./keyed-single-flight.ts";
import { fetchPoToken } from "./token-service.ts";
import { findYoutubeChannelAvatarUrl } from "./youtube-channel-avatar.ts";
import {
	cacheYoutubeChannelAvatar,
	getCachedYoutubeChannelAvatar,
} from "./youtube-channel-avatar-cache.ts";
import {
	getYoutubeInnertube,
	isRejectedAnonymousSession,
	type YoutubeInnertube,
} from "./youtube-innertube-session.ts";
import { withYoutubeClientVersion } from "./youtube-mweb-config.ts";
import { toYoutubeSabrAdaptiveFormat } from "./youtube-sabr-adaptive-format.ts";
import { youtubeSabrIdentityRefresher } from "./youtube-sabr-identity-refresher.ts";
import { buildYoutubeSabrPlayerRequest } from "./youtube-sabr-player-request.ts";
import type { YoutubeSabrClient, YoutubeSabrSession } from "./youtube-sabr-types.ts";

const sessionRequests = new KeyedSingleFlight<string, YoutubeSabrSession>();

export async function fetchYoutubeSabrSession(
	videoId: string,
	client: YoutubeSabrClient = "MWEB",
	reloadPlaybackParamsToken?: string,
	isolated = false,
): Promise<YoutubeSabrSession> {
	if (reloadPlaybackParamsToken || isolated) {
		return loadYoutubeSabrSession(videoId, client, reloadPlaybackParamsToken);
	}
	return sessionRequests.run(`${client}:${videoId}`, () => loadYoutubeSabrSession(videoId, client));
}

async function loadYoutubeSabrSession(
	videoId: string,
	client: YoutubeSabrClient,
	reloadPlaybackParamsToken?: string,
): Promise<YoutubeSabrSession> {
	let tokens = await fetchPoToken(videoId);
	let innertube = await getYoutubeInnertube(client, tokens.visitorData);
	let responses = await fetchYoutubeResponses(
		videoId,
		innertube,
		tokens.visitorBoundPoToken,
		reloadPlaybackParamsToken,
	);
	const playability = responses.videoInfo.playability_status;
	if (isRejectedAnonymousSession(playability?.status, playability?.reason)) {
		const refreshed = await youtubeSabrIdentityRefresher.refresh(
			videoId,
			client,
			tokens.visitorData,
			innertube,
		);
		tokens = refreshed.tokens;
		innertube = refreshed.session;
		responses = await fetchYoutubeResponses(
			videoId,
			innertube,
			tokens.visitorBoundPoToken,
			reloadPlaybackParamsToken,
		);
	}
	const { videoInfo, nextResponse } = responses;
	if (videoInfo.playability_status?.status !== "OK") {
		throw new Error(
			`YouTube ${client} player response is ${videoInfo.playability_status?.status ?? "missing"}: ${videoInfo.playability_status?.reason ?? "no reason"}`,
		);
	}

	const cachedChannelAvatarUrl = getCachedYoutubeChannelAvatar(videoId);
	const channelAvatarUrl =
		cachedChannelAvatarUrl ?? findYoutubeChannelAvatarUrl(nextResponse?.data);
	cacheYoutubeChannelAvatar(videoId, channelAvatarUrl);
	return buildYoutubeSabrSession(videoId, client, tokens, innertube, videoInfo, channelAvatarUrl);
}

async function fetchYoutubeResponses(
	videoId: string,
	innertube: YoutubeInnertube,
	poToken: string,
	reloadPlaybackParamsToken?: string,
) {
	const endpoint = new YTNodes.NavigationEndpoint({ watchEndpoint: { videoId } });
	const nextEndpoint = new YTNodes.NavigationEndpoint({ watchNextEndpoint: { videoId } });
	const cachedChannelAvatarUrl = getCachedYoutubeChannelAvatar(videoId);
	const [videoInfo, nextResponse] = await Promise.all([
		endpoint.call<IPlayerResponse>(innertube.actions, {
			...buildYoutubeSabrPlayerRequest(
				innertube.session.player?.signature_timestamp,
				poToken,
				reloadPlaybackParamsToken,
			),
			parse: true,
		}),
		cachedChannelAvatarUrl
			? Promise.resolve(null)
			: nextEndpoint.call(innertube.actions, { parse: false }).catch(() => null),
	]);
	return { videoInfo, nextResponse };
}

async function buildYoutubeSabrSession(
	videoId: string,
	client: YoutubeSabrClient,
	tokens: Awaited<ReturnType<typeof fetchPoToken>>,
	innertube: YoutubeInnertube,
	videoInfo: IPlayerResponse,
	channelAvatarUrl: string,
): Promise<YoutubeSabrSession> {
	const rawServerAbrStreamingUrl = videoInfo.streaming_data?.server_abr_streaming_url;
	const decipheredServerAbrStreamingUrl =
		await innertube.session.player?.decipher(rawServerAbrStreamingUrl);
	const serverAbrStreamingUrl = decipheredServerAbrStreamingUrl
		? withYoutubeClientVersion(
				decipheredServerAbrStreamingUrl,
				innertube.session.context.client.clientVersion,
			)
		: undefined;
	const videoPlaybackUstreamerConfig =
		videoInfo.player_config?.media_common_config.media_ustreamer_request_config
			?.video_playback_ustreamer_config;

	if (!serverAbrStreamingUrl || !rawServerAbrStreamingUrl) {
		throw new Error("serverAbrStreamingUrl missing from YouTube player response");
	}
	if (!videoPlaybackUstreamerConfig) {
		throw new Error("videoPlaybackUstreamerConfig missing from YouTube player response");
	}

	const formats = (videoInfo.streaming_data?.adaptive_formats ?? [])
		.map((format) => buildSabrFormat(format))
		.filter((format) => format.mimeType?.includes("audio") || format.mimeType?.includes("video"));
	const adaptiveFormats = (videoInfo.streaming_data?.adaptive_formats ?? []).map((format) =>
		toYoutubeSabrAdaptiveFormat(format),
	);
	const details = videoInfo.video_details;
	const metadata = {
		title: details?.title ?? "",
		author: details?.author ?? "",
		channelId: details?.channel_id ?? "",
		channelAvatarUrl,
		description: details?.short_description ?? "",
		durationMs: (details?.duration ?? 0) * 1000,
		viewCount: details?.view_count ?? 0,
		thumbnailUrl: details?.thumbnail[0]?.url ?? "",
		tags: details?.keywords ?? [],
		isLive: details?.is_live ?? false,
		isLiveContent: details?.is_live_content ?? false,
	};

	return {
		videoId,
		client,
		visitorData: tokens.visitorData,
		poToken: tokens.visitorBoundPoToken,
		streamingPot: tokens.streamingPot,
		serverAbrStreamingUrl,
		rawServerAbrStreamingUrl,
		hlsManifestUrl: videoInfo.streaming_data?.hls_manifest_url ?? null,
		videoPlaybackUstreamerConfig,
		durationMs: metadata.durationMs || null,
		title: metadata.title || null,
		metadata,
		formats,
		adaptiveFormats,
	};
}
