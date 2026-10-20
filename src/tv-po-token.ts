import { executeBotGuard, mintPoToken } from "./botguard-page.ts";
import { youtubeFetch } from "./youtube-fetch.ts";

const TV_USER_AGENT =
	"Mozilla/5.0 (SMART-TV; X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) " +
	"Chrome/90.0.4430.85 Safari/537.36";
const TV_PAGE_URL = "https://www.youtube.com/tv";
const TV_CONFIG_URL =
	"https://www.youtube.com/tv_config?action_get_config=true&client=lb4&theme=cl";
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
};

export type TvChallenge = {
	program: string;
	globalName: string;
	interpreterUrl: string;
};

export function parseTvAppInfo(html: string): TvAppInfo | null {
	const id = /"LIVING_ROOM_PO_TOKEN_ID":"(.*?)"/.exec(html)?.[1]?.replaceAll("\\u003d", "=");
	const visitorData = /"visitorData":"(.*?)"/.exec(html)?.[1];
	return id && visitorData ? { livingRoomPoTokenId: id, visitorData } : null;
}

export function parseTvChallenge(config: string): TvChallenge | null {
	const params = /"challengeParams":\{"R":"(.*?[^\\])","T"/s.exec(config)?.[1];
	if (!params) return null;
	try {
		const challenge = JSON.parse(`{"challenge":"${params}"}`).challenge as string;
		const background = JSON.parse(challenge).bgChallenge as {
			program?: unknown;
			globalName?: unknown;
			interpreterUrl?: Record<string, unknown>;
		};
		const program = background.program;
		const globalName = background.globalName;
		const interpreterUrl =
			background.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
		if (typeof program !== "string" || typeof globalName !== "string") return null;
		if (typeof interpreterUrl !== "string" || !interpreterUrl) return null;
		return { program, globalName, interpreterUrl };
	} catch {
		return null;
	}
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

async function fetchTvChallenge(): Promise<TvChallenge> {
	const response = await youtubeFetch(TV_CONFIG_URL, {
		headers: { "User-Agent": TV_USER_AGENT, "Accept-Language": "en-US,en;q=0.7" },
	});
	if (!response.ok) throw new Error(`tv config request failed: ${response.status}`);
	const challenge = parseTvChallenge(await response.text());
	if (!challenge) throw new Error("tv config has no usable BotGuard challenge");
	return challenge;
}

async function interpreterScript(url: string): Promise<string> {
	const absolute = url.startsWith("//") ? `https:${url}` : url;
	const response = await youtubeFetch(absolute, { headers: { "User-Agent": TV_USER_AGENT } });
	if (!response.ok) throw new Error(`tv interpreter fetch failed: ${response.status}`);
	const script = await response.text();
	if (!script) throw new Error("tv interpreter fetch returned an empty body");
	return script;
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
		const [appInfo, challenge] = await Promise.all([fetchTvPage(), fetchTvChallenge()]);
		const script = await interpreterScript(challenge.interpreterUrl);
		const integrityToken = await executeBotGuard(
			script,
			challenge.program,
			challenge.globalName,
			"",
		);
		const poToken = await mintPoToken(integrityToken, appInfo.livingRoomPoTokenId);
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
