export async function tvResponse(url: string): Promise<Response> {
	if (url.includes("/GenerateIT")) return Response.json(["tv-integrity", 43_200, 21_600]);
	if (url.includes("/Create")) return Response.json([["message", ["s"], null, "hash", "p", "g"]]);
	if (url.includes("tv_config")) return new Response('{"challengeRequestKey":"request-key"}');
	if (url.endsWith("/tv")) {
		return new Response(
			'{"EVENT_ID":"tv-event","LIVING_ROOM_PO_TOKEN_ID":"living-room","visitorData":"tv-visitor"}',
		);
	}
	return new Response('{"EVENT_ID":"home-event"}');
}

export function stubTvFetch(): () => void {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL) =>
		tvResponse(String(input))) as unknown as typeof fetch;
	return () => {
		globalThis.fetch = originalFetch;
	};
}
