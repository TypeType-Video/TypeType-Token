import type { Browser, Page } from "playwright";
import { botGuardBrowser } from "./botguard-browser.ts";
import { type BotGuardChallenge, WEB_USER_AGENT } from "./botguard-challenge.ts";
import { mintPoTokenInPage, runBotGuardInPage } from "./botguard-page-scripts.ts";
import { Semaphore } from "./semaphore.ts";
import { TimeoutError, withTimeout } from "./with-timeout.ts";

const ROUTE = "https://www.youtube.com/__bgp__";
const BLANK_HTML = "<!DOCTYPE html><html><body></body></html>";
const EVALUATE_TIMEOUT_MS = 15_000;
const evaluations = new Semaphore(4);

export class BotGuardContextClosedError extends Error {
	constructor() {
		super("BotGuard context is closed");
		this.name = "BotGuardContextClosedError";
	}
}

export type BotGuardContextOpener = (userAgent?: string) => Promise<BotGuardContext>;

export class BotGuardContext {
	private constructor(
		private readonly browser: Browser,
		private readonly page: Page,
		private readonly evaluateTimeoutMs: number,
	) {}

	static async open(
		userAgent: string = WEB_USER_AGENT,
		evaluateTimeoutMs = EVALUATE_TIMEOUT_MS,
	): Promise<BotGuardContext> {
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
		return new BotGuardContext(browser, page, evaluateTimeoutMs);
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

	private evaluate<T>(run: (page: Page) => Promise<T>): Promise<T> {
		return evaluations.run(() => this.evaluateNow(run));
	}

	private async evaluateNow<T>(run: (page: Page) => Promise<T>): Promise<T> {
		if (this.isClosed()) throw new BotGuardContextClosedError();
		try {
			return await withTimeout(
				run(this.page),
				this.evaluateTimeoutMs,
				"BotGuard evaluation timed out",
			);
		} catch (error) {
			if (error instanceof TimeoutError) await this.close();
			throw error;
		}
	}
}
