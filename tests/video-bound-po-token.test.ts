import { describe, expect, it, mock } from "bun:test";
import type { BotGuardContext } from "../src/botguard-page.ts";
import {
	type CachedSession,
	getVideoBoundPoToken,
	RetiredBotGuardSessionError,
	refreshVideoBoundPoToken,
} from "../src/video-bound-po-token.ts";
import { FakeBotGuardContext } from "./botguard-context-fixtures.ts";

function retiredSession(mint: (token: string, id: string) => Promise<string>): CachedSession {
	const context = new FakeBotGuardContext({ execute: async () => "response", mint });
	return {
		context: context as unknown as BotGuardContext,
		generation: "generation-1",
		retired: true,
		visitorData: "visitor",
		visitorBoundPoToken: "visitor-token",
		integrityToken: "old-integrity-token",
		expiresAt: Date.now() + 60_000,
		videoBoundPoTokens: new Map(),
		videoBoundPoTokenRequests: new Map(),
	};
}

describe("video-bound PO tokens", () => {
	it("refuses to mint with the integrity token of a replaced session", async () => {
		const mint = mock(async (_token: string, id: string) => `pot-${id}`);
		const session = retiredSession(mint);

		await expect(getVideoBoundPoToken(session, "video")).rejects.toBeInstanceOf(
			RetiredBotGuardSessionError,
		);
		await expect(refreshVideoBoundPoToken(session, "video")).rejects.toBeInstanceOf(
			RetiredBotGuardSessionError,
		);
		expect(mint).not.toHaveBeenCalled();
	});
});
