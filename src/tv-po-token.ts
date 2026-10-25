import type { BotGuardChallenge } from "./botguard-challenge.ts";
import { BotGuardContext } from "./botguard-page.ts";
import {
	fetchHomeEventId,
	fetchRequestKey,
	fetchTvChallenge,
	fetchTvPage,
	generateIntegrityToken,
	TV_USER_AGENT,
} from "./tv-po-token-requests.ts";

const TTL_MS = 10 * 60_000;

export type TvPoToken = {
	poToken: string;
	visitorData: string;
	livingRoomPoTokenId: string;
	expiresAt: number;
};

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
