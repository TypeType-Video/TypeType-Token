import { BotGuardContextClosedError } from "./botguard-page.ts";
import { buildBotGuardSession, retireBotGuardSession } from "./botguard-session.ts";
import { type BotGuardSessionStatus, BotGuardSessionStore } from "./botguard-session-store.ts";
import { type PlaybackTraceContext, playbackTraceEvent } from "./playback-diagnostics.ts";
import {
	type CachedSession,
	getVideoBoundPoToken,
	RetiredBotGuardSessionError,
	refreshVideoBoundPoToken,
} from "./video-bound-po-token.ts";

export type TokenResult = {
	visitorData: string;
	visitorBoundPoToken: string;
	videoBoundPoToken: string;
	poToken: string;
	streamingPot: string;
	generation: string;
	expiresAt: number;
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

export function sessionStatus(): BotGuardSessionStatus {
	return sessions.status();
}

async function withCurrentSession<T>(
	forceRefresh: boolean,
	trace: PlaybackTraceContext | undefined,
	use: (session: CachedSession) => Promise<T>,
): Promise<T> {
	const session = await sessions.get(forceRefresh, trace);
	try {
		return await use(session);
	} catch (error) {
		if (!isReplacedSessionError(error)) throw error;
		playbackTraceEvent(trace, "session.replaced_retry");
		return use(await sessions.get(false, trace));
	}
}

function isReplacedSessionError(error: unknown): boolean {
	return (
		error instanceof RetiredBotGuardSessionError || error instanceof BotGuardContextClosedError
	);
}

export async function fetchPoToken(
	videoId: string,
	forceRefresh = false,
	refreshVideo = false,
	trace?: PlaybackTraceContext,
): Promise<TokenResult> {
	playbackTraceEvent(trace, "token.video_request", { forceRefresh, refreshVideo });
	return withCurrentSession(forceRefresh, trace, async (session) => {
		const videoBoundPoToken = refreshVideo
			? await refreshVideoBoundPoToken(session, videoId, trace)
			: await getVideoBoundPoToken(session, videoId, trace);
		return tokenResult(session, videoBoundPoToken);
	});
}

export async function fetchSessionPoTokens(
	videoId: string,
	sessionBinding: string,
	refreshVideo = false,
	trace?: PlaybackTraceContext,
): Promise<SessionTokenResult> {
	playbackTraceEvent(trace, "token.session_request", { refreshVideo });
	return withCurrentSession(false, trace, async (session) => {
		const [videoBoundPoToken, sessionBoundPoToken] = await Promise.all([
			refreshVideo
				? refreshVideoBoundPoToken(session, videoId, trace)
				: getVideoBoundPoToken(session, videoId, trace),
			getVideoBoundPoToken(session, sessionBinding, trace, "session_binding"),
		]);
		playbackTraceEvent(trace, "token.session_tokens.ready");
		return { ...tokenResult(session, videoBoundPoToken), sessionBoundPoToken };
	});
}

function tokenResult(currentSession: CachedSession, videoBoundPoToken: string): TokenResult {
	const { visitorData, visitorBoundPoToken, generation, expiresAt } = currentSession;
	return {
		visitorData,
		visitorBoundPoToken,
		videoBoundPoToken,
		poToken: visitorBoundPoToken,
		streamingPot: videoBoundPoToken,
		generation,
		expiresAt,
	};
}
