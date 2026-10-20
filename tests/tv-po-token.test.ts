import { describe, expect, test } from "bun:test";
import { parseTvAppInfo, parseTvChallenge } from "../src/tv-po-token.ts";

const PAGE =
	'<script>{"LIVING_ROOM_PO_TOKEN_ID":"wpeaWfYpTp8\\u003d","visitorData":"Cgs5azZUVjRo"}</script>';

function configFor(challenge: unknown): string {
	const escaped = JSON.stringify(JSON.stringify(challenge)).slice(1, -1);
	return `{"challengeRequestKey":"Z1elNkAKLpSR3oPOUMSN","challengeParams":{"R":"${escaped}","T":1}}`;
}

describe("tv po token parsing", () => {
	test("reads the living room id and visitor data", () => {
		expect(parseTvAppInfo(PAGE)).toEqual({
			livingRoomPoTokenId: "wpeaWfYpTp8=",
			visitorData: "Cgs5azZUVjRo",
		});
	});

	test("rejects a page without the living room id", () => {
		expect(parseTvAppInfo('{"visitorData":"x"}')).toBeNull();
	});

	test("reads the BotGuard challenge from tv_config", () => {
		const config = configFor({
			bgChallenge: {
				program: "program",
				globalName: "trayride",
				interpreterUrl: {
					privateDoNotAccessOrElseTrustedResourceUrlWrappedValue: "//example/interp.js",
				},
			},
		});

		expect(parseTvChallenge(config)).toEqual({
			program: "program",
			globalName: "trayride",
			interpreterUrl: "//example/interp.js",
		});
	});

	test("rejects a config without a challenge", () => {
		expect(parseTvChallenge('{"challengeRequestKey":"x"}')).toBeNull();
	});
});
