import { describe, expect, it } from "bun:test";
import { RemoteLoginSession } from "../src/remote-login-session.ts";
import {
	fakeRemoteLoginPage,
	remoteLoginTarget,
	remoteLoginTestConfig,
} from "./remote-login-fixtures.ts";

describe("RemoteLoginSession handshake recovery", () => {
	it.each([
		"https://accounts.google.com/oops",
		"https://example.com/oops",
		"https://www.youtube.com.evil.example/oops",
		"https://www.youtube.com/watch?next=/oops",
		"https://www.youtube.com/oops/extra",
		"invalid/oops",
	])("preserves the current page instead of retrying sign-in at %s", async (url) => {
		let retries = 0;
		const page = fakeRemoteLoginPage({
			url: () => url,
			hasGoogleLoginCookie: async () => true,
			retrySignInHandshake: async () => {
				retries += 1;
			},
		});
		const session = new RemoteLoginSession({
			sessionId: "test-recovery-session",
			userId: "user",
			expiresAt: Date.now() + 300_000,
			target: remoteLoginTarget(),
			config: remoteLoginTestConfig(),
			createPage: async () => page,
			onDone: () => undefined,
		});
		try {
			await session.start();
			await new Promise((resolve) => setTimeout(resolve, 1100));
			expect(retries).toBe(0);
		} finally {
			session.cancel();
		}
	});
});
