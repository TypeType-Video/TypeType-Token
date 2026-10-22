import { describe, expect, test } from "bun:test";
import { parseSessionCookies, toBrowserCookies } from "../src/session-binding-cookies.ts";

describe("session binding cookies", () => {
	test("preserves domain and cookie scope from Netscape exports", () => {
		const raw = [
			"# Netscape HTTP Cookie File",
			"#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tsid-value",
			"accounts.google.com\tFALSE\t/accounts\tTRUE\t1893456000\tSAPISID\tapi-value",
			"example.com\tTRUE\t/\tTRUE\t0\tBAD\tbad-value",
		].join("\n");

		expect(parseSessionCookies(raw)).toEqual([
			{
				name: "SID",
				value: "sid-value",
				domain: "youtube.com",
				includeSubdomains: true,
				path: "/",
				expires: -1,
				secure: true,
				httpOnly: true,
			},
			{
				name: "SAPISID",
				value: "api-value",
				domain: "accounts.google.com",
				includeSubdomains: false,
				path: "/accounts",
				expires: 1893456000,
				secure: true,
				httpOnly: false,
			},
		]);

		const browserCookies = toBrowserCookies(parseSessionCookies(raw));
		expect(browserCookies[0].domain).toBe(".youtube.com");
		expect(browserCookies[1].url).toBe("https://accounts.google.com/accounts");
		expect(browserCookies.every((cookie) => cookie.domain !== ".google.com")).toBe(true);
	});

	test("parses cookie headers as YouTube-only session cookies", () => {
		const cookies = parseSessionCookies("Cookie: SID=sid; SAPISID=api; HSID=");
		expect(cookies.map((cookie) => cookie.name)).toEqual(["SID", "SAPISID"]);
		expect(cookies.every((cookie) => cookie.domain === "youtube.com")).toBe(true);
		expect(toBrowserCookies(cookies).every((cookie) => cookie.domain === ".youtube.com")).toBe(
			true,
		);
	});
});
