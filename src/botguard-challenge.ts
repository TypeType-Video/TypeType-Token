import { Constants } from "youtubei.js";
import { youtubeFetch } from "./youtube-fetch.ts";
import { parseYoutubePageAttestation } from "./youtube-page-attestation.ts";

export const WEB_CLIENT_VERSION = Constants.CLIENTS.WEB.VERSION;
export const WEB_USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
	"Chrome/131.0.0.0 Safari/537.3";
const YOUTUBE_HOME_URL = "https://www.youtube.com/";

type AttGetChallenge = {
	interpreterJavascript?: {
		privateDoNotAccessOrElseSafeScriptWrappedValue?: string;
	};
	interpreterUrl?: {
		privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string;
	};
	program?: string;
	globalName?: string;
};

export type BotGuardChallenge = {
	interpreterScript: string;
	program: string;
	globalName: string;
	eventId: string;
};

async function resolveInterpreterScript(challenge: AttGetChallenge): Promise<string> {
	const embedded = challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
	if (typeof embedded === "string" && embedded.length > 0) {
		return embedded;
	}

	const rawUrl = challenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
	if (typeof rawUrl !== "string" || rawUrl.length === 0) {
		throw new Error("att/get challenge has no interpreter script or URL");
	}

	const url = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
	const response = await youtubeFetch(url);
	if (!response.ok) {
		throw new Error(`BotGuard interpreter fetch failed: ${response.status}`);
	}

	const script = await response.text();
	if (!script) {
		throw new Error("BotGuard interpreter fetch returned an empty body");
	}

	return script;
}

export async function fetchChallenge(visitorData: string): Promise<BotGuardChallenge> {
	const response = await youtubeFetch(YOUTUBE_HOME_URL, {
		headers: {
			"User-Agent": WEB_USER_AGENT,
			Accept: "text/html,application/xhtml+xml",
			"Accept-Language": "en-US,en;q=0.7",
			"X-Goog-Visitor-Id": visitorData,
		},
	});

	if (!response.ok) {
		throw new Error(`YouTube page request failed: ${response.status}`);
	}

	const page = parseYoutubePageAttestation(await response.text());
	const data = JSON.parse(page.rawChallenge) as { bgChallenge?: AttGetChallenge };
	const challenge = data.bgChallenge;

	if (
		!challenge ||
		typeof challenge.program !== "string" ||
		typeof challenge.globalName !== "string"
	) {
		throw new Error("YouTube page has no usable BotGuard challenge");
	}

	const interpreterScript = await resolveInterpreterScript(challenge);

	return {
		interpreterScript,
		program: challenge.program,
		globalName: challenge.globalName,
		eventId: page.eventId,
	};
}
