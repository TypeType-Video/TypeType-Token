import type { Browser } from "playwright";
import { chromium } from "playwright";

let connected: Browser | null = null;
let launching: Promise<Browser> | null = null;

export async function botGuardBrowser(): Promise<Browser> {
	if (connected?.isConnected()) return connected;
	connected = null;
	if (launching === null) {
		launching = launchBrowser().finally(() => {
			launching = null;
		});
	}
	return launching;
}

export function isBotGuardBrowserConnected(): boolean {
	return connected?.isConnected() ?? false;
}

async function launchBrowser(): Promise<Browser> {
	const browser = await chromium.launch({
		headless: false,
		args: ["--disable-blink-features=AutomationControlled"],
	});
	browser.on("disconnected", () => {
		if (connected === browser) connected = null;
	});
	connected = browser;
	return browser;
}
