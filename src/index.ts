import { isBotGuardBrowserConnected } from "./botguard-browser.ts";
import { DeviceAuth } from "./device-auth.ts";
import { createDeviceAuthRoutes } from "./device-auth-routes.ts";
import { playbackTraceFromRequest, tracePlaybackRequest } from "./playback-diagnostics.ts";
import { handlePoTokenRequest } from "./po-token-routes.ts";
import { readRemoteLoginConfig } from "./remote-login-config.ts";
import { createServiceStatusRoutes } from "./service-status-routes.ts";
import { importSessionBinding } from "./session-binding.ts";
import { handleSubtitleRequest } from "./subtitle-routes.ts";
import { sessionStatus } from "./token-service.ts";
import { startTokenWarmup } from "./token-warmup.ts";
import { TvPoTokenMinter } from "./tv-po-token.ts";
import { createTvPoTokenRoutes } from "./tv-po-token-routes.ts";
import { createYoutubePlayerDecoderRoutes } from "./youtube-player-decoder-routes.ts";
import { fetchYoutubeSabrSession } from "./youtube-sabr-session.ts";
import type { YoutubeSabrClient } from "./youtube-sabr-types.ts";

const PORT = 8081;
const remoteLoginConfig = readRemoteLoginConfig();
const deviceAuthRoutes = createDeviceAuthRoutes(new DeviceAuth());
const tvPoTokenMinter = new TvPoTokenMinter();
const tvPoTokenRoutes = createTvPoTokenRoutes(tvPoTokenMinter);
const decoderRoutes = createYoutubePlayerDecoderRoutes();
const serviceStatusRoutes = createServiceStatusRoutes({
	browserConnected: isBotGuardBrowserConnected,
	session: sessionStatus,
	tv: () => tvPoTokenMinter.status(),
});

export async function handler(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const statusResponse = serviceStatusRoutes(req, url);
	if (statusResponse !== null) return statusResponse;
	const deviceAuthResponse = await deviceAuthRoutes(req, url);
	if (deviceAuthResponse !== null) return deviceAuthResponse;
	const tvPoTokenResponse = await tvPoTokenRoutes(req, url);
	if (tvPoTokenResponse !== null) return tvPoTokenResponse;
	const subtitleResponse = await handleSubtitleRequest(req, url);
	if (subtitleResponse !== null) return subtitleResponse;
	const poTokenResponse = await handlePoTokenRequest(req, url);
	if (poTokenResponse !== null) return poTokenResponse;
	const decoderResponse = await decoderRoutes(req, url);
	if (decoderResponse !== null) return decoderResponse;

	if (req.method === "POST" && url.pathname === "/session-binding") {
		const body = (await req.json().catch(() => null)) as { cookies?: unknown } | null;
		const cookies = typeof body?.cookies === "string" ? body.cookies : "";
		if (!cookies.trim()) return Response.json({ error: "cookies are required" }, { status: 400 });
		const result = await importSessionBinding(remoteLoginConfig, cookies);
		if (result.ok === false) {
			const status = result.reason === "invalid_cookies" ? 400 : 422;
			return Response.json({ error: result.reason }, { status });
		}
		return Response.json({
			cookies: result.cookies,
			poToken: result.poToken,
			authUser: result.authUser,
		});
	}

	if (req.method === "GET" && url.pathname === "/youtube/sabr/session") {
		const videoId = url.searchParams.get("videoId");
		const clientParam = url.searchParams.get("client") ?? "MWEB";

		if (!videoId) {
			return Response.json({ error: "videoId query parameter is required" }, { status: 400 });
		}
		if (clientParam !== "WEB" && clientParam !== "MWEB") {
			return Response.json({ error: "client must be WEB or MWEB" }, { status: 400 });
		}

		try {
			const trace = playbackTraceFromRequest(req);
			return await tracePlaybackRequest(trace, "youtube.sabr.session", async () => {
				const result = await fetchYoutubeSabrSession(
					videoId,
					clientParam as YoutubeSabrClient,
					undefined,
					url.searchParams.get("isolated") === "true",
					trace ?? undefined,
				);
				return Response.json(result);
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Internal error";
			return Response.json({ error: message }, { status: 500 });
		}
	}

	if (req.method === "POST" && url.pathname === "/youtube/sabr/session/reload") {
		try {
			const body = (await req.json().catch(() => null)) as {
				videoId?: unknown;
				client?: unknown;
				reloadPlaybackParams?: unknown;
			} | null;
			const videoId = typeof body?.videoId === "string" ? body.videoId.trim() : "";
			const client = body?.client ?? "MWEB";
			const reloadPlaybackParams =
				typeof body?.reloadPlaybackParams === "string" ? body.reloadPlaybackParams.trim() : "";
			if (!videoId || videoId.length > 128) {
				return Response.json({ error: "videoId is required" }, { status: 400 });
			}
			if (client !== "WEB" && client !== "MWEB") {
				return Response.json({ error: "client must be WEB or MWEB" }, { status: 400 });
			}
			if (!reloadPlaybackParams || reloadPlaybackParams.length > 8192) {
				return Response.json({ error: "reloadPlaybackParams is required" }, { status: 400 });
			}
			const trace = playbackTraceFromRequest(req);
			return await tracePlaybackRequest(trace, "youtube.sabr.session.reload", async () => {
				const result = await fetchYoutubeSabrSession(
					videoId,
					client as YoutubeSabrClient,
					reloadPlaybackParams,
					false,
					trace ?? undefined,
				);
				return Response.json(result);
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Internal error";
			return Response.json({ error: message }, { status: 500 });
		}
	}

	return new Response("Not Found", { status: 404 });
}

if (import.meta.main) {
	startTokenWarmup(tvPoTokenMinter);
	Bun.serve({ port: PORT, fetch: handler });
}
