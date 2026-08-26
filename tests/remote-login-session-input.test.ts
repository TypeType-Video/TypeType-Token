import { describe, expect, it } from "bun:test";
import { RemoteLoginSession } from "../src/remote-login-session.ts";
import {
	fakeRemoteLoginPage,
	remoteLoginTarget,
	remoteLoginTestConfig,
} from "./remote-login-fixtures.ts";

function waitFor(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RemoteLoginSession input handling", () => {
	it("keeps a click's press and release in order", async () => {
		const calls: string[] = [];
		let releaseMove: (() => void) | null = null;
		const page = fakeRemoteLoginPage({
			page: {
				goto: async () => undefined,
				setViewportSize: async () => undefined,
				screenshot: async () => Buffer.from("frame"),
				mouse: {
					move: async () => {
						calls.push("move");
						if (calls.length === 1) await new Promise<void>((resolve) => (releaseMove = resolve));
					},
					down: async () => {
						calls.push("down");
					},
					up: async () => {
						calls.push("up");
					},
					wheel: async () => undefined,
				},
				keyboard: {
					down: async () => undefined,
					up: async () => undefined,
					insertText: async () => undefined,
				},
			},
		});
		const session = new RemoteLoginSession({
			sessionId: "session",
			userId: "user",
			expiresAt: Date.now() + 300_000,
			target: remoteLoginTarget(),
			config: remoteLoginTestConfig(),
			createPage: async () => page,
			onDone: () => undefined,
		});

		await session.start();
		session.handleMessage(JSON.stringify({ type: "pointer", event: "down", x: 10, y: 20 }));
		session.handleMessage(JSON.stringify({ type: "pointer", event: "up", x: 10, y: 20 }));
		await waitFor(0);
		expect(calls).toEqual(["move"]);

		releaseMove?.();
		await waitFor(0);
		await waitFor(0);
		expect(calls).toEqual(["move", "down", "move", "up"]);
		session.cancel();
	});
});
