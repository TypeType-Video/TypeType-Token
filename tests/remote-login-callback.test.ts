import { describe, expect, it } from "bun:test";
import { sendRemoteLoginCompletion } from "../src/remote-login-callback.ts";
import { REMOTE_LOGIN_INTERNAL_HEADER } from "../src/remote-login-config.ts";
import { remoteLoginTarget, remoteLoginTestConfig } from "./remote-login-fixtures.ts";

describe("sendRemoteLoginCompletion", () => {
	it("returns false when the internal token is missing", async () => {
		const ok = await sendRemoteLoginCompletion(
			remoteLoginTarget(),
			"token-session",
			"# Netscape HTTP Cookie File",
			"captured-pot",
			0,
			remoteLoginTestConfig({ internalToken: null }),
		);

		expect(ok).toBe(false);
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
			const ok = await sendRemoteLoginCompletion(
				remoteLoginTarget({
					callbackUrl: `http://localhost:${server.port}/callback`,
				}),
				"token-session",
				"# Netscape HTTP Cookie File",
				"captured-pot",
				2,
				config,
			);

			expect(ok).toBe(true);
			expect(header).toBe("internal-secret");
			expect(payload?.sessionId).toBe("server-session");
			expect(payload?.tokenSessionId).toBe("token-session");
			expect(payload?.status).toBe("completed");
			expect(payload?.authUser).toBe(2);
		} finally {
			server.stop(true);
		}
	});
});
