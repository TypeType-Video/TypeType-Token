import { describe, expect, it } from "bun:test";
import type { BotGuardSessionStatus } from "../src/botguard-session-store.ts";
import { createServiceStatusRoutes } from "../src/service-status-routes.ts";
import type { TvPoTokenStatus } from "../src/tv-po-token.ts";

const NOW = 1_000_000;
const WARM_SESSION: BotGuardSessionStatus = {
	generation: "boot-1",
	expiresAt: NOW + 60_000,
	usable: true,
	refreshing: false,
	lastRefreshAt: NOW - 1_000,
	lastError: null,
};
const WARM_TV: TvPoTokenStatus = {
	expiresAt: NOW + 30_000,
	lastMintAt: NOW - 2_000,
	lastError: null,
};

async function ready(
	session: Partial<BotGuardSessionStatus> = {},
	tv: Partial<TvPoTokenStatus> = {},
	browserConnected = true,
): Promise<{ status: number; body: Record<string, unknown> }> {
	const routes = createServiceStatusRoutes({
		browserConnected: () => browserConnected,
		session: () => ({ ...WARM_SESSION, ...session }),
		tv: () => ({ ...WARM_TV, ...tv }),
		now: () => NOW,
	});
	const request = new Request("http://localhost:8081/ready");
	const response = routes(request, new URL(request.url));
	return { status: response?.status ?? 0, body: (await response?.json()) ?? {} };
}

describe("service status routes", () => {
	it("keeps /health a liveness check", async () => {
		const routes = createServiceStatusRoutes({
			browserConnected: () => false,
			session: () => ({ ...WARM_SESSION, usable: false, lastError: "down" }),
			tv: () => WARM_TV,
		});
		const request = new Request("http://localhost:8081/health");
		const response = routes(request, new URL(request.url));

		expect(response?.status).toBe(200);
		expect(await response?.json()).toEqual({ status: "ok" });
	});

	it("reports ready with the session generation and remaining lifetime", async () => {
		const { status, body } = await ready();

		expect(status).toBe(200);
		expect(body).toEqual({
			status: "ready",
			browserConnected: true,
			web: {
				ready: true,
				generation: "boot-1",
				expiresAt: NOW + 60_000,
				expiresInMs: 60_000,
				refreshing: false,
				lastRefreshAt: NOW - 1_000,
				lastError: null,
			},
			tv: {
				ready: true,
				expiresAt: NOW + 30_000,
				expiresInMs: 30_000,
				lastMintAt: NOW - 2_000,
				lastError: null,
			},
		});
	});

	it("is not ready while the browser is disconnected", async () => {
		expect((await ready({}, {}, false)).status).toBe(503);
	});

	it("is not ready without an unexpired session", async () => {
		const { status, body } = await ready({ usable: false, expiresAt: NOW - 1 });

		expect(status).toBe(503);
		expect(body.web).toMatchObject({ ready: false, expiresInMs: 0 });
	});

	it("is not ready after a failed refresh or TV mint", async () => {
		const web = await ready({ lastError: "WAA GenerateIT request failed: 403" });
		const tv = await ready({}, { lastError: "tv page request failed: 429" });
		const cold = await ready({}, { lastMintAt: null, expiresAt: null });

		expect(web.status).toBe(503);
		expect(web.body.web).toMatchObject({ lastError: "WAA GenerateIT request failed: 403" });
		expect(tv.status).toBe(503);
		expect(cold.status).toBe(503);
	});
});
