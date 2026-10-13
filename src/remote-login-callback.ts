import { REMOTE_LOGIN_INTERNAL_HEADER, type RemoteLoginConfig } from "./remote-login-config.ts";

export type RemoteLoginCompletionTarget = {
	serverSessionId: string;
	callbackUrl: string;
};

type RemoteLoginCompletionPayload = {
	sessionId: string;
	tokenSessionId: string;
	status: "completed";
	cookies: string;
	poToken: string;
	authUser: number;
	capturedAt: number;
};

export async function sendRemoteLoginCompletion(
	target: RemoteLoginCompletionTarget,
	tokenSessionId: string,
	cookies: string,
	poToken: string,
	authUser: number,
	config: RemoteLoginConfig,
): Promise<RemoteLoginCompletionResult> {
	const startedAt = Date.now();
	if (!config.internalToken) {
		return { ok: false, reason: "internal_token_missing", durationMs: Date.now() - startedAt };
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), config.callbackTimeoutMs);
	const payload: RemoteLoginCompletionPayload = {
		sessionId: target.serverSessionId,
		tokenSessionId,
		status: "completed",
		cookies,
		poToken,
		authUser,
		capturedAt: Date.now(),
	};

	try {
		const response = await fetch(target.callbackUrl, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[REMOTE_LOGIN_INTERNAL_HEADER]: config.internalToken,
			},
			body: JSON.stringify(payload),
			signal: controller.signal,
		});
		const durationMs = Date.now() - startedAt;
		return response.ok
			? { ok: true, status: response.status, durationMs }
			: { ok: false, reason: "http_error", status: response.status, durationMs };
	} catch (error) {
		return {
			ok: false,
			reason: controller.signal.aborted ? "timeout" : "network_error",
			errorName: safeErrorName(error),
			errorCode: safeErrorCode(error),
			durationMs: Date.now() - startedAt,
		};
	} finally {
		clearTimeout(timer);
	}
}
export type RemoteLoginCompletionResult =
	| { ok: true; status: number; durationMs: number }
	| { ok: false; reason: "internal_token_missing"; durationMs: number }
	| { ok: false; reason: "http_error"; status: number; durationMs: number }
	| {
			ok: false;
			reason: "timeout" | "network_error";
			errorName: string;
			errorCode: string | null;
			durationMs: number;
		};

function safeErrorName(error: unknown): string {
	if (!(error instanceof Error)) return "UnknownError";
	return /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name) ? error.name : "Error";
}

function safeErrorCode(error: unknown): string | null {
	const candidates = error instanceof Error ? [error.cause, error] : [error];
	for (const candidate of candidates) {
		if (typeof candidate !== "object" || candidate === null || !("code" in candidate)) continue;
		const code = candidate.code;
		if (typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code)) return code;
	}
	return null;
}
