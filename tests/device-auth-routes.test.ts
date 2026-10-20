import { describe, expect, test } from "bun:test";
import { DeviceAuth } from "../src/device-auth.ts";
import { createDeviceAuthRoutes } from "../src/device-auth-routes.ts";

const START = {
	device_code: "secret-device-code",
	user_code: "ABCD-EFGH",
	verification_url: "https://www.google.com/device",
	expires_in: 1800,
	interval: 5,
};

function setup(responses: Array<{ status?: number; body: unknown }> = []) {
	let clock = 1_700_000_000_000;
	const calls: string[] = [];
	const auth = new DeviceAuth({
		now: () => clock,
		randomId: () => "device-id",
		fetchImpl: async (url) => {
			calls.push(url);
			const next = responses.shift() ?? { body: {} };
			return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
		},
	});
	return {
		routes: createDeviceAuthRoutes(auth),
		calls,
		advance: (ms: number) => {
			clock += ms;
		},
	};
}

function post(path: string, body: unknown): Request {
	return new Request(`http://token${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("device auth routes", () => {
	test("starts a device code without the device code in the payload", async () => {
		const h = setup([{ body: START }]);
		const res = await h.routes(
			post("/device/start", { accountKey: "user" }),
			new URL("http://token/device/start"),
		);
		const text = await res?.text();

		expect(res?.status).toBe(200);
		expect(text).toContain("ABCD-EFGH");
		expect(text).not.toContain("secret-device-code");
	});

	test("requires an account key", async () => {
		const h = setup();
		const res = await h.routes(post("/device/start", {}), new URL("http://token/device/start"));

		expect(res?.status).toBe(400);
	});

	test("polls and returns the authorization state", async () => {
		const h = setup([
			{ body: START },
			{ body: { access_token: "access", refresh_token: "refresh", expires_in: 3600 } },
		]);
		await h.routes(
			post("/device/start", { accountKey: "user" }),
			new URL("http://token/device/start"),
		);
		h.advance(5_000);
		const res = await h.routes(
			post("/device/poll", { accountKey: "user" }),
			new URL("http://token/device/poll"),
		);
		const body = (await res?.json()) as { status: string; tokens?: { accessToken: string } };

		expect(body.status).toBe("authorized");
		expect(body.tokens?.accessToken).toBe("access");
	});

	test("cancels a pending code", async () => {
		const h = setup([{ body: START }]);
		await h.routes(
			post("/device/start", { accountKey: "user" }),
			new URL("http://token/device/start"),
		);
		const cancel = await h.routes(
			post("/device/cancel", { accountKey: "user" }),
			new URL("http://token/device/cancel"),
		);
		const poll = await h.routes(
			post("/device/poll", { accountKey: "user" }),
			new URL("http://token/device/poll"),
		);

		expect(cancel?.status).toBe(204);
		expect(await poll?.json()).toEqual({ status: "expired" });
	});

	test("maps invalid_grant on refresh to 401", async () => {
		const h = setup([{ status: 400, body: { error: "invalid_grant" } }]);
		const res = await h.routes(
			post("/device/refresh", { refreshToken: "revoked" }),
			new URL("http://token/device/refresh"),
		);

		expect(res?.status).toBe(401);
		expect(await res?.json()).toEqual({ error: "invalid_grant" });
	});

	test("revokes a token", async () => {
		const h = setup([{ body: {} }]);
		const res = await h.routes(
			post("/device/revoke", { token: "value" }),
			new URL("http://token/device/revoke"),
		);

		expect(res?.status).toBe(204);
		expect(h.calls[0]).toContain("oauth2.googleapis.com/revoke");
	});

	test("ignores unrelated paths", async () => {
		const h = setup();
		expect(await h.routes(post("/other", {}), new URL("http://token/other"))).toBeNull();
	});
});
