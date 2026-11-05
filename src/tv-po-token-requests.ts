import { youtubeFetch } from "./youtube-fetch.ts";

export const TV_USER_AGENT =
	"Mozilla/5.0 (SMART-TV; X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) " +
	"Chrome/90.0.4430.85 Safari/537.36";
const TV_PAGE_URL = "https://www.youtube.com/tv";
const TV_CONFIG_URL =
	"https://www.youtube.com/tv_config?action_get_config=true&client=lb4&theme=cl";
const WAA_BASE = "https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa";
const GOOG_API_KEY = "AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw";
const WAA_HEADERS: Record<string, string> = {
	"content-type": "application/json+protobuf",
	"x-goog-api-key": GOOG_API_KEY,
	"x-user-agent": "grpc-web-javascript/0.1",
	"User-Agent": TV_USER_AGENT,
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
	if (!Array.isArray(payload)) return null;
	const [integrityToken, estimatedTtlSecs, , websafeFallbackToken] = payload;
	const token = integrityToken || websafeFallbackToken;
	if (typeof token !== "string" || !token) return null;
	const ttl = typeof estimatedTtlSecs === "number" ? estimatedTtlSecs : 43_200;
	return { token, ttlSecs: ttl };
}

export type WaaChallenge = {
	program: string;
	globalName: string;
	interpreterScript: string | null;
	interpreterUrl: string | null;
};

export function parseWaaChallenge(payload: unknown): WaaChallenge | null {
	if (!Array.isArray(payload)) return null;
	let data: unknown = payload[0];
	if (typeof payload[1] === "string") {
		const bytes = Buffer.from(payload[1], "base64").map((byte) => (byte + 97) & 0xff);
		try {
			data = JSON.parse(new TextDecoder().decode(bytes));
		} catch {
			return null;
		}
	}
	if (!Array.isArray(data)) return null;
	const [, wrappedScript, wrappedUrl, , program, globalName] = data;
	if (typeof program !== "string" || typeof globalName !== "string") return null;
	return {
		program,
		globalName,
		interpreterScript: firstString(wrappedScript),
		interpreterUrl: firstString(wrappedUrl),
	};
}

function firstString(value: unknown): string | null {
	if (!Array.isArray(value)) return null;
	const found = value.find((item) => typeof item === "string" && item.length > 0);
	return typeof found === "string" ? found : null;
}

export async function fetchTvPage(): Promise<TvAppInfo> {
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

export async function fetchRequestKey(): Promise<string> {
	const response = await youtubeFetch(TV_CONFIG_URL, {
		headers: { "User-Agent": TV_USER_AGENT, "Accept-Language": "en-US,en;q=0.7" },
	});
	if (!response.ok) throw new Error(`tv config request failed: ${response.status}`);
	const key = parseRequestKey(await response.text());
	if (!key) throw new Error("tv config has no challenge request key");
	return key;
}

export async function fetchHomeEventId(): Promise<string> {
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

export async function fetchTvChallenge(requestKey: string): Promise<TvChallenge> {
	const response = await youtubeFetch(`${WAA_BASE}/Create`, {
		method: "POST",
		headers: WAA_HEADERS,
		body: JSON.stringify([requestKey]),
	});
	if (!response.ok) throw new Error(`waa create failed: ${response.status}`);
	const challenge = parseWaaChallenge(await response.json());
	if (!challenge) throw new Error("waa create returned no challenge");
	const script =
		challenge.interpreterScript ?? (await interpreterScript(challenge.interpreterUrl ?? ""));
	if (!script) throw new Error("waa challenge has no interpreter");
	return {
		program: challenge.program,
		globalName: challenge.globalName,
		interpreterScript: script,
	};
}

async function interpreterScript(url: string): Promise<string> {
	if (!url) return "";
	const absolute = url.startsWith("//") ? `https:${url}` : url;
	const response = await youtubeFetch(absolute, { headers: { "User-Agent": TV_USER_AGENT } });
	if (!response.ok) throw new Error(`tv interpreter fetch failed: ${response.status}`);
	return response.text();
}

export async function generateIntegrityToken(
	requestKey: string,
	botguardResponse: string,
): Promise<string> {
	const response = await youtubeFetch(`${WAA_BASE}/GenerateIT`, {
		method: "POST",
		headers: WAA_HEADERS,
		body: JSON.stringify([requestKey, botguardResponse]),
	});
	if (!response.ok) throw new Error(`waa generate failed: ${response.status}`);
	const parsed = parseIntegrityToken(await response.json());
	if (!parsed) throw new Error("waa generate returned no integrity token");
	return parsed.token;
}
