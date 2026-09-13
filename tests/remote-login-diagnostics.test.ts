import { describe, expect, it } from "bun:test";
import type { Cookie } from "playwright";
import {
	describeCookies,
	describeError,
	describeUrl,
	RemoteLoginDiagnostics,
} from "../src/remote-login-diagnostics.ts";
import { logMessage } from "../src/remote-login-messages.ts";
import type { RemoteLoginConnection } from "../src/remote-login-session-types.ts";

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

function connection(sent: string[]): RemoteLoginConnection {
	return {
		sendText: (value) => {
			sent.push(value);
			return true;
		},
		sendBinary: () => true,
		bufferedAmount: () => 0,
		close: () => undefined,
	};
}

describe("remote login diagnostics", () => {
	it("describes cookies by domain with names only", () => {
		const summary = describeCookies([
			cookie(".youtube.com", "SID", "secret"),
			cookie(".google.com", "HSID", "secret"),
			cookie(".youtube.com", "LOGIN_INFO", "secret"),
		]);
		expect(summary).toBe("google.com=[HSID] youtube.com=[LOGIN_INFO,SID]");
		expect(summary).not.toContain("secret");
		expect(describeCookies([])).toBe("none");
	});

	it("strips query strings from urls and trims errors", () => {
		expect(describeUrl("https://accounts.google.com/v3/signin/challenge/pwd?flow=x&tok=y")).toBe(
			"https://accounts.google.com/v3/signin/challenge/pwd",
		);
		expect(describeUrl("not a url")).toBe("invalid-url");
		expect(describeError(new Error("first line\nstack"))).toBe("first line");
	});

	it("replays buffered lines when a client attaches", () => {
		const diagnostics = new RemoteLoginDiagnostics("abc");
		diagnostics.log("before attach");
		const sent: string[] = [];
		diagnostics.attach(connection(sent));
		diagnostics.log("after attach");
		expect(sent).toHaveLength(2);
		expect(JSON.parse(sent[0] ?? "")).toMatchObject({ type: "log", message: "before attach" });
		expect(JSON.parse(sent[1] ?? "")).toMatchObject({ type: "log", message: "after attach" });
		expect(typeof JSON.parse(sent[1] ?? "").at).toBe("number");
	});

	it("formats log messages", () => {
		expect(JSON.parse(logMessage(12, "hello"))).toEqual({ type: "log", at: 12, message: "hello" });
	});
});
