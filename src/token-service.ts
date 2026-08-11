import { fetchChallenge } from "./botguard-challenge.ts";
import { executeBotGuard, mintPoToken, resetBotGuardPage } from "./botguard-page.ts";
import { fetchIntegrityToken, fetchVisitorData } from "./innertube.ts";

const EXPIRY_MARGIN_MS = 10 * 60 * 1000;
const MAX_CACHED_VIDEO_TOKENS = 512;

export type TokenResult = {
	visitorData: string;
	visitorBoundPoToken: string;
	videoBoundPoToken: string;
	poToken: string;
	streamingPot: string;
};

type CachedSession = {
	visitorData: string;
	visitorBoundPoToken: string;
	integrityToken: string;
	expiresAt: number;
	videoBoundPoTokens: Map<string, string>;
	videoBoundPoTokenRequests: Map<string, Promise<string>>;
};

let session: CachedSession | null = null;
let sessionRefreshInFlight: Promise<CachedSession> | null = null;

async function buildSession(): Promise<CachedSession> {
	const visitorData = await fetchVisitorData();
	const challenge = await fetchChallenge(visitorData);

	const botguardResponse = await executeBotGuard(
		challenge.interpreterScript,
		challenge.program,
		challenge.globalName,
		challenge.eventId,
	);
	const integrityTokenData = await fetchIntegrityToken(botguardResponse);

	if (!integrityTokenData.integrityToken) {
		throw new Error("integrityToken missing from GenerateIT response");
	}

	const visitorBoundPoToken = await mintPoToken(integrityTokenData.integrityToken, visitorData);
	const ttlMs = Math.max(1000, (integrityTokenData.estimatedTtlSecs ?? 21600) * 1000);
	const refreshMarginMs = Math.min(EXPIRY_MARGIN_MS, Math.floor(ttlMs / 10));

	return {
		visitorData,
		visitorBoundPoToken,
		integrityToken: integrityTokenData.integrityToken,
		expiresAt: Date.now() + ttlMs - refreshMarginMs,
		videoBoundPoTokens: new Map(),
		videoBoundPoTokenRequests: new Map(),
	};
}

async function getVideoBoundPoToken(s: CachedSession, videoId: string): Promise<string> {
	const cached = s.videoBoundPoTokens.get(videoId);
	if (cached !== undefined) return cached;

	const inFlight = s.videoBoundPoTokenRequests.get(videoId);
	if (inFlight !== undefined) return inFlight;

	const request = mintPoToken(s.integrityToken, videoId)
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

async function refreshVideoBoundPoToken(s: CachedSession, videoId: string): Promise<string> {
	const inFlight = s.videoBoundPoTokenRequests.get(videoId);
	if (inFlight !== undefined) return inFlight;
	s.videoBoundPoTokens.delete(videoId);
	return getVideoBoundPoToken(s, videoId);
}

function startSessionRefresh(): Promise<CachedSession> {
	const previousSession = session;
	const promise = Promise.resolve()
		.then(async () => {
			if (previousSession !== null) {
				await Promise.allSettled(previousSession.videoBoundPoTokenRequests.values());
			}
			await resetBotGuardPage();
			return buildSession();
		})
		.then((s) => {
			session = s;
			return s;
		})
		.finally(() => {
			if (sessionRefreshInFlight === promise) sessionRefreshInFlight = null;
		});
	sessionRefreshInFlight = promise;
	return promise;
}

export async function getOrRefreshSession(forceRefresh = false): Promise<CachedSession> {
	if (sessionRefreshInFlight !== null) return sessionRefreshInFlight;
	if (!forceRefresh && session !== null && Date.now() < session.expiresAt) return session;
	return startSessionRefresh();
}

export async function fetchPoToken(
	videoId: string,
	forceRefresh = false,
	refreshVideo = false,
): Promise<TokenResult> {
	const currentSession = await getOrRefreshSession(forceRefresh);
	const { visitorData, visitorBoundPoToken } = currentSession;
	const videoBoundPoToken = refreshVideo
		? await refreshVideoBoundPoToken(currentSession, videoId)
		: await getVideoBoundPoToken(currentSession, videoId);
	return {
		visitorData,
		visitorBoundPoToken,
		videoBoundPoToken,
		poToken: visitorBoundPoToken,
		streamingPot: videoBoundPoToken,
	};
}
