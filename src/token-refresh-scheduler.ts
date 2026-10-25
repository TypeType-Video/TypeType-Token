type TimerHandle = { unref?: () => unknown };
type Schedule = (run: () => void, delayMs: number) => TimerHandle;

const MIN_DELAY_MS = 30_000;
const RETRY_DELAY_MS = 15_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

export type TokenRefreshSchedulerOptions = {
	label: string;
	refresh: () => Promise<number>;
	now?: () => number;
	schedule?: Schedule;
};

export class TokenRefreshScheduler {
	private failures = 0;
	private readonly now: () => number;
	private readonly schedule: Schedule;

	constructor(private readonly options: TokenRefreshSchedulerOptions) {
		this.now = options.now ?? Date.now;
		this.schedule = options.schedule ?? ((run, delayMs) => setTimeout(run, delayMs));
	}

	async run(): Promise<void> {
		const delayMs = await this.refresh();
		this.schedule(() => void this.run(), delayMs).unref?.();
	}

	private async refresh(): Promise<number> {
		try {
			const nextRefreshAt = await this.options.refresh();
			this.failures = 0;
			return Math.max(MIN_DELAY_MS, nextRefreshAt - this.now());
		} catch (error) {
			this.failures += 1;
			const delayMs = Math.min(RETRY_DELAY_MS * 2 ** (this.failures - 1), MAX_RETRY_DELAY_MS);
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[token-refresh ${this.options.label}] ${message}; retry in ${delayMs} ms`);
			return delayMs;
		}
	}
}
