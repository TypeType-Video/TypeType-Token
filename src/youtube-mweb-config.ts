export type YoutubeMwebConfig = {
	clientVersion: string;
};

const MWEB_CONFIG_URL = "https://m.youtube.com/sw.js_data";
const MWEB_REFERER = "https://m.youtube.com/sw.js";
export const MWEB_USER_AGENT =
	"Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36";

export async function fetchYoutubeMwebConfig(
	fetcher: typeof fetch = fetch,
): Promise<YoutubeMwebConfig> {
	const response = await fetcher(MWEB_CONFIG_URL, {
		headers: {
			Accept: "*/*",
			"Accept-Language": "en-US",
			Referer: MWEB_REFERER,
			"User-Agent": MWEB_USER_AGENT,
		},
	});
	if (!response.ok) {
		throw new Error(`YouTube MWEB config returned ${response.status}`);
	}
	return parseYoutubeMwebConfig(await response.text());
}

export function parseYoutubeMwebConfig(body: string): YoutubeMwebConfig {
	const payload = body.replace(/^\)\]\}'\s*/, "");
	const root = asArray(JSON.parse(payload), "root");
	const serviceData = asArray(root[0], "service data");
	const configurations = asArray(serviceData[2], "configurations");
	const configuration = asArray(configurations[0], "configuration");
	const deviceInfo = asArray(configuration[0], "device info");
	const clientVersion = deviceInfo[16];
	if (typeof clientVersion !== "string" || !/^\d+\.\d+\.\d+\.\d+$/.test(clientVersion)) {
		throw new Error("YouTube MWEB client version is missing");
	}
	return { clientVersion };
}

export function withYoutubeClientVersion(url: string, clientVersion: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set("cver", clientVersion);
	return parsed.toString();
}

function asArray(value: unknown, label: string): unknown[] {
	if (!Array.isArray(value)) {
		throw new Error(`YouTube MWEB ${label} is invalid`);
	}
	return value;
}
