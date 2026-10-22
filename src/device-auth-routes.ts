import type { DeviceAuth } from "./device-auth.ts";

const MAX_KEY_LENGTH = 128;
const MAX_TOKEN_LENGTH = 4096;

type Body = Record<string, unknown>;

export function createDeviceAuthRoutes(
	auth: DeviceAuth,
): (req: Request, url: URL) => Promise<Response | null> {
	return async (req, url) => {
		if (req.method !== "POST") return null;
		if (url.pathname === "/device/start") {
			const accountKey = await readString(req, "accountKey");
			if (!accountKey) return badRequest("accountKey is required");
			try {
				return Response.json(await auth.start(accountKey));
			} catch {
				return Response.json({ error: "device_code_unavailable" }, { status: 503 });
			}
		}
		if (url.pathname === "/device/poll") {
			const accountKey = await readString(req, "accountKey");
			if (!accountKey) return badRequest("accountKey is required");
			return Response.json(await auth.poll(accountKey));
		}
		if (url.pathname === "/device/cancel") {
			const accountKey = await readString(req, "accountKey");
			if (!accountKey) return badRequest("accountKey is required");
			auth.cancel(accountKey);
			return new Response(null, { status: 204 });
		}
		if (url.pathname === "/device/refresh") {
			const refreshToken = await readString(req, "refreshToken", MAX_TOKEN_LENGTH);
			if (!refreshToken) return badRequest("refreshToken is required");
			try {
				return Response.json(await auth.refresh(refreshToken));
			} catch (error) {
				const reason = error instanceof Error ? error.message : "refresh_rejected";
				const status = reason === "invalid_grant" ? 401 : 502;
				return Response.json({ error: sanitizeReason(reason) }, { status });
			}
		}
		if (url.pathname === "/device/revoke") {
			const token = await readString(req, "token", MAX_TOKEN_LENGTH);
			if (!token) return badRequest("token is required");
			await auth.revoke(token).catch(() => undefined);
			return new Response(null, { status: 204 });
		}
		return null;
	};
}

async function readString(
	req: Request,
	field: string,
	maxLength = MAX_KEY_LENGTH,
): Promise<string | null> {
	const body = (await req.json().catch(() => null)) as Body | null;
	const value = body?.[field];
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function badRequest(message: string): Response {
	return Response.json({ error: message }, { status: 400 });
}

function sanitizeReason(reason: string): string {
	return /^[a-z_]{1,40}$/i.test(reason) ? reason : "refresh_rejected";
}
