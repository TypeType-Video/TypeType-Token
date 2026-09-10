import { describe, expect, it, mock } from "bun:test";
import { RemoteLoginInputQueue } from "../src/remote-login-input-queue.ts";
import { fakeRemoteLoginPage } from "./remote-login-fixtures.ts";

describe("RemoteLoginInputQueue", () => {
	it("retains the last startup resize and applies it before a click", async () => {
		const page = fakeRemoteLoginPage().page;
		const calls: string[] = [];
		page.setViewportSize = async ({ width, height }) => {
			calls.push(`${width}x${height}`);
		};
		page.mouse.move = async () => {
			calls.push("move");
		};
		page.mouse.down = async () => {
			calls.push("down");
		};
		page.mouse.up = async () => {
			calls.push("up");
		};
		const queue = new RemoteLoginInputQueue(mock());
		queue.enqueue({ type: "resize", width: 900, height: 600 });
		queue.enqueue({ type: "resize", width: 816, height: 478 });
		queue.enqueue({ type: "pointer", event: "down", x: 640, y: 314 });
		queue.enqueue({ type: "pointer", event: "up", x: 640, y: 314 });
		expect(calls).toEqual([]);
		await queue.attach(page);
		expect(calls).toEqual(["816x478", "move", "down", "move", "up"]);
		queue.close();
	});

	it("cancels before browser creation without applying pending input", async () => {
		const fail = mock();
		const page = fakeRemoteLoginPage().page;
		page.setViewportSize = mock(async () => undefined);
		const queue = new RemoteLoginInputQueue(fail);
		queue.enqueue({ type: "resize", width: 816, height: 478 });
		queue.enqueue({ type: "cancel" });
		await queue.attach(page);
		expect(fail).toHaveBeenCalledWith("Session cancelled");
		expect(page.setViewportSize).not.toHaveBeenCalled();
	});

	it("closes on overflow instead of silently losing key or button releases", async () => {
		const fail = mock();
		const queue = new RemoteLoginInputQueue(fail);
		for (let i = 0; i < 129; i++) queue.enqueue({ type: "key", event: "down", key: "Tab" });
		const page = fakeRemoteLoginPage().page;
		page.keyboard.down = mock(async () => undefined);
		await queue.attach(page);
		expect(fail).toHaveBeenCalledTimes(1);
		expect(fail).toHaveBeenCalledWith("Remote browser input queue exceeded");
		expect(page.keyboard.down).not.toHaveBeenCalled();
	});

	it("reports rejected input and discards the remaining queue", async () => {
		const fail = mock();
		const page = fakeRemoteLoginPage().page;
		page.setViewportSize = async () => {
			throw new Error("closed browser");
		};
		page.keyboard.down = mock(async () => undefined);
		const queue = new RemoteLoginInputQueue(fail);
		queue.enqueue({ type: "resize", width: 816, height: 478 });
		queue.enqueue({ type: "key", event: "down", key: "Tab" });
		await queue.attach(page);
		expect(fail).toHaveBeenCalledWith("Remote browser input failed");
		expect(page.keyboard.down).not.toHaveBeenCalled();
	});
});
