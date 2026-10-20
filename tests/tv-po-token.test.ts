import { describe, expect, test } from "bun:test";
import { parseIntegrityToken, parseRequestKey, parseTvAppInfo } from "../src/tv-po-token.ts";

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
		expect(parseIntegrityToken({ integrityToken: "a", estimatedTtlSecs: 60 })).toEqual({
			token: "a",
			ttlSecs: 60,
		});
		expect(parseIntegrityToken({ websafeFallbackToken: "b" })?.token).toBe("b");
		expect(parseIntegrityToken({})).toBeNull();
	});
});
