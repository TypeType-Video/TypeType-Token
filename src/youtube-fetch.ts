const proxyUrl = process.env.YOUTUBE_OUTBOUND_PROXY_URL?.trim() || null;

export async function youtubeFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	if (proxyUrl === null) return fetch(input, init);
	const proxyInit: BunFetchRequestInit = { ...init, proxy: proxyUrl };
	return fetch(input, proxyInit);
}
