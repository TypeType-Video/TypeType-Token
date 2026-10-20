import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import { WEB_USER_AGENT } from "./botguard-challenge.ts";

const ROUTE = "https://www.youtube.com/__bgp__";
const BLANK_HTML = "<!DOCTYPE html><html><body></body></html>";

let browser: Browser | null = null;
const pages = new Map<string, Page>();

async function ensurePage(userAgent: string = WEB_USER_AGENT): Promise<Page> {
	if (!browser) {
		browser = await chromium.launch({
			headless: false,
			args: ["--disable-blink-features=AutomationControlled"],
		});
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

type BotGuardArgs = { script: string; prog: string; name: string; eventId: string };
type MintArgs = { token: string; id: string };
type PoTokenMinter = (id: Uint8Array) => Uint8Array | Promise<Uint8Array>;
type PoTokenGlobal = Record<string, unknown> & {
	__wpo?: unknown[];
	__poTokenMinter?: PoTokenMinter;
	__poTokenMinterIntegrityToken?: string;
};

export async function executeBotGuard(
	interpreterScript: string,
	program: string,
	globalName: string,
	eventId: string,
	userAgent?: string,
): Promise<string> {
	const p = await ensurePage(userAgent);
	return p.evaluate(
		async (args: BotGuardArgs): Promise<string> => {
			const root = globalThis as Record<string, unknown>;
			let yt = root.yt as Record<string, unknown> | undefined;
			if (!yt) {
				yt = {};
				root.yt = yt;
			}
			let config = yt.config_ as Record<string, unknown> | undefined;
			if (!config) {
				config = {};
				yt.config_ = config;
			}
			config.EVENT_ID = args.eventId;
			new Function(args.script)();
			const g = globalThis as unknown as Record<
				string,
				Record<string, (...a: unknown[]) => unknown>
			>;
			const vm = g[args.name];
			if (!vm?.a) throw new Error("BotGuard VM not found");

			let asyncSnapshotFn: ((...a: unknown[]) => void) | undefined;
			const wpo: unknown[] = [];
			const noOp = () => undefined;
			const loggerFunctions = [noOp, noOp, noOp, noOp, noOp];

			vm.a(
				args.prog,
				(af: (...a: unknown[]) => void) => {
					asyncSnapshotFn = af;
				},
				true,
				undefined,
				noOp,
				[[], []],
				undefined,
				false,
				loggerFunctions,
			);

			const af = await new Promise<(...a: unknown[]) => void>((resolve, reject) => {
				let n = 0;
				const id = setInterval(() => {
					if (asyncSnapshotFn) {
						clearInterval(id);
						resolve(asyncSnapshotFn);
					} else if (++n > 10000) {
						clearInterval(id);
						reject(new Error("asyncSnapshotFunction timed out"));
					}
				}, 1);
			});

			(globalThis as Record<string, unknown>).__wpo = wpo;

			return new Promise<string>((resolve) => {
				af((r: unknown) => resolve(r as string), [undefined, undefined, wpo, undefined]);
			});
		},
		{ script: interpreterScript, prog: program, name: globalName, eventId },
	);
}

export async function mintPoToken(
	integrityToken: string,
	identifier: string,
	userAgent?: string,
): Promise<string> {
	const p = await ensurePage(userAgent);
	return p.evaluate(
		async (args: MintArgs): Promise<string> => {
			const g = globalThis as PoTokenGlobal;
			let mintFn = g.__poTokenMinter;
			if (!mintFn || g.__poTokenMinterIntegrityToken !== args.token) {
				const getMinter = g.__wpo?.[0] as
					| ((bytes: Uint8Array) => PoTokenMinter | Promise<PoTokenMinter>)
					| undefined;
				if (!getMinter) throw new Error("PMD:Undefined");

				const b64 = args.token.replace(/-/g, "+").replace(/_/g, "/").replace(/\./g, "=");
				const tokenBytes = Uint8Array.from(
					atob(b64)
						.split("")
						.map((c) => c.charCodeAt(0)),
				);
				const created = await getMinter(tokenBytes);
				if (!(created instanceof Function)) throw new Error("APF:Failed");
				mintFn = created as PoTokenMinter;
				g.__poTokenMinter = mintFn;
				g.__poTokenMinterIntegrityToken = args.token;
			}

			const result = await mintFn(new TextEncoder().encode(args.id));
			if (!(result instanceof Uint8Array)) throw new Error("ODM:Invalid");

			let bin = "";
			for (let i = 0; i < result.length; i++) bin += String.fromCharCode(result[i]);
			return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
		},
		{ token: integrityToken, id: identifier },
	);
}

export async function resetBotGuardPage(): Promise<void> {
	for (const active of pages.values()) {
		if (!active.isClosed()) await active.close();
	}
	pages.clear();
}
