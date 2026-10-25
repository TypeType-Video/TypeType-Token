import { type PlaybackTraceContext, playbackTraceEvent } from "./playback-diagnostics.ts";
import type { CachedSession } from "./video-bound-po-token.ts";

const FORCED_REFRESH_COOLDOWN_MS = 30_000;

type BotGuardSessionStoreDependencies = {
	build: (trace?: PlaybackTraceContext) => Promise<CachedSession>;
	retire: (session: CachedSession) => Promise<void>;
	now?: () => number;
	forcedRefreshCooldownMs?: number;
};

export class BotGuardSessionStore {
	private current: CachedSession | null = null;
	private refreshing: Promise<CachedSession> | null = null;
	private lastRefreshAt: number | null = null;
	private readonly now: () => number;
	private readonly forcedRefreshCooldownMs: number;

	constructor(private readonly dependencies: BotGuardSessionStoreDependencies) {
		this.now = dependencies.now ?? Date.now;
		this.forcedRefreshCooldownMs =
			dependencies.forcedRefreshCooldownMs ?? FORCED_REFRESH_COOLDOWN_MS;
	}

	async get(forceRefresh = false, trace?: PlaybackTraceContext): Promise<CachedSession> {
		const usable = this.usable();
		if (usable !== null && !forceRefresh) {
			playbackTraceEvent(trace, "session.cache_hit");
			return usable;
		}
		if (this.refreshing !== null) {
			playbackTraceEvent(trace, "session.refresh.singleflight_join");
			return this.refreshing;
		}
		if (usable !== null && this.refreshedRecently()) {
			playbackTraceEvent(trace, "session.refresh.cooldown");
			return usable;
		}
		playbackTraceEvent(trace, forceRefresh ? "session.cache_bypass" : "session.cache_miss");
		return this.refresh(trace);
	}

	refresh(trace?: PlaybackTraceContext): Promise<CachedSession> {
		if (this.refreshing !== null) return this.refreshing;
		playbackTraceEvent(trace, "session.refresh.start");
		const refresh = this.dependencies
			.build(trace)
			.then((session) => {
				const previous = this.current;
				this.current = session;
				this.lastRefreshAt = this.now();
				if (previous !== null) {
					previous.retired = true;
					void this.dependencies.retire(previous);
				}
				playbackTraceEvent(trace, "session.refresh.end", { outcome: "ok" });
				return session;
			})
			.catch((error: unknown) => {
				playbackTraceEvent(trace, "session.refresh.end", {
					outcome: "error",
					errorType: error instanceof Error ? error.name : "unknown",
				});
				throw error;
			})
			.finally(() => {
				if (this.refreshing === refresh) this.refreshing = null;
			});
		this.refreshing = refresh;
		return refresh;
	}

	private refreshedRecently(): boolean {
		return (
			this.lastRefreshAt !== null && this.now() - this.lastRefreshAt < this.forcedRefreshCooldownMs
		);
	}

	private usable(): CachedSession | null {
		const session = this.current;
		if (session === null || session.context.isClosed()) return null;
		return this.now() < session.expiresAt ? session : null;
	}
}
