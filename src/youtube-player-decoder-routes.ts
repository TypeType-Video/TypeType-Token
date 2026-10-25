import { Semaphore } from "./semaphore.ts";
import {
	decodeYoutubePlayerBatch,
	type YoutubePlayerDecodeRequest,
	type YoutubePlayerDecodeResponse,
} from "./youtube-player-decoder.ts";

const CONCURRENT_DECODES = 2;

type Decode = (request: YoutubePlayerDecodeRequest) => Promise<YoutubePlayerDecodeResponse>;

export function createYoutubePlayerDecoderRoutes(
	decode: Decode = decodeYoutubePlayerBatch,
): (req: Request, url: URL) => Promise<Response | null> {
	const decodes = new Semaphore(CONCURRENT_DECODES);
	return async (req, url) => {
		if (req.method !== "POST" || url.pathname !== "/youtube/player/decoder") return null;
		try {
			const body = (await req.json().catch(() => ({}))) as YoutubePlayerDecodeRequest;
			return Response.json(await decodes.run(() => decode(body)));
		} catch (error) {
			const message = error instanceof Error ? error.message : "Internal error";
			return Response.json({ error: message }, { status: 500 });
		}
	};
}
