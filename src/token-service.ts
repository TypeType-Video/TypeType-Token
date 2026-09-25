import { fetchChallenge } from "./botguard-challenge.ts";
import { executeBotGuard, mintPoToken, resetBotGuardPage } from "./botguard-page.ts";
import { fetchIntegrityToken, fetchVisitorData } from "./innertube.ts";
import {
	type PlaybackTraceContext,
	playbackTraceEvent,
	tracePlaybackPhase,
} from "./playback-diagnostics.ts";
import {
	type CachedSession,
	getVideoBoundPoToken,
	refreshVideoBoundPoToken,
} from "./video-bound-po-token.ts";

const EXPIRY_MARGIN_MS = 10 * 60 * 1000;

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

let session: CachedSession | null = null;
let sessionRefreshInFlight: Promise<CachedSession> | null = null;

async function buildSession(trace?: PlaybackTraceContext): Promise<CachedSession> {
	const visitorData = await tracePlaybackPhase(trace, "token.visitor_data.fetch", fetchVisitorData);
	const challenge = await tracePlaybackPhase(trace, "token.botguard.challenge", () =>
		fetchChallenge(visitorData),
	);

	const botguardResponse = await tracePlaybackPhase(trace, "token.botguard.execute", () =>
		executeBotGuard(
			challenge.interpreterScript,
			challenge.program,
			challenge.globalName,
			challenge.eventId,
		),
	);
	const integrityTokenData = await tracePlaybackPhase(trace, "token.generate_it.fetch", () =>
		fetchIntegrityToken(botguardResponse),
	);

	const integrityToken = integrityTokenData.integrityToken;
	if (!integrityToken) {
		throw new Error("integrityToken missing from GenerateIT response");
	}

	const visitorBoundPoToken = await tracePlaybackPhase(
		trace,
		"token.visitor_bound_po_token.mint",
		() => mintPoToken(integrityToken, visitorData),
	);
	const ttlMs = Math.max(1000, (integrityTokenData.estimatedTtlSecs ?? 21600) * 1000);
	const refreshMarginMs = Math.min(EXPIRY_MARGIN_MS, Math.floor(ttlMs / 10));

	return {
		visitorData,
		visitorBoundPoToken,
		integrityToken,
		expiresAt: Date.now() + ttlMs - refreshMarginMs,
		videoBoundPoTokens: new Map(),
		videoBoundPoTokenRequests: new Map(),
	};
}

function startSessionRefresh(trace?: PlaybackTraceContext): Promise<CachedSession> {
	const previousSession = session;
	playbackTraceEvent(trace, "session.refresh.start");
	const promise = Promise.resolve()
		.then(async () => {
			if (previousSession !== null) {
				await Promise.allSettled(previousSession.videoBoundPoTokenRequests.values());
			}
			await tracePlaybackPhase(trace, "token.botguard.page_reset", resetBotGuardPage);
			return buildSession(trace);
		})
		.then((s) => {
			session = s;
			playbackTraceEvent(trace, "session.refresh.end", { outcome: "ok" });
			return s;
		})
		.catch((error: unknown) => {
			playbackTraceEvent(trace, "session.refresh.end", {
				outcome: "error",
				errorType: error instanceof Error ? error.name : "unknown",
			});
			throw error;
		})
		.finally(() => {
			if (sessionRefreshInFlight === promise) sessionRefreshInFlight = null;
		});
	sessionRefreshInFlight = promise;
	return promise;
}

export async function getOrRefreshSession(
	forceRefresh = false,
	trace?: PlaybackTraceContext,
): Promise<CachedSession> {
	if (sessionRefreshInFlight !== null) {
		playbackTraceEvent(trace, "session.refresh.singleflight_join");
		return sessionRefreshInFlight;
	}
	if (!forceRefresh && session !== null && Date.now() < session.expiresAt) {
		playbackTraceEvent(trace, "session.cache_hit");
		return session;
	}
	playbackTraceEvent(trace, forceRefresh ? "session.cache_bypass" : "session.cache_miss");
	return startSessionRefresh(trace);
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
