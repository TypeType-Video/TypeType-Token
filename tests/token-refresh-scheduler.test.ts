import { describe, expect, it } from "bun:test";
import { TokenRefreshScheduler } from "../src/token-refresh-scheduler.ts";

function scheduler(outcomes: Array<number | Error>): {
	delays: number[];
	run: () => Promise<void>;
} {
	const delays: number[] = [];
	const pending: Array<() => void> = [];
	const instance = new TokenRefreshScheduler({
		label: "test",
		now: () => 0,
		refresh: async () => {
			const outcome = outcomes.shift();
			if (outcome instanceof Error) throw outcome;
			return outcome ?? 0;
		},
		schedule: (run, delayMs) => {
			delays.push(delayMs);
			pending.push(run);
			return {};
		},
	});
	return {
		delays,
		run: async () => {
			await instance.run();
			for (let index = 1; index < 4 && pending.length > 0; index += 1) {
				pending.shift();
				await instance.run();
			}
		},
	};
}

describe("token refresh scheduler", () => {
	it("schedules the next refresh at the returned time", async () => {
		const { delays, run } = scheduler([3_600_000, 7_200_000, 10, 20]);
		await run();

		expect(delays).toEqual([3_600_000, 7_200_000, 30_000, 30_000]);
	});

	it("backs off after failures and resets after a success", async () => {
		const failure = new Error("bot check");
		const { delays, run } = scheduler([failure, failure, 600_000, failure]);
		await run();

		expect(delays).toEqual([15_000, 30_000, 600_000, 15_000]);
	});
});
