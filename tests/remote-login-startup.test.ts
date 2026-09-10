import { expect, it } from "bun:test";
import { RemoteLoginSession } from "../src/remote-login-session.ts";
import {
	fakeRemoteLoginPage,
	remoteLoginTarget,
	remoteLoginTestConfig,
} from "./remote-login-fixtures.ts";

it("applies startup dimensions before announcing that the remote browser is ready", async () => {
	const events: string[] = [];
	const ready = Promise.withResolvers<void>();
	const resized = Promise.withResolvers<void>();
	const page = fakeRemoteLoginPage();
	page.page.setViewportSize = async ({ width, height }) => {
		events.push(`${width}x${height}`);
		await resized.promise;
	};
	const session = new RemoteLoginSession({
		sessionId: "startup",
		userId: "user",
		expiresAt: Date.now() + 300_000,
		target: remoteLoginTarget(),
		config: remoteLoginTestConfig(),
		createPage: async () => {
			await ready.promise;
			return page;
		},
		onDone: () => undefined,
	});
	session.attach({
		sendText: (raw) => {
			events.push(JSON.parse(raw).phase);
			return true;
		},
		sendBinary: () => {
			events.push("frame");
			return true;
		},
		bufferedAmount: () => 0,
		close: () => undefined,
	});
	try {
		const starting = session.start();
		session.handleMessage(JSON.stringify({ type: "resize", width: 816, height: 478 }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		ready.resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(events).toContain("816x478");
		expect(events).not.toContain("awaiting_login");
		expect(events).not.toContain("frame");
		resized.resolve();
		await starting;
		expect(events.indexOf("816x478")).toBeLessThan(events.indexOf("awaiting_login"));
	} finally {
		ready.resolve();
		resized.resolve();
		session.cancel();
	}
});
