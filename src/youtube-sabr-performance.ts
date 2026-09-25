import {
	type PlaybackTraceContext,
	playbackTraceEvent,
	tracePlaybackPhase,
} from "./playback-diagnostics.ts";
import type { YoutubeSabrClient } from "./youtube-sabr-types.ts";

type Phase = "poToken" | "innertube" | "player" | "identityRefresh" | "sessionBuild";
type Durations = Record<Phase, number>;

export function createYoutubeSabrPerformance(
	videoId: string,
	client: YoutubeSabrClient,
	trace?: PlaybackTraceContext,
) {
	const startedAt = performance.now();
	const durations: Durations = {
		poToken: 0,
		innertube: 0,
		player: 0,
		identityRefresh: 0,
		sessionBuild: 0,
	};
	let stage: Phase | "complete" = "poToken";
	let outcome: "error" | "ok" = "error";

	return {
		async measure<T>(phase: Phase, load: () => Promise<T>): Promise<T> {
			stage = phase;
			const phaseStartedAt = performance.now();
			try {
				return await tracePlaybackPhase(trace, "sabr." + phase, load);
			} finally {
				durations[phase] += Math.round(performance.now() - phaseStartedAt);
			}
		},
		complete() {
			outcome = "ok";
			stage = "complete";
		},
		log() {
			const totalMs = Math.round(performance.now() - startedAt);
			playbackTraceEvent(trace, "sabr.session.summary", {
				outcome,
				stage,
				poTokenMs: durations.poToken,
				innertubeMs: durations.innertube,
				playerMs: durations.player,
				identityRefreshMs: durations.identityRefresh,
				sessionBuildMs: durations.sessionBuild,
				totalMs,
			});
			console.info(
				`[sabr-perf] event=youtube_session videoId=${videoId} client=${client} outcome=${outcome} stage=${stage} poTokenMs=${durations.poToken} innertubeMs=${durations.innertube} playerMs=${durations.player} identityRefreshMs=${durations.identityRefresh} sessionBuildMs=${durations.sessionBuild} totalMs=${Math.round(performance.now() - startedAt)}`,
			);
		},
	};
}
