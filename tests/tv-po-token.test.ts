import { describe, expect, test } from "bun:test";
import {
	parseIntegrityToken,
	parseRequestKey,
	parseTvAppInfo,
	parseWaaChallenge,
} from "../src/tv-po-token-requests.ts";

const CHALLENGE = ["msg", [null, "script()"], null, "hash", "program", "globalName"];

function scramble(value: unknown): string {
	const bytes = new TextEncoder().encode(JSON.stringify(value)).map((byte) => (byte - 97) & 0xff);
	return Buffer.from(bytes).toString("base64");
}

const PAGE =
	'<script>{"EVENT_ID":"3vPWarn6NobmmLAP58-A0AI","LIVING_ROOM_PO_TOKEN_ID":"wpeaWfYpTp8\\u003d","visitorData":"Cgs5azZUVjRo"}</script>';

describe("tv po token", () => {
	test("reads the living room id, visitor data and event id", () => {
		expect(parseTvAppInfo(PAGE)).toEqual({
			livingRoomPoTokenId: "wpeaWfYpTp8=",
			visitorData: "Cgs5azZUVjRo",
			eventId: "3vPWarn6NobmmLAP58-A0AI",
		});
	});

	test("rejects a page without the living room id", () => {
		expect(parseTvAppInfo('{"visitorData":"x","EVENT_ID":"y"}')).toBeNull();
	});

	test("reads the challenge request key", () => {
		expect(parseRequestKey('{"challengeRequestKey":"Z1elNkAKLpSR3oPOUMSN"}')).toBe(
			"Z1elNkAKLpSR3oPOUMSN",
		);
		expect(parseRequestKey('{"other":1}')).toBeNull();
	});

	test("prefers the integrity token and falls back to the websafe token", () => {
		expect(parseIntegrityToken(["a", 60, 30, "b"])).toEqual({ token: "a", ttlSecs: 60 });
		expect(parseIntegrityToken([null, null, null, "b"])?.token).toBe("b");
		expect(parseIntegrityToken([])).toBeNull();
		expect(parseIntegrityToken({ integrityToken: "a" })).toBeNull();
	});

	test("reads a plain WAA challenge", () => {
		expect(parseWaaChallenge([CHALLENGE])).toEqual({
			program: "program",
			globalName: "globalName",
			interpreterScript: "script()",
			interpreterUrl: null,
		});
	});

	test("unscrambles a WAA challenge", () => {
		expect(parseWaaChallenge([null, scramble(CHALLENGE)])?.program).toBe("program");
		expect(parseWaaChallenge([null, "not base64 json"])).toBeNull();
		expect(parseWaaChallenge({})).toBeNull();
	});
});
