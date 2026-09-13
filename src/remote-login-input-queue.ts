import type { RemoteLoginPage } from "./remote-login-browser.ts";
import { describeError } from "./remote-login-diagnostics.ts";
import { applyRemoteLoginInput } from "./remote-login-input.ts";
import type { RemoteLoginInput } from "./remote-login-messages.ts";

const MAX_INPUT_QUEUE = 128;

export class RemoteLoginInputQueue {
	private readonly pending: RemoteLoginInput[] = [];
	private page: RemoteLoginPage["page"] | null = null;
	private draining = false;
	private closed = false;

	constructor(
		private readonly fail: (message: string) => void,
		private readonly report: (message: string) => void = () => undefined,
	) {}

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
				this.report(`input queue exceeded ${MAX_INPUT_QUEUE} pending events`);
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
		let current: RemoteLoginInput | undefined;
		try {
			while (!this.closed) {
				current = this.pending.shift();
				if (!current) return;
				await applyRemoteLoginInput(page, current);
				if (current.type !== "pointer" || current.event !== "move")
					this.report(describeInput(current));
			}
		} catch (error) {
			if (!this.closed) {
				this.close();
				this.report(
					`input ${current ? describeInput(current) : "unknown"} failed: ${describeError(error)}`,
				);
				this.fail("Remote browser input failed");
			}
		} finally {
			this.draining = false;
		}
	}
}

function describeInput(message: RemoteLoginInput): string {
	if (message.type === "pointer") return `pointer ${message.event} ${message.x},${message.y}`;
	if (message.type === "key") return `key ${message.event} ${message.key}`;
	if (message.type === "text") return `text ${message.value.length} chars`;
	if (message.type === "resize") return `resize ${message.width}x${message.height}`;
	if (message.type === "wheel") return `wheel ${message.deltaX},${message.deltaY}`;
	return message.type;
}
