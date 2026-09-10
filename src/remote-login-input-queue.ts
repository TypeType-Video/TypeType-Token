import type { RemoteLoginPage } from "./remote-login-browser.ts";
import { applyRemoteLoginInput } from "./remote-login-input.ts";
import type { RemoteLoginInput } from "./remote-login-messages.ts";

const MAX_INPUT_QUEUE = 128;

export class RemoteLoginInputQueue {
	private readonly pending: RemoteLoginInput[] = [];
	private page: RemoteLoginPage["page"] | null = null;
	private draining = false;
	private closed = false;

	constructor(private readonly fail: (message: string) => void) {}

	async attach(page: RemoteLoginPage["page"]): Promise<void> {
		if (this.closed) return;
		this.page = page;
		await this.drain();
	}

	enqueue(message: RemoteLoginInput): void {
		if (this.closed) return;
		if (message.type === "cancel") {
			this.close();
			this.fail("Session cancelled");
			return;
		}
		const last = this.pending.at(-1);
		if (
			(message.type === "resize" && last?.type === "resize") ||
			(message.type === "pointer" &&
				message.event === "move" &&
				last?.type === "pointer" &&
				last.event === "move")
		) {
			this.pending[this.pending.length - 1] = message;
		} else {
			if (this.pending.length >= MAX_INPUT_QUEUE) {
				this.close();
				this.fail("Remote browser input queue exceeded");
				return;
			}
			this.pending.push(message);
		}
		void this.drain();
	}

	close(): void {
		this.closed = true;
		this.pending.length = 0;
		this.page = null;
	}

	private async drain(): Promise<void> {
		const page = this.page;
		if (this.closed || this.draining || !page) return;
		this.draining = true;
		try {
			while (!this.closed) {
				const message = this.pending.shift();
				if (!message) return;
				await applyRemoteLoginInput(page, message);
			}
		} catch {
			if (!this.closed) {
				this.close();
				this.fail("Remote browser input failed");
			}
		} finally {
			this.draining = false;
		}
	}
}
