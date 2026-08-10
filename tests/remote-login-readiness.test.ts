import { describe, expect, it } from "bun:test";
import { REMOTE_LOGIN_INTERNAL_HEADER } from "../src/remote-login-config.ts";
import { RemoteLoginManager } from "../src/remote-login-manager.ts";
import { createRemoteLoginHandler } from "../src/remote-login-routes.ts";
import { fakeRemoteLoginPage, remoteLoginTestConfig } from "./remote-login-fixtures.ts";

const readinessUrl = new URL("http://localhost:8081/youtube-remote-login/readiness");

function readinessRequest(callbackUrl: string, token = "internal-secret"): Request {
	return new Request(readinessUrl, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			[REMOTE_LOGIN_INTERNAL_HEADER]: token,
		},
		body: JSON.stringify({ callbackUrl }),
	});
}

describe("remote login readiness", () => {
	it("returns 404 when remote login is disabled", async () => {
		const config = remoteLoginTestConfig({ enabled: false });
		const manager = new RemoteLoginManager(config, async () => fakeRemoteLoginPage());
		const handler = createRemoteLoginHandler(manager, config);

		const res = await handler(
			readinessRequest("http://typetype-server.local/internal/callback"),
			readinessUrl,
		);

		expect(res?.status).toBe(404);
	});

	it("returns 503 when the internal token is missing", async () => {
		const config = remoteLoginTestConfig({ internalToken: null });
		const manager = new RemoteLoginManager(config, async () => fakeRemoteLoginPage());
		const handler = createRemoteLoginHandler(manager, config);

		const res = await handler(
			readinessRequest("http://typetype-server.local/internal/callback"),
			readinessUrl,
		);

		expect(res?.status).toBe(503);
	});

	it("reports readiness when the callback and browser runtime are usable", async () => {
		const config = remoteLoginTestConfig();
		const manager = new RemoteLoginManager(
			config,
			async () => fakeRemoteLoginPage(),
			async () => undefined,
		);
		const handler = createRemoteLoginHandler(manager, config);

		const res = await handler(
			readinessRequest("http://typetype-server.local/internal/callback"),
			readinessUrl,
		);

		expect(res?.status).toBe(204);
	});

	it("rejects a wrong shared secret", async () => {
		const config = remoteLoginTestConfig();
		const manager = new RemoteLoginManager(config, async () => fakeRemoteLoginPage());
		const handler = createRemoteLoginHandler(manager, config);

		const res = await handler(
			readinessRequest("http://typetype-server.local/internal/callback", "bad-token"),
			readinessUrl,
		);

		expect(res?.status).toBe(401);
	});

	it("rejects a callback origin outside the allowlist", async () => {
		const config = remoteLoginTestConfig();
		const manager = new RemoteLoginManager(config, async () => fakeRemoteLoginPage());
		const handler = createRemoteLoginHandler(manager, config);

		const res = await handler(
			readinessRequest("http://other.local/internal/callback"),
			readinessUrl,
		);

		expect(res?.status).toBe(400);
	});

	it("rejects an unavailable browser runtime", async () => {
		const config = remoteLoginTestConfig();
		const manager = new RemoteLoginManager(
			config,
			async () => fakeRemoteLoginPage(),
			async () => {
				throw new Error("browser unavailable");
			},
		);
		const handler = createRemoteLoginHandler(manager, config);

		const res = await handler(
			readinessRequest("http://typetype-server.local/internal/callback"),
			readinessUrl,
		);

		expect(res?.status).toBe(503);
	});
});
