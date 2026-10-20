import { describe, expect, test } from "bun:test";
import { DEVICE_CODE_TTL_MS, DeviceAuth } from "../src/device-auth.ts";

type Call = { url: string; body: Record<string, unknown>; raw: string };

function harness(responses: Array<Record<string, unknown>>, status = 200) {
	const calls: Call[] = [];
	let clock = 1_700_000_000_000;
	const auth = new DeviceAuth({
		now: () => clock,
		randomId: () => "device-id",
		fetchImpl: async (url, init) => {
			const raw = String(init.body);
			const body = raw.startsWith("{") ? (JSON.parse(raw) as Record<string, unknown>) : {};
			calls.push({ url, body, raw });
			const payload = responses.shift() ?? {};
			return new Response(JSON.stringify(payload), { status });
		},
	});
	return {
		auth,
		calls,
		advance: (ms: number) => {
			clock += ms;
		},
	};
}

const START = {
	device_code: "device-code-secret",
	user_code: "ABCD-EFGH",
	verification_url: "https://www.google.com/device",
	expires_in: 1800,
	interval: 5,
};

describe("device auth", () => {
	test("starts a device code without exposing the device code", async () => {
		const h = harness([START]);
		const start = await h.auth.start("user");

		expect(start.userCode).toBe("ABCD-EFGH");
		expect(start.verificationUrl).toBe("https://www.google.com/device");
		expect(JSON.stringify(start)).not.toContain("device-code-secret");
		expect(h.calls[0]?.body.device_id).toBe("device-id");
	});

	test("keeps a single active code per user", async () => {
		const h = harness([START, { ...START, user_code: "ZZZZ-ZZZZ" }]);
		await h.auth.start("user");
		const second = await h.auth.start("user");

		expect(second.userCode).toBe("ABCD-EFGH");
		expect(h.calls).toHaveLength(1);
	});

	test("enforces the polling interval", async () => {
		const h = harness([START]);
		await h.auth.start("user");

		expect(await h.auth.poll("user")).toEqual({ status: "slow_down" });
		h.advance(5_000);
		expect(h.calls).toHaveLength(1);
	});

	test("reports pending until the user authorizes", async () => {
		const h = harness([START, { error: "authorization_pending" }]);
		await h.auth.start("user");
		h.advance(5_000);

		expect(await h.auth.poll("user")).toEqual({ status: "pending" });
	});

	test("consumes the code once authorized", async () => {
		const h = harness([
			START,
			{ access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: "scope" },
		]);
		await h.auth.start("user");
		h.advance(5_000);

		const poll = await h.auth.poll("user");
		expect(poll).toEqual({
			status: "authorized",
			tokens: { accessToken: "access", refreshToken: "refresh", expiresIn: 3600, scope: "scope" },
		});
		expect(await h.auth.poll("user")).toEqual({ status: "expired" });
	});

	test("expires a code after its lifetime", async () => {
		const h = harness([START]);
		await h.auth.start("user");
		h.advance(DEVICE_CODE_TTL_MS + 1);

		expect(await h.auth.poll("user")).toEqual({ status: "expired" });
	});

	test("reports a denied authorization", async () => {
		const h = harness([START, { error: "access_denied" }]);
		await h.auth.start("user");
		h.advance(5_000);

		expect(await h.auth.poll("user")).toEqual({ status: "denied" });
	});

	test("refreshes while keeping the existing refresh token", async () => {
		const h = harness([{ access_token: "fresh", expires_in: 3600, scope: "scope" }]);
		const tokens = await h.auth.refresh("old-refresh");

		expect(tokens).toEqual({
			accessToken: "fresh",
			refreshToken: "old-refresh",
			expiresIn: 3600,
			scope: "scope",
		});
		expect(h.calls[0]?.body.grant_type).toBe("refresh_token");
	});

	test("rejects an invalid grant on refresh", async () => {
		const h = harness([{ error: "invalid_grant" }], 400);

		await expect(h.auth.refresh("revoked")).rejects.toThrow("invalid_grant");
	});

	test("revokes the token at Google", async () => {
		const h = harness([{}]);
		await h.auth.revoke("token-value");

		expect(h.calls[0]?.url).toContain("oauth2.googleapis.com/revoke");
		expect(h.calls[0]?.raw).toBe("token=token-value");
	});

	test("cancels a pending code", async () => {
		const h = harness([START]);
		await h.auth.start("user");
		h.auth.cancel("user");

		expect(await h.auth.poll("user")).toEqual({ status: "expired" });
	});
});
