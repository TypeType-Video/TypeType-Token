import * as astring from "astring";
import * as meriyah from "meriyah";
import type { YoutubePlayerDecodeResponse } from "./youtube-player-decoder.ts";
import type { TvPlayerData } from "./youtube-tv-player.ts";

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

let tvSolverPromise: Promise<TclChallengeSolver> | undefined;
let tvSignatureSolverPromise: Promise<ChallengeSolver> | undefined;

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

export async function decodeTvBatch(
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
