import type { BotGuardChallenge } from "./botguard-challenge.ts";
import { BotGuardContext, type BotGuardContextOpener } from "./botguard-page.ts";
import {
	fetchHomeEventId,
	fetchRequestKey,
	fetchTvChallenge,
	fetchTvPage,
	generateIntegrityToken,
	TV_USER_AGENT,
} from "./tv-po-token-requests.ts";

const TTL_MS = 10 * 60_000;
const FORCED_REFRESH_COOLDOWN_MS = 30_000;

export type TvPoTokenStatus = {
	expiresAt: number | null;
	lastMintAt: number | null;
	lastError: string | null;
};

export type TvPoToken = {
	poToken: string;
	visitorData: string;
	livingRoomPoTokenId: string;
	expiresAt: number;
};

async function mintInContext(
	openContext: BotGuardContextOpener,
	challenge: BotGuardChallenge,
	requestKey: string,
	livingRoomPoTokenId: string,
): Promise<string> {
	const context = await openContext(TV_USER_AGENT);
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
	private mintedAt = 0;
	private lastError: string | null = null;

	constructor(
		private readonly openContext: BotGuardContextOpener = (userAgent) =>
			BotGuardContext.open(userAgent),
	) {}

	async get(forceRefresh = false, now = Date.now()): Promise<TvPoToken> {
		const cached = this.cached;
		if (cached && cached.expiresAt > now && !(forceRefresh && this.mayRefresh(now))) {
			return cached;
		}
		if (this.inflight) return this.inflight;
		this.inflight = this.mint(now)
			.then(
				(value) => {
					this.lastError = null;
					return value;
				},
				(error: unknown) => {
					this.lastError = error instanceof Error ? error.message : String(error);
					throw error;
				},
			)
			.finally(() => {
				this.inflight = null;
			});
		return this.inflight;
	}

	status(): TvPoTokenStatus {
		return {
			expiresAt: this.cached?.expiresAt ?? null,
			lastMintAt: this.mintedAt > 0 ? this.mintedAt : null,
			lastError: this.lastError,
		};
	}

	private mayRefresh(now: number): boolean {
		return now - this.mintedAt >= FORCED_REFRESH_COOLDOWN_MS;
	}

	private async mint(now: number): Promise<TvPoToken> {
		const [appInfo, requestKey, eventId] = await Promise.all([
			fetchTvPage(),
			fetchRequestKey(),
			fetchHomeEventId(),
		]);
		const challenge = await fetchTvChallenge(requestKey);
		const poToken = await mintInContext(
			this.openContext,
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
		this.mintedAt = now;
		return value;
	}
}
