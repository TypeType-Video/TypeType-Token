import type { BotGuardSessionStatus } from "../src/botguard-session-store.ts";

const IDLE_SESSION_STATUS: BotGuardSessionStatus = {
	generation: null,
	expiresAt: null,
	usable: false,
	refreshing: false,
	lastRefreshAt: null,
	lastError: null,
};

export function tokenServiceModule(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		getOrRefreshSession: async () => {
			throw new Error("getOrRefreshSession is not mocked");
		},
		fetchPoToken: async () => {
			throw new Error("fetchPoToken is not mocked");
		},
		fetchSessionPoTokens: async () => {
			throw new Error("fetchSessionPoTokens is not mocked");
		},
		keepSessionWarm: async (): Promise<number> => Date.now() + 60_000,
		sessionStatus: (): BotGuardSessionStatus => IDLE_SESSION_STATUS,
		...overrides,
	};
}
