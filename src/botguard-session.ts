import { fetchChallenge } from "./botguard-challenge.ts";
import { BotGuardContext, type BotGuardContextOpener } from "./botguard-page.ts";
import { fetchIntegrityToken, fetchVisitorData } from "./innertube.ts";
import { type PlaybackTraceContext, tracePlaybackPhase } from "./playback-diagnostics.ts";
import type { CachedSession } from "./video-bound-po-token.ts";

const EXPIRY_MARGIN_MS = 10 * 60 * 1000;
const BOOT_ID = crypto.randomUUID().slice(0, 8);
let generations = 0;

export async function buildBotGuardSession(
	trace?: PlaybackTraceContext,
	openContext: BotGuardContextOpener = (userAgent) => BotGuardContext.open(userAgent),
): Promise<CachedSession> {
	const context = await tracePlaybackPhase(trace, "token.botguard.page_open", () => openContext());
	try {
		return await buildSessionIn(context, trace);
	} catch (error) {
		await context.close();
		throw error;
	}
}

async function buildSessionIn(
	context: BotGuardContext,
	trace?: PlaybackTraceContext,
): Promise<CachedSession> {
	const visitorData = await tracePlaybackPhase(trace, "token.visitor_data.fetch", fetchVisitorData);
	const challenge = await tracePlaybackPhase(trace, "token.botguard.challenge", () =>
		fetchChallenge(visitorData),
	);
	const botguardResponse = await tracePlaybackPhase(trace, "token.botguard.execute", () =>
		context.execute(challenge),
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
		() => context.mint(integrityToken, visitorData),
	);
	const ttlMs = Math.max(1000, (integrityTokenData.estimatedTtlSecs ?? 21600) * 1000);
	const refreshMarginMs = Math.min(EXPIRY_MARGIN_MS, Math.floor(ttlMs / 10));

	return {
		context,
		generation: `${BOOT_ID}-${++generations}`,
		retired: false,
		visitorData,
		visitorBoundPoToken,
		integrityToken,
		expiresAt: Date.now() + ttlMs - refreshMarginMs,
		videoBoundPoTokens: new Map(),
		videoBoundPoTokenRequests: new Map(),
	};
}

export async function retireBotGuardSession(retired: CachedSession): Promise<void> {
	await Promise.allSettled(retired.videoBoundPoTokenRequests.values());
	await retired.context.close();
}
