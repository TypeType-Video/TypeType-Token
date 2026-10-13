import { describe, expect, it } from "bun:test";
import { sendRemoteLoginCompletion } from "../src/remote-login-callback.ts";
import { REMOTE_LOGIN_INTERNAL_HEADER } from "../src/remote-login-config.ts";
import { remoteLoginTarget, remoteLoginTestConfig } from "./remote-login-fixtures.ts";

describe("sendRemoteLoginCompletion", () => {
	it("reports a missing internal token", async () => {
		const result = await sendRemoteLoginCompletion(
			remoteLoginTarget(),
			"token-session",
			"# Netscape HTTP Cookie File",
			"captured-pot",
			0,
			remoteLoginTestConfig({ internalToken: null }),
		);

		expect(result).toMatchObject({ ok: false, reason: "internal_token_missing" });
	});

	it("posts the completion payload to TypeType-Server", async () => {
		let header: string | null = null;
		let payload: {
			sessionId: string;
			tokenSessionId: string;
			status: string;
			authUser: number;
		} | null = null;
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				header = req.headers.get(REMOTE_LOGIN_INTERNAL_HEADER);
				payload = await req.json();
				return Response.json({ ok: true });
			},
		});

		try {
			const config = remoteLoginTestConfig({
				callbackOrigin: `http://localhost:${server.port}`,
			});
			const result = await sendRemoteLoginCompletion(
				remoteLoginTarget({
					callbackUrl: `http://localhost:${server.port}/callback`,
				}),
				"token-session",
				"# Netscape HTTP Cookie File",
				"captured-pot",
				2,
				config,
			);

			expect(result).toMatchObject({ ok: true, status: 200 });
			expect(header).toBe("internal-secret");
			expect(payload?.sessionId).toBe("server-session");
			expect(payload?.tokenSessionId).toBe("token-session");
			expect(payload?.status).toBe("completed");
			expect(payload?.authUser).toBe(2);
		} finally {
			server.stop(true);
		}
	});

	it("returns the callback HTTP status when the server rejects completion", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async () => Response.json({ error: "rejected" }, { status: 400 }),
		});

		try {
			const result = await sendRemoteLoginCompletion(
				remoteLoginTarget({
					callbackUrl: `http://localhost:${server.port}/callback`,
				}),
				"token-session",
				"# Netscape HTTP Cookie File",
				"captured-pot",
				2,
				remoteLoginTestConfig({ callbackOrigin: `http://localhost:${server.port}` }),
			);

			expect(result).toMatchObject({ ok: false, reason: "http_error", status: 400 });
		} finally {
			server.stop(true);
		}
	});

	it("reports safe network error details without including the error message", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => {
			const cause = Object.assign(new Error("private endpoint details"), { code: "ECONNRESET" });
			throw new TypeError("fetch failed", { cause });
		};

		try {
			const result = await sendRemoteLoginCompletion(
				remoteLoginTarget(),
				"token-session",
				"# Netscape HTTP Cookie File",
				"captured-pot",
				2,
				remoteLoginTestConfig(),
			);

			expect(result).toMatchObject({
				ok: false,
				reason: "network_error",
				errorName: "TypeError",
				errorCode: "ECONNRESET",
			});
			expect(JSON.stringify(result)).not.toContain("private endpoint details");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
