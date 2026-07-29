import type { Server } from "bun";
import { buildInfo } from "./build-info.ts";
import { readRemoteLoginConfig } from "./remote-login-config.ts";
import { RemoteLoginManager } from "./remote-login-manager.ts";
import {
	createRemoteLoginConnection,
	createRemoteLoginHandler,
	type RemoteLoginWebSocketData,
} from "./remote-login-routes.ts";
import { fetchSubtitles } from "./subtitles.ts";
import { fetchPoToken } from "./token-service.ts";
import { decodeYoutubePlayerBatch } from "./youtube-player-decoder.ts";
import { fetchYoutubeSabrSession } from "./youtube-sabr-session.ts";
import type { YoutubeSabrClient } from "./youtube-sabr-types.ts";

const PORT = 8081;
const remoteLoginConfig = readRemoteLoginConfig();
const remoteLoginManager = new RemoteLoginManager(remoteLoginConfig);
const remoteLoginHandler = createRemoteLoginHandler(remoteLoginManager, remoteLoginConfig);

export async function handler(
	req: Request,
	server?: Server<RemoteLoginWebSocketData>,
): Promise<Response | undefined> {
	const url = new URL(req.url);
	const remoteLoginResponse = await remoteLoginHandler(req, url, server);
	if (remoteLoginResponse !== null) return remoteLoginResponse;

	if (req.method === "GET" && url.pathname === "/potoken") {
		const videoId = url.searchParams.get("videoId");

		if (!videoId) {
			return Response.json({ error: "videoId query parameter is required" }, { status: 400 });
		}

		try {
			const result = await fetchPoToken(
				videoId,
				url.searchParams.get("refresh") === "true",
				url.searchParams.get("refreshVideo") === "true",
			);
			return Response.json(result);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Internal error";
			return Response.json({ error: message }, { status: 500 });
		}
	}

	if (req.method === "GET" && url.pathname === "/subtitles") {
		const videoId = url.searchParams.get("videoId");

		if (!videoId) {
			return Response.json({ error: "videoId query parameter is required" }, { status: 400 });
		}

		try {
			const tracks = await fetchSubtitles(videoId);
			return Response.json(tracks);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Internal error";
			return Response.json({ error: message }, { status: 500 });
		}
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
			const result = await fetchYoutubeSabrSession(
				videoId,
				clientParam as YoutubeSabrClient,
				undefined,
				url.searchParams.get("isolated") === "true",
			);
			return Response.json(result);
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
			return Response.json(
				await fetchYoutubeSabrSession(videoId, client as YoutubeSabrClient, reloadPlaybackParams),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Internal error";
			return Response.json({ error: message }, { status: 500 });
		}
	}

	if (req.method === "POST" && url.pathname === "/youtube/player/decoder") {
		try {
			const body = (await req.json().catch(() => ({}))) as Parameters<
				typeof decodeYoutubePlayerBatch
			>[0];
			return Response.json(await decodeYoutubePlayerBatch(body));
		} catch (error) {
			const message = error instanceof Error ? error.message : "Internal error";
			return Response.json({ error: message }, { status: 500 });
		}
	}

	if (req.method === "GET" && url.pathname === "/health") {
		return Response.json({ status: "ok" });
	}

	if (req.method === "GET" && url.pathname === "/version") {
		return Response.json(buildInfo);
	}

	return new Response("Not Found", { status: 404 });
}

if (import.meta.main) {
	Bun.serve<RemoteLoginWebSocketData>({
		port: PORT,
		fetch: handler,
		websocket: {
			open: (ws) => {
				remoteLoginManager.attach(ws.data.sessionId, createRemoteLoginConnection(ws));
			},
			message: (ws, message) => {
				if (typeof message === "string") remoteLoginManager.message(ws.data.sessionId, message);
			},
			close: (ws) => {
				remoteLoginManager.disconnect(ws.data.sessionId);
			},
		},
	});
}
