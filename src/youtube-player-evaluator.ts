import { Platform, type Types } from "youtubei.js";

export function evaluateYoutubePlayerScript(output: string): Types.EvalResult {
	return new Function(output)();
}

export function installYoutubePlayerEvaluator(): void {
	Platform.shim.eval = async (data) => evaluateYoutubePlayerScript(data.output);
}
