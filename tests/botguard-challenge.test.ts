import { afterEach, describe, expect, it, mock } from "bun:test";
import { Constants } from "youtubei.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("fetchChallenge", () => {
	it("binds the page-native challenge to the current visitor session", async () => {
		let request: Request | null = null;
		const rawChallenge = JSON.stringify({
			bgChallenge: {
				interpreterJavascript: {
					privateDoNotAccessOrElseSafeScriptWrappedValue: "interpreter",
				},
				program: "program",
				globalName: "trayride",
			},
		});
		globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			request = new Request(input, init);
			return new Response(
				`<script>ytcfg.set({"EVENT_ID":"event-123"});` +
					`window.ytAtN({"R":${JSON.stringify(rawChallenge)}});</script>`,
			);
		}) as typeof fetch;

		const { fetchChallenge, WEB_CLIENT_VERSION } = await import(
			"../src/botguard-challenge.ts?contract-test"
		);
		const challenge = await fetchChallenge("visitor-session");

		expect(challenge).toEqual({
			interpreterScript: "interpreter",
			program: "program",
			globalName: "trayride",
			eventId: "event-123",
		});
		expect(WEB_CLIENT_VERSION).toBe(Constants.CLIENTS.WEB.VERSION);
		expect(request?.url).toBe("https://www.youtube.com/");
		expect(request?.method).toBe("GET");
		expect(request?.headers.get("X-Goog-Visitor-Id")).toBe("visitor-session");
		expect(request?.headers.get("Accept-Language")).toBe("en-US,en;q=0.7");
	});
});
