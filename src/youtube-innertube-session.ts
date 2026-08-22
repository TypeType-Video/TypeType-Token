import Innertube, { ClientType, UniversalCache } from "youtubei.js";
import { youtubeFetch } from "./youtube-fetch.ts";
import { fetchYoutubeMwebConfig } from "./youtube-mweb-config.ts";
import { installYoutubePlayerEvaluator } from "./youtube-player-evaluator.ts";
import type { YoutubeSabrClient } from "./youtube-sabr-types.ts";

export type YoutubeInnertube = Awaited<ReturnType<typeof Innertube.create>>;

type SharedInnertube<Session> = {
	visitorData: string;
	pending: Promise<Session>;
};

export class YoutubeInnertubeSessions<Session> {
	private readonly byClient = new Map<YoutubeSabrClient, SharedInnertube<Session>>();

	constructor(
		private readonly create: (client: YoutubeSabrClient, visitorData: string) => Promise<Session>,
	) {}

	async get(client: YoutubeSabrClient, visitorData: string): Promise<Session> {
		const shared = this.byClient.get(client);
		if (shared?.visitorData === visitorData) return shared.pending;
		const pending = this.create(client, visitorData);
		this.byClient.set(client, { visitorData, pending });
		try {
			return await pending;
		} catch (error) {
			if (this.byClient.get(client)?.pending === pending) this.byClient.delete(client);
			throw error;
		}
	}

	async invalidate(
		client: YoutubeSabrClient,
		visitorData: string,
		innertube: Session,
	): Promise<void> {
		const shared = this.byClient.get(client);
		if (shared?.visitorData !== visitorData) return;
		const active = await shared.pending.catch(() => null);
		if (active === innertube && this.byClient.get(client) === shared) {
			this.byClient.delete(client);
		}
	}
}

const sessions = new YoutubeInnertubeSessions<YoutubeInnertube>(async (client, visitorData) => {
	installYoutubePlayerEvaluator();
	const innertube = await Innertube.create({
		cache: new UniversalCache(true),
		client_type: client === "MWEB" ? ClientType.MWEB : ClientType.WEB,
		fetch: youtubeFetch as typeof fetch,
		visitor_data: visitorData,
	});
	if (client === "MWEB") {
		innertube.session.context.client.clientVersion = (await fetchYoutubeMwebConfig()).clientVersion;
	}
	return innertube;
});

export async function getYoutubeInnertube(
	client: YoutubeSabrClient,
	visitorData: string,
): Promise<YoutubeInnertube> {
	return sessions.get(client, visitorData);
}

export async function invalidateYoutubeInnertube(
	client: YoutubeSabrClient,
	visitorData: string,
	innertube: YoutubeInnertube,
): Promise<void> {
	return sessions.invalidate(client, visitorData, innertube);
}

export function isRejectedAnonymousSession(status?: string, reason?: string): boolean {
	if (status !== "LOGIN_REQUIRED") return false;
	return reason?.toLowerCase().includes("not a bot") ?? false;
}
