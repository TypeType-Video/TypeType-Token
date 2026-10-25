import type { Browser, Page } from "playwright";
import { botGuardBrowser } from "./botguard-browser.ts";
import { type BotGuardChallenge, WEB_USER_AGENT } from "./botguard-challenge.ts";
import { mintPoTokenInPage, runBotGuardInPage } from "./botguard-page-scripts.ts";

const ROUTE = "https://www.youtube.com/__bgp__";
const BLANK_HTML = "<!DOCTYPE html><html><body></body></html>";

export class BotGuardContextClosedError extends Error {
	constructor() {
		super("BotGuard context is closed");
		this.name = "BotGuardContextClosedError";
	}
}

export class BotGuardContext {
	private constructor(
		private readonly browser: Browser,
		private readonly page: Page,
	) {}

	static async open(userAgent: string = WEB_USER_AGENT): Promise<BotGuardContext> {
		const browser = await botGuardBrowser();
		const page = await browser.newPage({ userAgent });
		try {
			await page.route(ROUTE, (route) =>
				route.fulfill({ contentType: "text/html", body: BLANK_HTML }),
			);
			await page.goto(ROUTE);
		} catch (error) {
			await page.close();
			throw error;
		}
		return new BotGuardContext(browser, page);
	}

	isClosed(): boolean {
		return this.page.isClosed() || !this.browser.isConnected();
	}

	async close(): Promise<void> {
		if (!this.isClosed()) await this.page.close();
	}

	execute(challenge: BotGuardChallenge): Promise<string> {
		return this.evaluate((page) =>
			page.evaluate(runBotGuardInPage, {
				script: challenge.interpreterScript,
				prog: challenge.program,
				name: challenge.globalName,
				eventId: challenge.eventId,
			}),
		);
	}

	mint(integrityToken: string, identifier: string): Promise<string> {
		return this.evaluate((page) =>
			page.evaluate(mintPoTokenInPage, { token: integrityToken, id: identifier }),
		);
	}

	private async evaluate<T>(run: (page: Page) => Promise<T>): Promise<T> {
		if (this.isClosed()) throw new BotGuardContextClosedError();
		return run(this.page);
	}
}
