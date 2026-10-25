const TV_PAGE_URL = "https://www.youtube.com/tv";
const TV_USER_AGENT =
	"Mozilla/5.0 (Linux armeabi-v7a; Android 7.1.2; Fire OS 6.0) " +
	"Cobalt/22.lts.3.306369-gold (unlike Gecko) v8/8.8.278.8-jit gles " +
	"Starboard/13, Amazon_ATV_mediatek8695_2019/NS6294 " +
	"(Amazon, AFTMM, Wireless) com.amazon.firetv.youtube/22.3.r2.v66.0";

export type TvPlayerData = {
	playerId: string;
	playerJs: string;
	signatureTimestamp: number;
};

let tvPlayerPromise: Promise<TvPlayerData> | undefined;

export async function getTvPlayer(): Promise<TvPlayerData> {
	if (!tvPlayerPromise) {
		tvPlayerPromise = loadTvPlayer().catch((error) => {
			tvPlayerPromise = undefined;
			throw error;
		});
	}
	return tvPlayerPromise;
}

async function loadTvPlayer(): Promise<TvPlayerData> {
	const pageResponse = await fetch(TV_PAGE_URL, {
		headers: { "user-agent": TV_USER_AGENT },
	});
	if (!pageResponse.ok) {
		throw new Error(`TV page request failed: ${pageResponse.status}`);
	}
	const regularPlayerUrl = extractTvPlayerUrl(await pageResponse.text());
	if (!regularPlayerUrl) throw new Error("TV page has no player URL");
	const playerUrl = toTclPlayerUrl(regularPlayerUrl);
	const playerId = /\/s\/player\/([^/]+)\//.exec(playerUrl)?.[1];
	if (!playerId) throw new Error("TV player URL has no player id");

	const playerResponse = await fetch(playerUrl, {
		headers: { "user-agent": TV_USER_AGENT },
	});
	if (!playerResponse.ok) {
		throw new Error(`TV player request failed: ${playerResponse.status}`);
	}
	const playerJs = await playerResponse.text();
	const signatureTimestamp = Number(/signatureTimestamp:(\d+)/.exec(playerJs)?.[1] ?? 0);
	return { playerId, playerJs, signatureTimestamp };
}

function extractTvPlayerUrl(page: string): string | undefined {
	const value = /"player_url":"([^"]+)"/.exec(page)?.[1]?.replaceAll("\\/", "/");
	if (!value) return undefined;
	return value.startsWith("//") ? `https:${value}` : new URL(value, TV_PAGE_URL).toString();
}

function toTclPlayerUrl(playerUrl: string): string {
	return playerUrl
		.replace(
			"/tv-player-es6.vflset/tv-player-es6.js",
			"/tv-player-ias-tcl.vflset/tv-player-ias-tcl.js",
		)
		.replace(
			"/tv-player-ias.vflset/tv-player-ias.js",
			"/tv-player-ias-tcl.vflset/tv-player-ias-tcl.js",
		)
		.replace("/player_es6.vflset/en_US/base.js", "/tv-player-ias-tcl.vflset/tv-player-ias-tcl.js")
		.replace("/player_ias.vflset/en_US/base.js", "/tv-player-ias-tcl.vflset/tv-player-ias-tcl.js")
		.replace("-es6", "-ias");
}
