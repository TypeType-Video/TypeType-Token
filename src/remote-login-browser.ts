import type { Browser, Cookie } from "playwright";
import { chromium } from "playwright";
import type { RemoteLoginConfig } from "./remote-login-config.ts";

const LOGIN_URL = "https://www.youtube.com/signin";
const COOKIE_URLS = [
	"https://www.youtube.com",
	"https://accounts.google.com",
	"https://www.google.com",
];
const LOGIN_COOKIE_NAMES = new Set([
	"SID",
	"HSID",
	"SSID",
	"APISID",
	"SAPISID",
	"__Secure-1PSID",
	"__Secure-3PSID",
	"__Secure-1PAPISID",
	"__Secure-3PAPISID",
]);

let remoteBrowser: Browser | null = null;

export type RemoteLoginPage = {
	page: {
		goto: (
			url: string,
			options?: { waitUntil?: "domcontentloaded"; timeout?: number },
		) => Promise<unknown>;
		setViewportSize: (size: { width: number; height: number }) => Promise<void>;
		screenshot: (options: { type: "jpeg"; quality: number }) => Promise<Buffer>;
		mouse: {
			move: (x: number, y: number) => Promise<void>;
			down: (options?: { button?: "left" | "middle" | "right" }) => Promise<void>;
			up: (options?: { button?: "left" | "middle" | "right" }) => Promise<void>;
			wheel: (deltaX: number, deltaY: number) => Promise<void>;
		};
		keyboard: {
			down: (key: string) => Promise<void>;
			up: (key: string) => Promise<void>;
			insertText: (text: string) => Promise<void>;
		};
	};
	close: () => Promise<void>;
	cookies: () => Promise<string>;
	authUser: () => Promise<number>;
	hasLoginCookie: () => Promise<boolean>;
};

function launchArgs(config: RemoteLoginConfig): string[] {
	const args = ["--disable-dev-shm-usage"];
	if (config.disableAutomationControlled) {
		args.push("--disable-blink-features=AutomationControlled");
	}
	return args;
}

function launchOptions(config: RemoteLoginConfig): Parameters<typeof chromium.launch>[0] {
	return {
		headless: config.headless,
		args: launchArgs(config),
		...(config.browserChannel ? { channel: config.browserChannel } : {}),
		...(config.browserExecutablePath ? { executablePath: config.browserExecutablePath } : {}),
	};
}

function contextOptions(config: RemoteLoginConfig): Parameters<Browser["newContext"]>[0] {
	return {
		acceptDownloads: false,
		viewport: { width: config.viewportWidth, height: config.viewportHeight },
		deviceScaleFactor: config.deviceScaleFactor,
		userAgent: config.userAgent,
		locale: config.locale,
	};
}

async function ensureRemoteBrowser(config: RemoteLoginConfig): Promise<Browser> {
	if (remoteBrowser?.isConnected()) return remoteBrowser;
	remoteBrowser = await chromium.launch(launchOptions(config));
	return remoteBrowser;
}

function isAllowedCookie(cookie: Cookie): boolean {
	const domain = cookie.domain.toLowerCase();
	if (domain === "youtube.com" || domain.endsWith(".youtube.com")) return true;
	if (domain === "google.com" || domain.endsWith(".google.com")) return true;
	return false;
}

function isLoginCookie(cookie: Cookie): boolean {
	return isAllowedCookie(cookie) && LOGIN_COOKIE_NAMES.has(cookie.name) && cookie.value.length > 0;
}

function formatCookie(cookie: Cookie): string {
	const domain = cookie.httpOnly ? `#HttpOnly_${cookie.domain}` : cookie.domain;
	const includeSubdomains = cookie.domain.startsWith(".") ? "TRUE" : "FALSE";
	const secure = cookie.secure ? "TRUE" : "FALSE";
	const expires = cookie.expires > 0 ? Math.trunc(cookie.expires).toString() : "0";
	return [
		domain,
		includeSubdomains,
		cookie.path || "/",
		secure,
		expires,
		cookie.name,
		cookie.value,
	].join("\t");
}

function formatNetscapeCookies(cookies: Cookie[], maxBytes: number): string {
	const encoder = new TextEncoder();
	const lines = ["# Netscape HTTP Cookie File"];
	let totalBytes = encoder.encode(lines[0]).byteLength;
	for (const cookie of cookies.filter(isAllowedCookie)) {
		const next = formatCookie(cookie);
		const nextBytes = encoder.encode(next).byteLength + 1;
		if (totalBytes + nextBytes > maxBytes) break;
		totalBytes += nextBytes;
		lines.push(next);
	}
	return lines.join("\n");
}

function capturePot(url: string): string | null {
	if (!url.includes("googlevideo.com/videoplayback")) return null;
	const parsed = new URL(url);
	const pot = parsed.searchParams.get("pot");
	return pot && pot.length > 0 ? pot : null;
}

export async function createRemoteLoginPage(
	config: RemoteLoginConfig,
	onPoToken: (poToken: string) => void,
): Promise<RemoteLoginPage> {
	const browser = await ensureRemoteBrowser(config);
	const context = await browser.newContext(contextOptions(config));
	const page = await context.newPage();
	page.on("request", (request) => {
		const poToken = capturePot(request.url());
		if (poToken) onPoToken(poToken);
	});
	await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
	return {
		page,
		close: () => context.close().catch(() => undefined),
		cookies: async () =>
			formatNetscapeCookies(await context.cookies(COOKIE_URLS), config.maxCookieBytes),
		authUser: async () =>
			page.evaluate(() => {
				const ytcfg = (
					globalThis as typeof globalThis & {
						ytcfg?: { get: (key: string) => unknown };
					}
				).ytcfg;
				const value = Number(ytcfg?.get("SESSION_INDEX") ?? 0);
				return Number.isInteger(value) && value >= 0 && value <= 99 ? value : 0;
			}),
		hasLoginCookie: async () => (await context.cookies(COOKIE_URLS)).some(isLoginCookie),
	};
}

export async function probeRemoteLoginBrowser(config: RemoteLoginConfig): Promise<void> {
	const browser = await ensureRemoteBrowser(config);
	const context = await browser.newContext(contextOptions(config));
	await context.close();
}

export async function closeRemoteLoginBrowser(): Promise<void> {
	if (!remoteBrowser) return;
	await remoteBrowser.close().catch(() => undefined);
	remoteBrowser = null;
}
