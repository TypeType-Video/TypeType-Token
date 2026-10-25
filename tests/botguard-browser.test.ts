import { beforeAll, describe, expect, it, mock } from "bun:test";
import { FakeChromium } from "./botguard-browser-fixtures.ts";

const chromium = new FakeChromium();
mock.module("playwright", () => ({ chromium }));

let executeBotGuard: (
	script: string,
	program: string,
	name: string,
	eventId: string,
) => Promise<string>;
let isBotGuardBrowserConnected: () => boolean;

describe("BotGuard browser", () => {
	beforeAll(async () => {
		const browserModule = await import("../src/botguard-browser.ts");
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const pageModule = await import("../src/botguard-page.ts?botguard-browser-test");
		executeBotGuard = pageModule.executeBotGuard;
		isBotGuardBrowserConnected = browserModule.isBotGuardBrowserConnected;
	});

	it("launches one browser for concurrent evaluations", async () => {
		await Promise.all([executeBotGuard("s", "p", "n", "e"), executeBotGuard("s", "p", "n", "e")]);

		expect(chromium.browsers.length).toBe(1);
		expect(isBotGuardBrowserConnected()).toBe(true);
	});

	it("relaunches the browser after it disconnects", async () => {
		const launched = chromium.browsers.length;
		for (const browser of chromium.browsers) browser.disconnect();
		expect(isBotGuardBrowserConnected()).toBe(false);

		await expect(executeBotGuard("s", "p", "n", "e")).resolves.toBe("evaluated");
		expect(chromium.browsers.length).toBe(launched + 1);
		expect(isBotGuardBrowserConnected()).toBe(true);
	});
});
