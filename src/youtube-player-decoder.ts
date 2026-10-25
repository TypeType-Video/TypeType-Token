import Innertube, { UniversalCache } from "youtubei.js";
import { installYoutubePlayerEvaluator } from "./youtube-player-evaluator.ts";
import { decodeTvBatch } from "./youtube-tv-decoder.ts";
import { getTvPlayer } from "./youtube-tv-player.ts";

type YoutubeInnertube = Awaited<ReturnType<typeof Innertube.create>>;
let innertubePromise: Promise<YoutubeInnertube> | undefined;
let loadedPlayerId: string | undefined;

export type YoutubePlayerDecodeRequest = {
	playerId?: string;
	clientName?: string;
	signatures?: string[];
	throttlingParameters?: string[];
};

export type YoutubePlayerDecodeResponse = {
	playerId: string;
	signatureTimestamp: number;
	signatures: Record<string, string>;
	throttlingParameters: Record<string, string>;
};

function safeValues(values: string[] | undefined): string[] {
	return Array.isArray(values) ? values.filter((value) => typeof value === "string") : [];
}

async function getInnertube(playerId: string | undefined): Promise<YoutubeInnertube> {
	installYoutubePlayerEvaluator();
	if (playerId && loadedPlayerId && playerId !== loadedPlayerId) {
		innertubePromise = undefined;
		loadedPlayerId = undefined;
	}
	const pending = innertubePromise ?? Innertube.create({ cache: new UniversalCache(true) });
	innertubePromise = pending;
	try {
		const innertube = await pending;
		loadedPlayerId = innertube.session.player?.player_id;
		return innertube;
	} catch (error) {
		if (innertubePromise === pending) innertubePromise = undefined;
		throw error;
	}
}

export async function decodeYoutubePlayerBatch(
	request: YoutubePlayerDecodeRequest,
): Promise<YoutubePlayerDecodeResponse> {
	const signatures = safeValues(request.signatures);
	const throttlingParameters = safeValues(request.throttlingParameters);
	if (request.clientName === "TVHTML5") {
		return decodeTvBatch(await getTvPlayer(), signatures, throttlingParameters);
	}
	const player = (await getInnertube(request.playerId)).session.player;
	if (!player) throw new Error("YouTube player is unavailable");
	const decodedSignatures: Record<string, string> = {};
	const decodedThrottlingParameters: Record<string, string> = {};
	for (const signature of signatures) {
		const cipher = new URLSearchParams({
			url: "https://example.com/videoplayback",
			sp: "sig",
			s: signature,
		}).toString();
		const deciphered = new URL(await player.decipher(undefined, cipher, undefined, new Map()));
		const value = deciphered.searchParams.get("sig");
		if (value) decodedSignatures[signature] = value;
	}
	for (const throttlingParameter of throttlingParameters) {
		const url = `https://example.com/videoplayback?n=${encodeURIComponent(throttlingParameter)}`;
		const deciphered = new URL(await player.decipher(url, undefined, undefined, new Map()));
		const value = deciphered.searchParams.get("n");
		if (value) decodedThrottlingParameters[throttlingParameter] = value;
	}
	return {
		playerId: player.player_id,
		signatureTimestamp: player.signature_timestamp,
		signatures: decodedSignatures,
		throttlingParameters: decodedThrottlingParameters,
	};
}
