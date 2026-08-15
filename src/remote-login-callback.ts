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
): Promise<boolean> {
	if (!config.internalToken) return false;
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
		return response.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}
