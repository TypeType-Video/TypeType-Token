import { describe, expect, it } from "bun:test";
import { Semaphore } from "../src/semaphore.ts";
import { maxConcurrency } from "./concurrency-fixtures.ts";

describe("semaphore", () => {
	it("runs at most the limit at once and completes every task", async () => {
		const semaphore = new Semaphore(2);

		expect(await maxConcurrency(5, (task) => semaphore.run(task))).toBe(2);
	});

	it("releases its slot when a task fails", async () => {
		const semaphore = new Semaphore(1);

		await expect(semaphore.run(async () => Promise.reject(new Error("boom")))).rejects.toThrow(
			"boom",
		);
		await expect(semaphore.run(async () => "next")).resolves.toBe("next");
	});
});
