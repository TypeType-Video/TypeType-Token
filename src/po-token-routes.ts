import { fetchPoToken, fetchSessionPoTokens } from "./token-service.ts";
import { playbackTraceFromRequest, tracePlaybackRequest } from "./playback-diagnostics.ts";

export async function handlePoTokenRequest(req: Request, url: URL): Promise<Response | null> {
	if (req.method === "GET" && url.pathname === "/potoken") {
		const trace = playbackTraceFromRequest(req);
		return tracePlaybackRequest(trace, "potoken.video", async () => {
			const videoId = url.searchParams.get("videoId");
			if (!videoId) {
				return Response.json({ error: "videoId query parameter is required" }, { status: 400 });
			}
			return tokenResponse(() =>
				fetchPoToken(
					videoId,
					url.searchParams.get("refresh") === "true",
					url.searchParams.get("refreshVideo") === "true",
					trace ?? undefined,
				),
			);
		});
	}
	if (req.method !== "POST" || url.pathname !== "/potoken/session") return null;
	const trace = playbackTraceFromRequest(req);
	return tracePlaybackRequest(trace, "potoken.session", async () => {
		const body = (await req.json().catch(() => null)) as {
			videoId?: unknown;
			sessionBinding?: unknown;
			refreshVideo?: unknown;
		} | null;
		const videoId = normalizedString(body?.videoId, 128);
		const sessionBinding = normalizedString(body?.sessionBinding, 4096);
		if (!videoId || !sessionBinding) {
			return Response.json({ error: "videoId and sessionBinding are required" }, { status: 400 });
		}
		return tokenResponse(() =>
			fetchSessionPoTokens(
				videoId,
				sessionBinding,
				body?.refreshVideo === true,
				trace ?? undefined,
			),
		);
	});
}

function normalizedString(value: unknown, maxLength: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized && normalized.length <= maxLength ? normalized : null;
}

async function tokenResponse(load: () => Promise<unknown>): Promise<Response> {
	try {
		return Response.json(await load());
	} catch (error) {
		const message = error instanceof Error ? error.message : "Internal error";
		return Response.json({ error: message }, { status: 500 });
	}
}
