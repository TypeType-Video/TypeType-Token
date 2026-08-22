import type { RemoteLoginPage } from "../src/remote-login-browser.ts";
import type { RemoteLoginCompletionTarget } from "../src/remote-login-callback.ts";
import type { RemoteLoginConfig } from "../src/remote-login-config.ts";

export function remoteLoginTestConfig(
	overrides: Partial<RemoteLoginConfig> = {},
): RemoteLoginConfig {
	return {
		enabled: true,
		internalToken: "internal-secret",
		ttlMs: 480_000,
		frameIntervalMs: 100,
		jpegQuality: 60,
		viewportWidth: 1280,
		viewportHeight: 720,
		deviceScaleFactor: 1,
		userAgent: "test-agent",
		headless: true,
		disableAutomationControlled: true,
		browserChannel: null,
		browserExecutablePath: null,
		locale: "en-US",
		probeVideoUrl: "https://music.youtube.com/watch?v=09839DpTctU",
		potTimeoutMs: 10_000,
		maxFrameBytes: 524_288,
		maxBufferedBytes: 524_288,
		maxCookieBytes: 262_144,
		maxSessions: 2,
		callbackTimeoutMs: 5_000,
		callbackOrigin: "http://typetype-server.local",
		...overrides,
	};
}

export function remoteLoginTarget(
	overrides: Partial<RemoteLoginCompletionTarget> = {},
): RemoteLoginCompletionTarget {
	return {
		serverSessionId: "server-session",
		callbackUrl: "http://typetype-server.local/internal/callback",
		...overrides,
	};
}

export function fakeRemoteLoginPage(overrides: Partial<RemoteLoginPage> = {}): RemoteLoginPage {
	return {
		page: {
			goto: async () => undefined,
			setViewportSize: async () => undefined,
			screenshot: async () => Buffer.from("frame"),
			mouse: {
				move: async () => undefined,
				down: async () => undefined,
				up: async () => undefined,
				wheel: async () => undefined,
			},
			keyboard: {
				down: async () => undefined,
				up: async () => undefined,
				insertText: async () => undefined,
			},
		},
		close: async () => undefined,
		cookies: async () => "# Netscape HTTP Cookie File",
		authUser: async () => 0,
		hasLoginCookie: async () => false,
		...overrides,
	};
}
