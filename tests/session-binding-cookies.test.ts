import { describe, expect, test } from "bun:test";
import { parseSessionCookies, toBrowserCookies } from "../src/session-binding-cookies.ts";

describe("session binding cookies", () => {
	test("parses Netscape exports and keeps HttpOnly cookies", () => {
		const raw = [
			"# Netscape HTTP Cookie File",
			"#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tsid-value",
			".google.com\tTRUE\t/\tTRUE\t0\tSAPISID\tapi-value",
		].join("\n");

		expect(parseSessionCookies(raw)).toEqual([
			{ name: "SID", value: "sid-value" },
			{ name: "SAPISID", value: "api-value" },
		]);
	});

	test("parses plain cookie headers", () => {
		expect(parseSessionCookies("Cookie: SID=sid; SAPISID=api; HSID=")).toEqual([
			{ name: "SID", value: "sid" },
			{ name: "SAPISID", value: "api" },
		]);
	});

	test("maps cookies to YouTube and Google domains", () => {
		const cookies = toBrowserCookies([{ name: "SID", value: "sid" }]);
		expect(cookies.map((cookie) => cookie.domain)).toEqual([".youtube.com", ".google.com"]);
		expect(cookies.every((cookie) => cookie.secure && cookie.httpOnly)).toBe(true);
	});
});
