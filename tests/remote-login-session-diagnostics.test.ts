import { describe, expect, it } from "bun:test";
import { RemoteLoginSession } from "../src/remote-login-session.ts";
import type { RemoteLoginConnection } from "../src/remote-login-session-types.ts";
import {
	fakeRemoteLoginPage,
	remoteLoginTarget,
	remoteLoginTestConfig,
} from "./remote-login-fixtures.ts";

function waitFor(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function connection(sent: string[]): RemoteLoginConnection {
	return {
		sendText: (value) => {
			sent.push(value);
			return true;
		},
		sendBinary: () => true,
		bufferedAmount: () => Number.MAX_SAFE_INTEGER,
		close: () => undefined,
	};
}

function logs(sent: string[]): string[] {
	return sent
		.map((line) => JSON.parse(line) as { type: string; message?: string })
		.filter((message) => message.type === "log")
		.map((message) => message.message ?? "");
}

describe("RemoteLoginSession diagnostics", () => {
	it("streams phases, page events and login checks to the client", async () => {
		let observer: ((event: string) => void) | null = null;
		const page = fakeRemoteLoginPage({
			url: () => "https://accounts.google.com/v3/signin/challenge/totp?x=1",
			cookieSummary: async () => "google.com=[SID]",
			observe: (listener) => {
				observer = listener;
			},
		});
		const session = new RemoteLoginSession({
			sessionId: "abcdef12-session",
			userId: "user",
			expiresAt: Date.now() + 300_000,
			target: remoteLoginTarget(),
			config: remoteLoginTestConfig(),
			createPage: async () => page,
			onDone: () => undefined,
		});
		await session.start();
		const sent: string[] = [];
		session.attach(connection(sent));
		observer?.("navigated https://accounts.google.com/v3/signin/challenge/totp");
		await waitFor(1100);
		session.cancel();

		const lines = logs(sent);
		expect(lines.some((line) => line.startsWith("session start viewport=1280x720"))).toBe(true);
		expect(lines).toContain("phase opening");
		expect(lines).toContain("phase awaiting_login");
		expect(lines).toContain("client websocket attached");
		expect(lines).toContain("navigated https://accounts.google.com/v3/signin/challenge/totp");
		expect(lines).toContain(
			"login check url=https://accounts.google.com/v3/signin/challenge/totp cookies=google.com=[SID]",
		);
		expect(lines).toContain("session failed: Session cancelled");
		expect(sent.some((line) => line.includes('"type":"error"'))).toBe(true);
	});

	it("reports an input failure with the underlying error", async () => {
		const page = fakeRemoteLoginPage();
		page.page.keyboard.insertText = async () => {
			throw new Error("Execution context was destroyed");
		};
		const sent: string[] = [];
		const session = new RemoteLoginSession({
			sessionId: "session",
			userId: "user",
			expiresAt: Date.now() + 300_000,
			target: remoteLoginTarget(),
			config: remoteLoginTestConfig(),
			createPage: async () => page,
			onDone: () => undefined,
		});
		await session.start();
		session.attach(connection(sent));
		session.handleMessage(JSON.stringify({ type: "text", value: "abc" }));
		await waitFor(0);
		await waitFor(0);

		expect(logs(sent)).toContain("input text 3 chars failed: Execution context was destroyed");
		expect(logs(sent)).toContain("session failed: Remote browser input failed");
	});

	it("automatically retries YouTube sign-in handshake when landing on youtube.com/oops with Google login cookies", async () => {
		let retried = false;
		let currentUrl = "https://www.youtube.com/oops";
		let youtubeLogin = false;
		const page = fakeRemoteLoginPage({
			url: () => currentUrl,
			hasLoginCookie: async () => youtubeLogin,
			hasGoogleLoginCookie: async () => true,
			retrySignInHandshake: async () => {
				retried = true;
				currentUrl = "https://www.youtube.com/";
				youtubeLogin = true;
			},
		});
		const session = new RemoteLoginSession({
			sessionId: "test-oops-session",
			userId: "user",
			expiresAt: Date.now() + 300_000,
			target: remoteLoginTarget(),
			config: remoteLoginTestConfig(),
			createPage: async () => page,
			onDone: () => undefined,
		});
		await session.start();
		const sent: string[] = [];
		session.attach(connection(sent));
		await waitFor(1100);
		expect(retried).toBe(true);
		expect(logs(sent)).toContain(
			"detected youtube.com/oops after google authentication, automatically retrying youtube signin handshake",
		);
		session.cancel();
	});
});
