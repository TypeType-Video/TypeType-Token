import { beforeAll, describe, expect, it, mock } from "bun:test";
import type { BotGuardContext as BotGuardContextType } from "../src/botguard-page.ts";
import { sharedChromium as chromium } from "./botguard-browser-fixtures.ts";
import { maxConcurrency } from "./concurrency-fixtures.ts";

mock.module("playwright", () => ({ chromium }));

const CHALLENGE = { interpreterScript: "s", program: "p", globalName: "n", eventId: "e" };
let BotGuardContext: typeof BotGuardContextType;
let isBotGuardBrowserConnected: () => boolean;

describe("BotGuard browser", () => {
	beforeAll(async () => {
		const browserModule = await import("../src/botguard-browser.ts");
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const pageModule = await import("../src/botguard-page.ts?botguard-browser-test");
		BotGuardContext = pageModule.BotGuardContext;
		isBotGuardBrowserConnected = browserModule.isBotGuardBrowserConnected;
	});

	it("launches one browser for concurrent contexts", async () => {
		for (const browser of chromium.browsers) browser.disconnect();
		const launched = chromium.browsers.length;
		const contexts = await Promise.all([BotGuardContext.open(), BotGuardContext.open()]);
		await Promise.all(contexts.map((context) => context.execute(CHALLENGE)));

		expect(chromium.browsers.length).toBe(launched + 1);
		expect(isBotGuardBrowserConnected()).toBe(true);
	});

	it("relaunches the browser after it disconnects", async () => {
		const stale = await BotGuardContext.open();
		const launched = chromium.browsers.length;
		for (const browser of chromium.browsers) browser.disconnect();
		expect(isBotGuardBrowserConnected()).toBe(false);
		expect(stale.isClosed()).toBe(true);

		const context = await BotGuardContext.open();
		await expect(context.execute(CHALLENGE)).resolves.toBe("botguard-response");
		expect(chromium.browsers.length).toBe(launched + 1);
		expect(isBotGuardBrowserConnected()).toBe(true);
	});

	it("rejects work on a closed context", async () => {
		const context = await BotGuardContext.open();
		await context.close();

		await expect(context.mint("integrity", "video")).rejects.toThrow("BotGuard context is closed");
	});

	it("closes a page whose evaluation never settles", async () => {
		const evaluate = chromium.evaluate;
		chromium.evaluate = () => new Promise<unknown>(() => undefined);
		try {
			const context = await BotGuardContext.open(undefined, 20);

			await expect(context.execute(CHALLENGE)).rejects.toThrow("BotGuard evaluation timed out");
			expect(context.isClosed()).toBe(true);
		} finally {
			chromium.evaluate = evaluate;
		}
	});

	it("runs at most four BotGuard evaluations at once", async () => {
		const evaluate = chromium.evaluate;
		const tasks = new Map<unknown, () => Promise<void>>();
		chromium.evaluate = async (_page, args) => {
			await tasks.get(args.eventId)?.();
			return "botguard-response";
		};
		try {
			const contexts = await Promise.all(
				Array.from({ length: 6 }, () => BotGuardContext.open(undefined, 5_000)),
			);
			const peak = await maxConcurrency(6, (task) => {
				const eventId = `event-${tasks.size}`;
				tasks.set(eventId, task);
				const context = contexts[tasks.size - 1];
				return context ? context.execute({ ...CHALLENGE, eventId }) : Promise.resolve();
			});

			expect(peak).toBe(4);
		} finally {
			chromium.evaluate = evaluate;
		}
	});
});
