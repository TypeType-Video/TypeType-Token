import type { BotGuardSessionStatus } from "./botguard-session-store.ts";
import { buildInfo } from "./build-info.ts";
import type { TvPoTokenStatus } from "./tv-po-token.ts";

export type ServiceStatusSources = {
	browserConnected: () => boolean;
	session: () => BotGuardSessionStatus;
	tv: () => TvPoTokenStatus;
	now?: () => number;
};

export function createServiceStatusRoutes(
	sources: ServiceStatusSources,
): (req: Request, url: URL) => Response | null {
	return (req, url) => {
		if (req.method !== "GET") return null;
		if (url.pathname === "/health") return Response.json({ status: "ok" });
		if (url.pathname === "/version") return Response.json(buildInfo);
		if (url.pathname === "/ready") return readinessResponse(sources);
		return null;
	};
}

function readinessResponse(sources: ServiceStatusSources): Response {
	const now = (sources.now ?? Date.now)();
	const browserConnected = sources.browserConnected();
	const session = sources.session();
	const tv = sources.tv();
	const webReady = session.usable && session.lastError === null;
	const tvReady = tv.lastMintAt !== null && tv.lastError === null;
	const ready = browserConnected && webReady && tvReady;
	return Response.json(
		{
			status: ready ? "ready" : "not_ready",
			browserConnected,
			web: {
				ready: webReady,
				generation: session.generation,
				expiresAt: session.expiresAt,
				expiresInMs: remainingMs(session.expiresAt, now),
				refreshing: session.refreshing,
				lastRefreshAt: session.lastRefreshAt,
				lastError: session.lastError,
			},
			tv: {
				ready: tvReady,
				expiresAt: tv.expiresAt,
				expiresInMs: remainingMs(tv.expiresAt, now),
				lastMintAt: tv.lastMintAt,
				lastError: tv.lastError,
			},
		},
		{ status: ready ? 200 : 503 },
	);
}

function remainingMs(expiresAt: number | null, now: number): number | null {
	return expiresAt === null ? null : Math.max(0, expiresAt - now);
}
