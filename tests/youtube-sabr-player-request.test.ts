import { describe, expect, it } from "bun:test";
import {
	buildYoutubeSabrPlaybackContext,
	buildYoutubeSabrPlayerRequest,
} from "../src/youtube-sabr-player-request.ts";

describe("buildYoutubeSabrPlaybackContext", () => {
	it("nests reload params like the MWEB player request", () => {
		const context = buildYoutubeSabrPlaybackContext(123, "reload-token");

		expect(context.reloadPlaybackContext).toEqual({
			reloadPlaybackParams: { token: "reload-token" },
		});
	});

	it("omits reload context for initial player requests", () => {
		const context = buildYoutubeSabrPlaybackContext(123);

		expect(context.reloadPlaybackContext).toBeUndefined();
	});

	it("keeps the player and media token contracts separate", () => {
		const request = buildYoutubeSabrPlayerRequest(123, "visitor-bound", "reload-token");

		expect(request.serviceIntegrityDimensions.poToken).toBe("visitor-bound");
		expect(request.attestationRequest).toEqual({ omitBotguardData: true });
		expect(request.playbackContext.reloadPlaybackContext).toEqual({
			reloadPlaybackParams: { token: "reload-token" },
		});
	});
});
