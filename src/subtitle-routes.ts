import { fetchSubtitleContent, SubtitleFetchError } from "./subtitle-content.ts";
import { fetchSubtitles } from "./subtitles.ts";

export async function handleSubtitleRequest(req: Request, url: URL): Promise<Response | null> {
	if (req.method !== "GET") return null;
	if (url.pathname === "/subtitles") return subtitleInventory(url);
	if (url.pathname === "/subtitles/content") return subtitleContent(url);
	return null;
}

async function subtitleInventory(url: URL): Promise<Response> {
	const videoId = url.searchParams.get("videoId");
	if (!videoId) {
		return Response.json({ error: "videoId query parameter is required" }, { status: 400 });
	}
	try {
		return Response.json(await fetchSubtitles(videoId));
	} catch (error) {
		const message = error instanceof Error ? error.message : "Internal error";
		return Response.json({ error: message }, { status: 500 });
	}
}

async function subtitleContent(url: URL): Promise<Response> {
	const rawUrl = url.searchParams.get("url");
	if (!rawUrl) {
		return Response.json(
			{ error: "url query parameter is required", code: "subtitle_request_invalid" },
			{ status: 400 },
		);
	}
	try {
		const content = await fetchSubtitleContent(rawUrl);
		const body = new ArrayBuffer(content.byteLength);
		new Uint8Array(body).set(content);
		return new Response(body, {
			headers: {
				"cache-control": "private, max-age=300",
				"content-type": "text/vtt; charset=utf-8",
			},
		});
	} catch (error) {
		if (error instanceof SubtitleFetchError) {
			return Response.json({ error: error.message, code: error.code }, { status: error.status });
		}
		const message = error instanceof Error ? error.message : "Internal error";
		return Response.json(
			{ error: message, code: "subtitle_upstream_unavailable" },
			{ status: 502 },
		);
	}
}
