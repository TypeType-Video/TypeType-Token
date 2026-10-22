import * as astring from "astring";
import * as meriyah from "meriyah";
import Innertube, { UniversalCache } from "youtubei.js";
import { installYoutubePlayerEvaluator } from "./youtube-player-evaluator.ts";

type YoutubeInnertube = Awaited<ReturnType<typeof Innertube.create>>;
type TvPlayerData = {
	playerId: string;
	playerJs: string;
	signatureTimestamp: number;
};
type ChallengeResult = {
	responses?: Array<{
		type: "result" | "error";
		data?: Record<string, string>;
		error?: string;
	}>;
};
type ChallengeSolver = (request: unknown) => ChallengeResult;
type TclChallengeSolver = (request: unknown) => {
	type?: string;
	results?: Record<string, string>;
	error?: string;
};
type SolverRequest = {
	type: "sig" | "n";
	challenges: string[];
};

let innertubePromise: Promise<YoutubeInnertube> | undefined;
let loadedPlayerId: string | undefined;
let tvPlayerPromise: Promise<TvPlayerData> | undefined;
let tvSolverPromise: Promise<TclChallengeSolver> | undefined;
let tvSignatureSolverPromise: Promise<ChallengeSolver> | undefined;

const TV_PAGE_URL = "https://www.youtube.com/tv";
const TV_USER_AGENT =
	"Mozilla/5.0 (Linux armeabi-v7a; Android 7.1.2; Fire OS 6.0) " +
	"Cobalt/22.lts.3.306369-gold (unlike Gecko) v8/8.8.278.8-jit gles " +
	"Starboard/13, Amazon_ATV_mediatek8695_2019/NS6294 " +
	"(Amazon, AFTMM, Wireless) com.amazon.firetv.youtube/22.3.r2.v66.0";

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

async function getTvPlayer(): Promise<TvPlayerData> {
	if (!tvPlayerPromise) {
		tvPlayerPromise = loadTvPlayer().catch((error) => {
			tvPlayerPromise = undefined;
			throw error;
		});
	}
	return tvPlayerPromise;
}

async function loadTvPlayer(): Promise<TvPlayerData> {
	const pageResponse = await fetch(TV_PAGE_URL, {
		headers: { "user-agent": TV_USER_AGENT },
	});
	if (!pageResponse.ok) {
		throw new Error(`TV page request failed: ${pageResponse.status}`);
	}
	const regularPlayerUrl = extractTvPlayerUrl(await pageResponse.text());
	if (!regularPlayerUrl) throw new Error("TV page has no player URL");
	const playerUrl = toTclPlayerUrl(regularPlayerUrl);
	const playerId = /\/s\/player\/([^/]+)\//.exec(playerUrl)?.[1];
	if (!playerId) throw new Error("TV player URL has no player id");

	const playerResponse = await fetch(playerUrl, {
		headers: { "user-agent": TV_USER_AGENT },
	});
	if (!playerResponse.ok) {
		throw new Error(`TV player request failed: ${playerResponse.status}`);
	}
	const playerJs = await playerResponse.text();
	const signatureTimestamp = Number(/signatureTimestamp:(\d+)/.exec(playerJs)?.[1] ?? 0);
	return { playerId, playerJs, signatureTimestamp };
}

async function getTvSolver(): Promise<TclChallengeSolver> {
	if (!tvSolverPromise) {
		tvSolverPromise = loadSolver<TclChallengeSolver>("tcl.solver.js", "tclSolver").catch(
			(error) => {
				tvSolverPromise = undefined;
				throw error;
			},
		);
	}
	return tvSolverPromise;
}

async function getTvSignatureSolver(): Promise<ChallengeSolver> {
	if (!tvSignatureSolverPromise) {
		tvSignatureSolverPromise = loadSolver<ChallengeSolver>("yt.solver.core.js", "jsc").catch(
			(error) => {
				tvSignatureSolverPromise = undefined;
				throw error;
			},
		);
	}
	return tvSignatureSolverPromise;
}

async function loadSolver<T>(filename: string, exportName: string): Promise<T> {
	const polyfill = await Bun.file(new URL("./vendor/polyfill.js", import.meta.url)).text();
	const source = await Bun.file(new URL(`./vendor/${filename}`, import.meta.url)).text();
	return new Function("meriyah", "astring", `${polyfill}; ${source}; return ${exportName};`)(
		meriyah,
		astring,
	) as T;
}

async function decodeTvBatch(
	player: TvPlayerData,
	signatures: string[],
	throttlingParameters: string[],
): Promise<YoutubePlayerDecodeResponse> {
	const decodedSignatures: Record<string, string> = {};
	if (signatures.length) {
		const requests: SolverRequest[] = [{ type: "sig", challenges: signatures }];
		const result = await (await getTvSignatureSolver())({
			type: "player",
			player: player.playerJs,
			requests,
			output_preprocessed_player: false,
		});
		const response = result.responses?.[0];
		if (response?.type === "result") Object.assign(decodedSignatures, response.data);
		else if (response?.error) throw new Error(response.error);
	}
	const decodedThrottlingParameters: Record<string, string> = {};
	if (throttlingParameters.length) {
		const challengeByParameter = Object.fromEntries(
			throttlingParameters.map((parameter) => [
				parameter,
				`https://www.youtube.com/videoplayback?n=${parameter}`,
			]),
		);
		const result = (await getTvSolver())({
			type: "player",
			player: player.playerJs,
			challenges: Object.values(challengeByParameter),
			output_preprocessed_player: false,
		});
		if (result.type === "error") throw new Error(result.error ?? "TCL solver failed");
		for (const parameter of throttlingParameters) {
			const decoded = result.results?.[challengeByParameter[parameter]];
			if (decoded) decodedThrottlingParameters[parameter] = decoded;
		}
	}
	return {
		playerId: player.playerId,
		signatureTimestamp: player.signatureTimestamp,
		signatures: decodedSignatures,
		throttlingParameters: decodedThrottlingParameters,
	};
}

function extractTvPlayerUrl(page: string): string | undefined {
	const value = /"player_url":"([^"]+)"/.exec(page)?.[1]?.replaceAll("\\/", "/");
	if (!value) return undefined;
	return value.startsWith("//") ? `https:${value}` : new URL(value, TV_PAGE_URL).toString();
}

function toTclPlayerUrl(playerUrl: string): string {
	return playerUrl
		.replace(
			"/tv-player-es6.vflset/tv-player-es6.js",
			"/tv-player-ias-tcl.vflset/tv-player-ias-tcl.js",
		)
		.replace(
			"/tv-player-ias.vflset/tv-player-ias.js",
			"/tv-player-ias-tcl.vflset/tv-player-ias-tcl.js",
		)
		.replace("/player_es6.vflset/en_US/base.js", "/tv-player-ias-tcl.vflset/tv-player-ias-tcl.js")
		.replace("/player_ias.vflset/en_US/base.js", "/tv-player-ias-tcl.vflset/tv-player-ias-tcl.js")
		.replace("-es6", "-ias");
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
