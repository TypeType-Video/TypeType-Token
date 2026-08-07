import type { Server, ServerWebSocket } from "bun";
import {
	isRemoteLoginAuthorized,
	isRemoteLoginCallbackAllowed,
	type RemoteLoginConfig,
} from "./remote-login-config.ts";
import type { RemoteLoginManager } from "./remote-login-manager.ts";
import { parseReadinessRequest, parseStartRequest } from "./remote-login-messages.ts";
import type { RemoteLoginConnection } from "./remote-login-session-types.ts";

export type RemoteLoginWebSocketData = {
	sessionId: string;
};

function featureUnavailable(config: RemoteLoginConfig): Response | null {
	if (!config.enabled) return new Response("Not Found", { status: 404 });
	if (!config.internalToken) {
		return Response.json(
			{ error: "remote login internal token is not configured" },
			{ status: 503 },
		);
	}
	return null;
}

async function requestBody(req: Request): Promise<unknown> {
	return req.json().catch(() => null) as Promise<unknown>;
}

function sessionIdFromPath(pathname: string): string | null {
	const prefix = "/youtube-remote-login/";
	if (!pathname.startsWith(prefix)) return null;
	const sessionId = pathname.slice(prefix.length);
	return sessionId.length > 0 && !sessionId.includes("/") ? decodeURIComponent(sessionId) : null;
}

function requireInternal(req: Request, config: RemoteLoginConfig): Response | null {
	const unavailable = featureUnavailable(config);
	if (unavailable) return unavailable;
	if (!isRemoteLoginAuthorized(req, config)) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	return null;
}

export function createRemoteLoginConnection(
	ws: ServerWebSocket<RemoteLoginWebSocketData>,
): RemoteLoginConnection {
	let backpressuredUntil = 0;
	const ok = (status: number): boolean => {
		if (status === -1) backpressuredUntil = Date.now() + 500;
		return status > 0;
	};
	return {
		sendText: (value) => ok(ws.sendText(value, false)),
		sendBinary: (value) => ok(ws.sendBinary(value, false)),
		bufferedAmount: () => (Date.now() < backpressuredUntil ? Number.MAX_SAFE_INTEGER : 0),
		close: (code, reason) => ws.close(code, reason),
	};
}

export function createRemoteLoginHandler(manager: RemoteLoginManager, config: RemoteLoginConfig) {
	return async (
		req: Request,
		url: URL,
		server?: Server<RemoteLoginWebSocketData>,
	): Promise<Response | null | undefined> => {
		if (url.pathname === "/youtube-remote-login/readiness" && req.method === "POST") {
			const denied = requireInternal(req, config);
			if (denied) return denied;
			const body = parseReadinessRequest(await requestBody(req));
			if (!body) return Response.json({ error: "invalid request body" }, { status: 400 });
			if (!isRemoteLoginCallbackAllowed(body.callbackUrl, config)) {
				return Response.json({ error: "callbackUrl is not allowed" }, { status: 400 });
			}
			if (!(await manager.isReady())) {
				return Response.json({ error: "remote browser is unavailable" }, { status: 503 });
			}
			return new Response(null, { status: 204 });
		}

		if (url.pathname === "/youtube-remote-login/start" && req.method === "POST") {
			const denied = requireInternal(req, config);
			if (denied) return denied;
			const body = parseStartRequest(await requestBody(req));
			if (!body) return Response.json({ error: "invalid request body" }, { status: 400 });
			if (!isRemoteLoginCallbackAllowed(body.callbackUrl, config)) {
				return Response.json({ error: "callbackUrl is not allowed" }, { status: 400 });
			}
			const started = await manager.start({
				userId: body.userId,
				ttlMs: body.ttlMs,
				target: {
					serverSessionId: body.serverSessionId,
					callbackUrl: body.callbackUrl,
				},
			});
			if (!started)
				return Response.json({ error: "remote login capacity reached" }, { status: 429 });
			return Response.json(started, { status: 201 });
		}

		const sessionId = sessionIdFromPath(url.pathname);
		if (!sessionId) return null;

		if (req.method === "DELETE") {
			const denied = requireInternal(req, config);
			if (denied) return denied;
			return new Response(null, { status: manager.cancel(sessionId) ? 204 : 404 });
		}

		if (req.method === "GET") {
			const denied = requireInternal(req, config);
			if (denied) return denied;
			if (!manager.has(sessionId)) return new Response("Not Found", { status: 404 });
			if (!server) return Response.json({ error: "websocket server unavailable" }, { status: 500 });
			if (server.upgrade(req, { data: { sessionId } })) return undefined;
			return Response.json({ error: "websocket upgrade failed" }, { status: 400 });
		}

		return new Response("Method Not Allowed", { status: 405 });
	};
}
