import { buildBotGuardSession, retireBotGuardSession } from "./botguard-session.ts";
import { BotGuardSessionStore } from "./botguard-session-store.ts";
import { type PlaybackTraceContext, playbackTraceEvent } from "./playback-diagnostics.ts";
import {
	type CachedSession,
	getVideoBoundPoToken,
	refreshVideoBoundPoToken,
} from "./video-bound-po-token.ts";

export type TokenResult = {
	visitorData: string;
	visitorBoundPoToken: string;
	videoBoundPoToken: string;
	poToken: string;
	streamingPot: string;
};

export type SessionTokenResult = TokenResult & {
	sessionBoundPoToken: string;
};

const sessions = new BotGuardSessionStore({
	build: buildBotGuardSession,
	retire: retireBotGuardSession,
});

export async function getOrRefreshSession(
	forceRefresh = false,
	trace?: PlaybackTraceContext,
): Promise<CachedSession> {
	return sessions.get(forceRefresh, trace);
}

export async function fetchPoToken(
	videoId: string,
	forceRefresh = false,
	refreshVideo = false,
	trace?: PlaybackTraceContext,
): Promise<TokenResult> {
	playbackTraceEvent(trace, "token.video_request", { forceRefresh, refreshVideo });
	const currentSession = await getOrRefreshSession(forceRefresh, trace);
	const videoBoundPoToken = refreshVideo
		? await refreshVideoBoundPoToken(currentSession, videoId, trace)
		: await getVideoBoundPoToken(currentSession, videoId, trace);
	return tokenResult(currentSession, videoBoundPoToken);
}

export async function fetchSessionPoTokens(
	videoId: string,
	sessionBinding: string,
	refreshVideo = false,
	trace?: PlaybackTraceContext,
): Promise<SessionTokenResult> {
	playbackTraceEvent(trace, "token.session_request", { refreshVideo });
	const currentSession = await getOrRefreshSession(false, trace);
	const [videoBoundPoToken, sessionBoundPoToken] = await Promise.all([
		refreshVideo
			? refreshVideoBoundPoToken(currentSession, videoId, trace)
			: getVideoBoundPoToken(currentSession, videoId, trace),
		getVideoBoundPoToken(currentSession, sessionBinding, trace, "session_binding"),
	]);
	playbackTraceEvent(trace, "token.session_tokens.ready");
	return {
		...tokenResult(currentSession, videoBoundPoToken),
		sessionBoundPoToken,
	};
}

function tokenResult(currentSession: CachedSession, videoBoundPoToken: string): TokenResult {
	const { visitorData, visitorBoundPoToken } = currentSession;
	return {
		visitorData,
		visitorBoundPoToken,
		videoBoundPoToken,
		poToken: visitorBoundPoToken,
		streamingPot: videoBoundPoToken,
	};
}
