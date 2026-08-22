import { describe, expect, it, mock } from "bun:test";
import type { SessionTokenResult } from "../src/token-service.ts";

const fetchSessionPoTokens = mock(
	async (
		videoId: string,
		sessionBinding: string,
		_refreshVideo = false,
	): Promise<SessionTokenResult> => ({
		visitorData: "token-visitor",
		visitorBoundPoToken: "visitor-token",
		videoBoundPoToken: `video-${videoId}`,
		poToken: "visitor-token",
		streamingPot: `video-${videoId}`,
		sessionBoundPoToken: `session-${sessionBinding}`,
	}),
);

mock.module("../src/token-service.ts", () => ({
	fetchPoToken: mock(async () => ({})),
	fetchSessionPoTokens,
}));

describe("POST /potoken/session", () => {
	it("returns tokens bound by one internal request", async () => {
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const { handlePoTokenRequest } = await import("../src/po-token-routes.ts?session-route-test");
		const request = new Request("http://localhost:8081/potoken/session", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ videoId: "kids", sessionBinding: "account-visitor" }),
		});
		const response = await handlePoTokenRequest(request, new URL(request.url));

		expect(response?.status).toBe(200);
		expect(await response?.json()).toMatchObject({
			videoBoundPoToken: "video-kids",
			sessionBoundPoToken: "session-account-visitor",
		});
		expect(fetchSessionPoTokens).toHaveBeenCalledWith("kids", "account-visitor", false);
	});

	it("rejects incomplete and oversized bindings", async () => {
		// @ts-expect-error Bun uses the query to isolate this module instance.
		const { handlePoTokenRequest } = await import("../src/po-token-routes.ts?session-route-test");
		const callsBefore = fetchSessionPoTokens.mock.calls.length;
		const request = new Request("http://localhost:8081/potoken/session", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ videoId: "kids", sessionBinding: "x".repeat(4097) }),
		});
		const response = await handlePoTokenRequest(request, new URL(request.url));

		expect(response?.status).toBe(400);
		expect(fetchSessionPoTokens.mock.calls.length).toBe(callsBefore);
	});
});
