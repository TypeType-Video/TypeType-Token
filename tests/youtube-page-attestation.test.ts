import { describe, expect, it } from "bun:test";
import { parseYoutubePageAttestation } from "../src/youtube-page-attestation.ts";

function pageWith(rawChallenge: string): string {
	return (
		`<script>ytcfg.set({"EVENT_ID":"event_123-abc"});` +
		`window.ytAtN({'R':${JSON.stringify(rawChallenge)}});</script>`
	);
}

describe("parseYoutubePageAttestation", () => {
	it("returns the challenge and EVENT_ID from the same page", () => {
		const rawChallenge = JSON.stringify({
			bgChallenge: {
				program: "line 1\nline 2",
				globalName: "trayride",
			},
		});

		expect(parseYoutubePageAttestation(pageWith(rawChallenge))).toEqual({
			eventId: "event_123-abc",
			rawChallenge,
		});
	});

	it("decodes hexadecimal JavaScript escapes", () => {
		const page =
			'<script>{"EVENT_ID":"event-id"};window.ytAtN({"R":"' +
			"{\\x22bgChallenge\\x22:{\\u0022program\\u0022:\\x221\\x22}}" +
			'"});</script>';

		expect(parseYoutubePageAttestation(page).rawChallenge).toBe('{"bgChallenge":{"program":"1"}}');
	});

	it("rejects pages without a matching page context", () => {
		expect(() => parseYoutubePageAttestation("window.ytAtN({'R':'{}'})")).toThrow(
			"YouTube page has no EVENT_ID",
		);
		expect(() => parseYoutubePageAttestation('{"EVENT_ID":"event-id"}')).toThrow(
			"YouTube page has no initial attestation call",
		);
	});
});
