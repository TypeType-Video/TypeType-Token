import { setSystemTime } from "bun:test";
import type { BotGuardChallenge } from "../src/botguard-challenge.ts";

export type FakeBotGuardHandlers = {
	execute: (challenge: BotGuardChallenge) => Promise<string>;
	mint: (integrityToken: string, identifier: string) => Promise<string>;
	close?: (context: FakeBotGuardContext) => void;
};

export class FakeBotGuardContextClosedError extends Error {}

export class FakeBotGuardContext {
	closed = false;

	constructor(private readonly handlers: FakeBotGuardHandlers) {}

	isClosed(): boolean {
		return this.closed;
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.handlers.close?.(this);
	}

	execute(challenge: BotGuardChallenge): Promise<string> {
		return this.handlers.execute(challenge);
	}

	mint(integrityToken: string, identifier: string): Promise<string> {
		if (this.closed) return Promise.reject(new FakeBotGuardContextClosedError());
		return this.handlers.mint(integrityToken, identifier);
	}
}

export function fakeBotGuardModule(
	handlers: FakeBotGuardHandlers,
	opened: FakeBotGuardContext[] = [],
): Record<string, unknown> {
	return {
		BotGuardContext: {
			open: async () => {
				const context = new FakeBotGuardContext(handlers);
				opened.push(context);
				return context;
			},
		},
		BotGuardContextClosedError: FakeBotGuardContextClosedError,
	};
}

export function passForcedRefreshCooldown(): void {
	setSystemTime(new Date(Date.now() + 31_000));
}
