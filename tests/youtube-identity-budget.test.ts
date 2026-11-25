import { describe, expect, test } from "bun:test";
import {
	isIdentityRefusal,
	REFUSAL_WINDOW_MS,
	ROTATE_AFTER_PLAYER_CALLS,
	YoutubeIdentityBudget,
} from "../src/youtube-identity-budget.ts";

describe("YoutubeIdentityBudget", () => {
	test("asks for a background renewal on every call from the limit on", () => {
		const budget = new YoutubeIdentityBudget();
		const signals: number[] = [];
		for (let call = 1; call <= ROTATE_AFTER_PLAYER_CALLS + 2; call += 1) {
			if (budget.notePlayerCall("visitor-a")) signals.push(call);
		}
		expect(signals).toEqual([
			ROTATE_AFTER_PLAYER_CALLS,
			ROTATE_AFTER_PLAYER_CALLS + 1,
			ROTATE_AFTER_PLAYER_CALLS + 2,
		]);
		expect(budget.notePlayerCall("visitor-b")).toBe(false);
	});

	test("renews after three different refused videos in a minute", () => {
		let now = 0;
		const budget = new YoutubeIdentityBudget(() => now);
		expect(budget.noteRefusal("visitor", "one")).toBe(false);
		now += 1_000;
		expect(budget.noteRefusal("visitor", "one")).toBe(false);
		expect(budget.noteRefusal("visitor", "two")).toBe(false);
		expect(budget.noteRefusal("visitor", "three")).toBe(true);
	});

	test("a success between refusals means the videos were really unavailable", () => {
		const budget = new YoutubeIdentityBudget(() => 0);
		budget.noteRefusal("visitor", "one");
		budget.noteRefusal("visitor", "two");
		budget.noteSuccess("visitor");
		expect(budget.noteRefusal("visitor", "three")).toBe(false);
	});

	test("old refusals fall out of the window", () => {
		let now = 0;
		const budget = new YoutubeIdentityBudget(() => now);
		budget.noteRefusal("visitor", "one");
		budget.noteRefusal("visitor", "two");
		now += REFUSAL_WINDOW_MS + 1;
		expect(budget.noteRefusal("visitor", "three")).toBe(false);
	});

	test("refusals are counted per identity", () => {
		const budget = new YoutubeIdentityBudget(() => 0);
		budget.noteRefusal("old", "one");
		budget.noteRefusal("old", "two");
		expect(budget.noteRefusal("new", "three")).toBe(false);
	});

	test("keeps counters for the last identities only", () => {
		const budget = new YoutubeIdentityBudget();
		for (let call = 1; call < ROTATE_AFTER_PLAYER_CALLS; call += 1) budget.notePlayerCall("first");
		for (let identity = 0; identity < 8; identity += 1) budget.notePlayerCall(`other-${identity}`);
		expect(budget.notePlayerCall("first")).toBe(false);
	});

	test("only an unavailable answer counts as a refusal", () => {
		expect(isIdentityRefusal("UNPLAYABLE", "Video unavailable")).toBe(true);
		expect(isIdentityRefusal("UNPLAYABLE", "This video is unavailable")).toBe(true);
		expect(isIdentityRefusal("LOGIN_REQUIRED", "Sign in to confirm your age")).toBe(false);
		expect(isIdentityRefusal("UNPLAYABLE", "This live event will begin in a few moments.")).toBe(
			false,
		);
		expect(isIdentityRefusal("ERROR", "Video unavailable")).toBe(false);
		expect(isIdentityRefusal("OK")).toBe(false);
	});
});
