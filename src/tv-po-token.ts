import type { BotGuardChallenge } from "./botguard-challenge.ts";
import { BotGuardContext } from "./botguard-page.ts";
import { youtubeFetch } from "./youtube-fetch.ts";

const TV_USER_AGENT =
	"Mozilla/5.0 (SMART-TV; X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) " +
	"Chrome/90.0.4430.85 Safari/537.36";
const TV_PAGE_URL = "https://www.youtube.com/tv";
const TV_CONFIG_URL =
	"https://www.youtube.com/tv_config?action_get_config=true&client=lb4&theme=cl";
const WAA_BASE = "https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa";
const GOOG_API_KEY = "AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw";
const TTL_MS = 10 * 60_000;

export type TvPoToken = {
	poToken: string;
	visitorData: string;
	livingRoomPoTokenId: string;
	expiresAt: number;
};

export type TvAppInfo = {
	livingRoomPoTokenId: string;
	visitorData: string;
	eventId: string;
};

export type TvChallenge = {
	program: string;
	globalName: string;
	interpreterScript: string;
};

export function parseTvAppInfo(html: string): TvAppInfo | null {
	const id = /"LIVING_ROOM_PO_TOKEN_ID":"(.*?)"/.exec(html)?.[1]?.replaceAll("\\u003d", "=");
	const visitorData = /"visitorData":"(.*?)"/.exec(html)?.[1];
	const eventId = /"EVENT_ID":"(.*?)"/.exec(html)?.[1];
	return id && visitorData && eventId ? { livingRoomPoTokenId: id, visitorData, eventId } : null;
}

export function parseRequestKey(config: string): string | null {
	return /"challengeRequestKey":"(.*?)"/.exec(config)?.[1] ?? null;
}

export function parseTvChallenge(config: string): TvChallenge | null {
	const params = /"challengeParams":\{"R":"(.*?[^\\])","T"/s.exec(config)?.[1];
	if (!params) return null;
	try {
		const challenge = JSON.parse(`{"challenge":"${params}"}`).challenge as string;
		const background = JSON.parse(challenge).bgChallenge as {
			program?: unknown;
			globalName?: unknown;
			interpreterJavascript?: Record<string, unknown>;
		};
		const program = background.program;
		const globalName = background.globalName;
		const interpreterScript =
			background.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
		if (typeof program !== "string" || typeof globalName !== "string") return null;
		if (typeof interpreterScript !== "string" || !interpreterScript) return null;
		return { program, globalName, interpreterScript };
	} catch {
		return null;
	}
}

export function parseIntegrityToken(payload: unknown): { token: string; ttlSecs: number } | null {
	if (!payload || typeof payload !== "object") return null;
	const record = payload as Record<string, unknown>;
	const token = record.integrityToken ?? record.websafeFallbackToken;
	if (typeof token !== "string" || !token) return null;
	const ttl = typeof record.estimatedTtlSecs === "number" ? record.estimatedTtlSecs : 43_200;
	return { token, ttlSecs: ttl };
}

async function fetchTvPage(): Promise<TvAppInfo> {
	const response = await youtubeFetch(TV_PAGE_URL, {
		headers: {
			"User-Agent": TV_USER_AGENT,
			Accept: "text/html,application/xhtml+xml",
			"Accept-Language": "en-US,en;q=0.7",
		},
	});
	if (!response.ok) throw new Error(`tv page request failed: ${response.status}`);
	const info = parseTvAppInfo(await response.text());
	if (!info) throw new Error("tv page has no living room token id");
	return info;
}

async function fetchRequestKey(): Promise<string> {
	const response = await youtubeFetch(TV_CONFIG_URL, {
		headers: { "User-Agent": TV_USER_AGENT, "Accept-Language": "en-US,en;q=0.7" },
	});
	if (!response.ok) throw new Error(`tv config request failed: ${response.status}`);
	const key = parseRequestKey(await response.text());
	if (!key) throw new Error("tv config has no challenge request key");
	return key;
}

async function fetchHomeEventId(): Promise<string> {
	const response = await youtubeFetch("https://www.youtube.com/", {
		headers: {
			"User-Agent": TV_USER_AGENT,
			Accept: "text/html,application/xhtml+xml",
			"Accept-Language": "en-US,en;q=0.7",
		},
	});
	if (!response.ok) throw new Error(`home page request failed: ${response.status}`);
	const eventId = /"EVENT_ID":"(.*?)"/.exec(await response.text())?.[1];
	if (!eventId) throw new Error("home page has no EVENT_ID");
	return eventId;
}

async function fetchTvChallenge(requestKey: string): Promise<TvChallenge> {
	const response = await youtubeFetch(`${WAA_BASE}/Create?key=${GOOG_API_KEY}`, {
		method: "POST",
		headers: { "content-type": "application/json", "User-Agent": TV_USER_AGENT },
		body: JSON.stringify({ requestKey }),
	});
	if (!response.ok) throw new Error(`waa create failed: ${response.status}`);
	const payload = (await response.json()) as {
		challenge?: {
			program?: unknown;
			globalName?: unknown;
			interpreterJavascript?: Record<string, unknown>;
			interpreterUrl?: Record<string, unknown>;
		};
	};
	const challenge = payload.challenge;
	const program = challenge?.program;
	const globalName = challenge?.globalName;
	const embedded = challenge?.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
	if (typeof program !== "string" || typeof globalName !== "string") {
		throw new Error("waa create returned no challenge");
	}
	const script =
		typeof embedded === "string" && embedded
			? embedded
			: await interpreterScript(
					String(
						challenge?.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue ?? "",
					),
				);
	if (!script) throw new Error("waa challenge has no interpreter");
	return { program, globalName, interpreterScript: script };
}

async function interpreterScript(url: string): Promise<string> {
	if (!url) return "";
	const absolute = url.startsWith("//") ? `https:${url}` : url;
	const response = await youtubeFetch(absolute, { headers: { "User-Agent": TV_USER_AGENT } });
	if (!response.ok) throw new Error(`tv interpreter fetch failed: ${response.status}`);
	return response.text();
}

async function generateIntegrityToken(
	requestKey: string,
	botguardResponse: string,
): Promise<string> {
	const response = await youtubeFetch(`${WAA_BASE}/GenerateIT?key=${GOOG_API_KEY}`, {
		method: "POST",
		headers: { "content-type": "application/json", "User-Agent": TV_USER_AGENT },
		body: JSON.stringify({ requestKey, botguardResponse }),
	});
	if (!response.ok) throw new Error(`waa generate failed: ${response.status}`);
	const parsed = parseIntegrityToken(await response.json());
	if (!parsed) throw new Error("waa generate returned no integrity token");
	return parsed.token;
}

async function mintInContext(
	challenge: BotGuardChallenge,
	requestKey: string,
	livingRoomPoTokenId: string,
): Promise<string> {
	const context = await BotGuardContext.open(TV_USER_AGENT);
	try {
		const botguardResponse = await context.execute(challenge);
		const integrityToken = await generateIntegrityToken(requestKey, botguardResponse);
		return await context.mint(integrityToken, livingRoomPoTokenId);
	} finally {
		await context.close();
	}
}

export class TvPoTokenMinter {
	private cached: TvPoToken | null = null;
	private inflight: Promise<TvPoToken> | null = null;

	async get(now = Date.now()): Promise<TvPoToken> {
		if (this.cached && this.cached.expiresAt > now) return this.cached;
		if (this.inflight) return this.inflight;
		this.inflight = this.mint(now).finally(() => {
			this.inflight = null;
		});
		return this.inflight;
	}

	private async mint(now: number): Promise<TvPoToken> {
		const [appInfo, requestKey, eventId] = await Promise.all([
			fetchTvPage(),
			fetchRequestKey(),
			fetchHomeEventId(),
		]);
		const challenge = await fetchTvChallenge(requestKey);
		const poToken = await mintInContext(
			{ ...challenge, eventId },
			requestKey,
			appInfo.livingRoomPoTokenId,
		);
		if (!poToken) throw new Error("tv poToken minting returned an empty token");
		const value: TvPoToken = {
			poToken,
			visitorData: appInfo.visitorData,
			livingRoomPoTokenId: appInfo.livingRoomPoTokenId,
			expiresAt: now + TTL_MS,
		};
		this.cached = value;
		return value;
	}
}
