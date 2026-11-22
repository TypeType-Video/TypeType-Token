const proxyUrl = process.env.YOUTUBE_OUTBOUND_PROXY_URL?.trim() || null;

export const YOUTUBE_FETCH_TIMEOUT_MS = 8000;

const EGRESS_HINT =
	"The token container cannot reach it: check DNS, firewall, VPN or IPv6 on the Docker host, " +
	"or set YOUTUBE_OUTBOUND_PROXY_URL.";

export class YoutubeEgressError extends Error {
	constructor(message: string, cause: unknown) {
		super(message, { cause });
		this.name = "YoutubeEgressError";
	}
}

// A bare "The operation timed out." told self-hosters nothing; the error names the host that did not answer and what
// to look at, and the server logs it as is.
export async function youtubeFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
	timeoutMs = YOUTUBE_FETCH_TIMEOUT_MS,
): Promise<Response> {
	const timeout = AbortSignal.timeout(timeoutMs);
	const signal = requestSignal(timeout, input, init);
	try {
		if (proxyUrl === null) return await fetch(input, { ...init, signal });
		const proxyInit: BunFetchRequestInit = { ...init, signal, proxy: proxyUrl };
		return await fetch(input, proxyInit);
	} catch (error) {
		if (signal.aborted && !timeout.aborted) throw error;
		throw egressError(requestHost(input), timeout.aborted, timeoutMs, error);
	}
}

function egressError(
	host: string,
	timedOut: boolean,
	timeoutMs: number,
	cause: unknown,
): YoutubeEgressError {
	const route = proxyUrl === null ? "" : " through YOUTUBE_OUTBOUND_PROXY_URL";
	const reason = (cause instanceof Error ? cause.message : String(cause)).replace(/[.?!\s]+$/, "");
	const what = timedOut
		? `No answer from ${host}${route} within ${Math.ceil(timeoutMs / 1000)} s.`
		: `Cannot reach ${host}${route}: ${reason}.`;
	return new YoutubeEgressError(`${what} ${EGRESS_HINT}`, cause);
}

function requestHost(input: RequestInfo | URL): string {
	const href = input instanceof Request ? input.url : input.toString();
	try {
		return new URL(href).host;
	} catch {
		return "YouTube";
	}
}

function requestSignal(
	timeout: AbortSignal,
	input: RequestInfo | URL,
	init: RequestInit | undefined,
): AbortSignal {
	const signals = [timeout];
	if (init?.signal) signals.push(init.signal);
	if (input instanceof Request) signals.push(input.signal);
	return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}
