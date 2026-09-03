import { fetchPoToken, type TokenResult } from "./token-service.ts";
import {
	getYoutubeInnertube,
	invalidateYoutubeInnertube,
	type YoutubeInnertube,
} from "./youtube-innertube-session.ts";
import type { YoutubeSabrClient } from "./youtube-sabr-types.ts";

type YoutubeSabrIdentityDependencies<Session> = {
	refreshTokens: (videoId: string) => Promise<TokenResult>;
	getSession: (client: YoutubeSabrClient, visitorData: string) => Promise<Session>;
	invalidateSession: (
		client: YoutubeSabrClient,
		visitorData: string,
		session: Session,
	) => Promise<void>;
};

export class YoutubeSabrIdentityRefresher<Session> {
	constructor(private readonly dependencies: YoutubeSabrIdentityDependencies<Session>) {}

	async refresh(
		videoId: string,
		client: YoutubeSabrClient,
		rejectedVisitorData: string,
		rejectedSession: Session,
	): Promise<{ tokens: TokenResult; session: Session }> {
		await this.dependencies.invalidateSession(client, rejectedVisitorData, rejectedSession);
		const tokens = await this.dependencies.refreshTokens(videoId);
		const session = await this.dependencies.getSession(client, tokens.visitorData);
		return { tokens, session };
	}
}

export const youtubeSabrIdentityRefresher = new YoutubeSabrIdentityRefresher<YoutubeInnertube>({
	refreshTokens: (videoId) => fetchPoToken(videoId, true),
	getSession: getYoutubeInnertube,
	invalidateSession: invalidateYoutubeInnertube,
});
