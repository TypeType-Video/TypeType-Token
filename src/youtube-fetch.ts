const proxyUrl = process.env.YOUTUBE_OUTBOUND_PROXY_URL?.trim() || null;

export const YOUTUBE_FETCH_TIMEOUT_MS = 8000;

export async function youtubeFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
	timeoutMs = YOUTUBE_FETCH_TIMEOUT_MS,
): Promise<Response> {
	const signal = requestSignal(input, init, timeoutMs);
	if (proxyUrl === null) return fetch(input, { ...init, signal });
	const proxyInit: BunFetchRequestInit = { ...init, signal, proxy: proxyUrl };
	return fetch(input, proxyInit);
}

function requestSignal(
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	timeoutMs: number,
): AbortSignal {
	const signals = [AbortSignal.timeout(timeoutMs)];
	if (init?.signal) signals.push(init.signal);
	if (input instanceof Request) signals.push(input.signal);
	return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}
