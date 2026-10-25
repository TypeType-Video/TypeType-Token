import { decodeYoutubePlayerBatch } from "./youtube-player-decoder.ts";

export async function handleYoutubePlayerDecoderRequest(
	req: Request,
	url: URL,
): Promise<Response | null> {
	if (req.method !== "POST" || url.pathname !== "/youtube/player/decoder") return null;
	try {
		const body = (await req.json().catch(() => ({}))) as Parameters<
			typeof decodeYoutubePlayerBatch
		>[0];
		return Response.json(await decodeYoutubePlayerBatch(body));
	} catch (error) {
		const message = error instanceof Error ? error.message : "Internal error";
		return Response.json({ error: message }, { status: 500 });
	}
}
