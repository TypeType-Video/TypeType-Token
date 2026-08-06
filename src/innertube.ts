import type { IntegrityTokenData } from "bgutils-js";
import { WEB_CLIENT_VERSION } from "./botguard-challenge.ts";
import { youtubeFetch } from "./youtube-fetch.ts";

const INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const WAA_API_KEY = "AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw";
const REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";
const WAA_BASE_URL = "https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa";
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
	"Chrome/131.0.0.0 Safari/537.36";

const WAA_HEADERS: Record<string, string> = {
	"content-type": "application/json+protobuf",
	"x-goog-api-key": WAA_API_KEY,
	"x-user-agent": "grpc-web-javascript/0.1",
	"user-agent": USER_AGENT,
};

export async function fetchVisitorData(): Promise<string> {
	const response = await youtubeFetch(
		`https://www.youtube.com/youtubei/v1/config?key=${INNERTUBE_API_KEY}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				context: {
					client: {
						hl: "en",
						gl: "US",
						clientName: "WEB",
						clientVersion: WEB_CLIENT_VERSION,
					},
				},
			}),
		},
	);

	if (!response.ok) {
		throw new Error(`Innertube config request failed: ${response.status}`);
	}

	const data = (await response.json()) as { responseContext?: { visitorData?: string } };
	const visitorData = data.responseContext?.visitorData;

	if (typeof visitorData !== "string") {
		throw new Error("visitorData missing from Innertube response");
	}

	return visitorData;
}

export async function fetchIntegrityToken(botguardResponse: string): Promise<IntegrityTokenData> {
	const response = await youtubeFetch(`${WAA_BASE_URL}/GenerateIT`, {
		method: "POST",
		headers: WAA_HEADERS,
		body: JSON.stringify([REQUEST_KEY, botguardResponse]),
	});

	if (!response.ok) {
		throw new Error(`WAA GenerateIT request failed: ${response.status}`);
	}

	const arr = (await response.json()) as [unknown, unknown, unknown, unknown];
	const data: IntegrityTokenData = {};

	if (typeof arr[0] === "string") data.integrityToken = arr[0];
	if (typeof arr[1] === "number") data.estimatedTtlSecs = arr[1];
	if (typeof arr[2] === "number") data.mintRefreshThreshold = arr[2];
	if (typeof arr[3] === "string") data.websafeFallbackToken = arr[3];

	return data;
}
