export type PlaybackTraceContext = Readonly<{
	traceId: string;
	requestId: string | null;
}>;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export function playbackTraceFromRequest(req: Request): PlaybackTraceContext | null {
	const traceId = req.headers.get("X-Playback-Trace-ID");
	if (!traceId || !REQUEST_ID_PATTERN.test(traceId)) return null;
	const requestId = req.headers.get("X-Request-ID");
	return {
		traceId,
		requestId: requestId && REQUEST_ID_PATTERN.test(requestId) ? requestId : null,
	};
}

export function playbackTraceEvent(
	context: PlaybackTraceContext | null | undefined,
	event: string,
	fields: Record<string, string | number | boolean | null> = {},
): void {
	if (!context) return;
	console.info(
		"[playback_trace] " +
			JSON.stringify({
				service: "token",
				traceId: context.traceId,
				requestId: context.requestId ?? "unknown",
				event,
				...fields,
			}),
	);
}

export async function tracePlaybackPhase<T>(
	context: PlaybackTraceContext | null | undefined,
	phase: string,
	load: () => Promise<T>,
): Promise<T> {
	if (!context) return load();
	const startedAt = performance.now();
	playbackTraceEvent(context, "phase.start", { phase });
	try {
		const result = await load();
		playbackTraceEvent(context, "phase.end", {
			phase,
			outcome: "ok",
			durationMs: Math.round(performance.now() - startedAt),
		});
		return result;
	} catch (error) {
		playbackTraceEvent(context, "phase.end", {
			phase,
			outcome: "error",
			errorType: error instanceof Error ? error.name : "unknown",
			durationMs: Math.round(performance.now() - startedAt),
		});
		throw error;
	}
}

export async function tracePlaybackRequest(
	context: PlaybackTraceContext | null,
	operation: string,
	load: () => Promise<Response>,
): Promise<Response> {
	if (!context) return load();
	const startedAt = performance.now();
	playbackTraceEvent(context, "request.start", { operation });
	try {
		const response = await load();
		playbackTraceEvent(context, "request.end", {
			operation,
			status: response.status,
			outcome: response.ok ? "ok" : "http_error",
			durationMs: Math.round(performance.now() - startedAt),
		});
		return response;
	} catch (error) {
		playbackTraceEvent(context, "request.end", {
			operation,
			outcome: "error",
			errorType: error instanceof Error ? error.name : "unknown",
			durationMs: Math.round(performance.now() - startedAt),
		});
		throw error;
	}
}
