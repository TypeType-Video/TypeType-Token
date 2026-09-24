import { mintPoToken } from "./botguard-page.ts";
import {
	playbackTraceEvent,
	tracePlaybackPhase,
	type PlaybackTraceContext,
} from "./playback-diagnostics.ts";

const MAX_CACHED_VIDEO_TOKENS = 512;

export type CachedSession = {
	visitorData: string;
	visitorBoundPoToken: string;
	integrityToken: string;
	expiresAt: number;
	videoBoundPoTokens: Map<string, string>;
	videoBoundPoTokenRequests: Map<string, Promise<string>>;
};

type TokenTarget = "video" | "session_binding";

export async function getVideoBoundPoToken(
	s: CachedSession,
	videoId: string,
	trace?: PlaybackTraceContext,
	target: TokenTarget = "video",
): Promise<string> {
	const eventPrefix =
		target === "session_binding" ? "token.session_bound_po_token" : "token.video_bound_po_token";
	const cached = s.videoBoundPoTokens.get(videoId);
	if (cached !== undefined) {
		playbackTraceEvent(trace, eventPrefix + ".cache_hit");
		return cached;
	}

	const inFlight = s.videoBoundPoTokenRequests.get(videoId);
	if (inFlight !== undefined) {
		playbackTraceEvent(trace, eventPrefix + ".singleflight_join");
		return inFlight;
	}

	const request = tracePlaybackPhase(trace, eventPrefix + ".mint", () =>
		mintPoToken(s.integrityToken, videoId),
	)
		.then((token) => {
			if (s.videoBoundPoTokens.size >= MAX_CACHED_VIDEO_TOKENS) {
				const oldestVideoId = s.videoBoundPoTokens.keys().next().value;
				if (oldestVideoId !== undefined) {
					s.videoBoundPoTokens.delete(oldestVideoId);
				}
			}
			s.videoBoundPoTokens.set(videoId, token);
			return token;
		})
		.finally(() => s.videoBoundPoTokenRequests.delete(videoId));
	s.videoBoundPoTokenRequests.set(videoId, request);
	return request;
}

export async function refreshVideoBoundPoToken(
	s: CachedSession,
	videoId: string,
	trace?: PlaybackTraceContext,
	target: TokenTarget = "video",
): Promise<string> {
	const inFlight = s.videoBoundPoTokenRequests.get(videoId);
	if (inFlight !== undefined) {
		playbackTraceEvent(trace, "token.video_bound_po_token.refresh_singleflight_join", {
			target,
		});
		return inFlight;
	}
	playbackTraceEvent(trace, "token.video_bound_po_token.refresh", { target });
	s.videoBoundPoTokens.delete(videoId);
	return getVideoBoundPoToken(s, videoId, trace, target);
}
