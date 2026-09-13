import { describe, expect, it } from "bun:test";
import type { Cookie } from "playwright";
import { isYoutubeLoginCookie, isYoutubeUrl } from "../src/remote-login-browser.ts";

function cookie(domain: string, name: string, value = "v"): Cookie {
	return {
		domain,
		name,
		value,
		path: "/",
		expires: -1,
		httpOnly: true,
		secure: true,
		sameSite: "None",
	};
}

describe("remote login browser login detection", () => {
	it("only treats youtube.com session cookies on youtube pages as a login", () => {
		expect(isYoutubeLoginCookie(cookie(".youtube.com", "SAPISID"))).toBe(true);
		expect(isYoutubeLoginCookie(cookie(".google.com", "SID"))).toBe(false);
		expect(isYoutubeLoginCookie(cookie(".youtube.com", "SID", ""))).toBe(false);
		expect(isYoutubeLoginCookie(cookie(".youtube.com", "VISITOR_INFO1_LIVE"))).toBe(false);
		expect(isYoutubeUrl("https://www.youtube.com/")).toBe(true);
		expect(isYoutubeUrl("https://accounts.google.com/v3/signin/challenge/totp")).toBe(false);
		expect(isYoutubeUrl("nope")).toBe(false);
	});
});
