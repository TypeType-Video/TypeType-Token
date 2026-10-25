import { TokenRefreshScheduler } from "./token-refresh-scheduler.ts";
import { keepSessionWarm } from "./token-service.ts";
import type { TvPoTokenMinter } from "./tv-po-token.ts";

const WEB_REFRESH_LEAD_MS = 2 * 60_000;
const TV_REFRESH_LEAD_MS = 60_000;

export function startTokenWarmup(tvPoTokenMinter: TvPoTokenMinter): void {
	void new TokenRefreshScheduler({
		label: "web",
		refresh: () => keepSessionWarm(WEB_REFRESH_LEAD_MS),
	}).run();
	void new TokenRefreshScheduler({
		label: "tv",
		refresh: () => tvPoTokenMinter.keepWarm(TV_REFRESH_LEAD_MS),
	}).run();
}
