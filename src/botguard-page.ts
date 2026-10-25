import type { Browser, Page } from "playwright";
import { botGuardBrowser } from "./botguard-browser.ts";
import { WEB_USER_AGENT } from "./botguard-challenge.ts";
import { mintPoTokenInPage, runBotGuardInPage } from "./botguard-page-scripts.ts";

const ROUTE = "https://www.youtube.com/__bgp__";
const BLANK_HTML = "<!DOCTYPE html><html><body></body></html>";

let pagesBrowser: Browser | null = null;
const pages = new Map<string, Page>();

async function ensurePage(userAgent: string = WEB_USER_AGENT): Promise<Page> {
	const browser = await botGuardBrowser();
	if (pagesBrowser !== browser) {
		pages.clear();
		pagesBrowser = browser;
	}
	let active = pages.get(userAgent);
	if (!active || active.isClosed()) {
		active = await browser.newPage({ userAgent });
		await active.route(ROUTE, (route) =>
			route.fulfill({ contentType: "text/html", body: BLANK_HTML }),
		);
		await active.goto(ROUTE);
		pages.set(userAgent, active);
	}
	return active;
}

export async function executeBotGuard(
	interpreterScript: string,
	program: string,
	globalName: string,
	eventId: string,
	userAgent?: string,
): Promise<string> {
	const p = await ensurePage(userAgent);
	return p.evaluate(runBotGuardInPage, {
		script: interpreterScript,
		prog: program,
		name: globalName,
		eventId,
	});
}

export async function mintPoToken(
	integrityToken: string,
	identifier: string,
	userAgent?: string,
): Promise<string> {
	const p = await ensurePage(userAgent);
	return p.evaluate(mintPoTokenInPage, { token: integrityToken, id: identifier });
}

export async function resetBotGuardPage(): Promise<void> {
	for (const active of pages.values()) {
		if (!active.isClosed()) await active.close();
	}
	pages.clear();
}
