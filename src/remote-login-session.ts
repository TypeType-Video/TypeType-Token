import type { RemoteLoginPage } from "./remote-login-browser.ts";
import { sendRemoteLoginCompletion } from "./remote-login-callback.ts";
import type { RemoteLoginConfig } from "./remote-login-config.ts";
import { applyRemoteLoginInput } from "./remote-login-input.ts";
import {
	errorMessage,
	parseRemoteLoginInput,
	type RemoteLoginPhase,
	statusMessage,
} from "./remote-login-messages.ts";
import { RemoteLoginPoToken } from "./remote-login-po-token.ts";
import type {
	RemoteLoginConnection,
	RemoteLoginPageFactory,
	RemoteLoginSessionOptions,
} from "./remote-login-session-types.ts";

export class RemoteLoginSession {
	readonly sessionId: string;
	readonly userId: string;
	readonly expiresAt: number;
	private readonly config: RemoteLoginConfig;
	private readonly createPage: RemoteLoginPageFactory;
	private readonly onDone: (sessionId: string, userId: string) => void;
	private readonly target: RemoteLoginSessionOptions["target"];
	private readonly poToken = new RemoteLoginPoToken();
	private page: RemoteLoginPage | null = null;
	private connection: RemoteLoginConnection | null = null;
	private phase: RemoteLoginPhase = "opening";
	private closed = false;
	private captureStarted = false;
	private expiryTimer: ReturnType<typeof setTimeout>;
	private frameTimer: ReturnType<typeof setTimeout> | null = null;
	private loginTimer: ReturnType<typeof setTimeout> | null = null;
	constructor(options: RemoteLoginSessionOptions) {
		this.sessionId = options.sessionId;
		this.userId = options.userId;
		this.expiresAt = options.expiresAt;
		this.config = options.config;
		this.createPage = options.createPage;
		this.onDone = options.onDone;
		this.target = options.target;
		this.expiryTimer = setTimeout(() => this.fail("Session expired"), this.expiresAt - Date.now());
	}
	async start(): Promise<void> {
		try {
			this.setPhase("opening");
			const page = await this.createPage(this.config, (poToken) => this.poToken.receive(poToken));
			if (this.closed) {
				void page.close();
				return;
			}
			this.page = page;
			this.setPhase("awaiting_login");
			this.scheduleFrames();
			this.scheduleLoginCheck();
		} catch {
			this.fail("Remote browser failed to start");
		}
	}
	attach(connection: RemoteLoginConnection): void {
		if (this.connection) this.connection.close(1000, "Connection replaced");
		this.connection = connection;
		this.sendStatus();
		this.scheduleFrames();
	}
	handleMessage(raw: string | Buffer): void {
		if (this.closed || typeof raw !== "string") return;
		const message = parseRemoteLoginInput(raw);
		if (!message) return;
		void this.applyInput(message);
	}
	disconnect(): void {
		this.fail("WebSocket disconnected");
	}
	cancel(): void {
		this.fail("Session cancelled");
	}
	private async applyInput(message: ReturnType<typeof parseRemoteLoginInput>): Promise<void> {
		if (!message) return;
		const page = this.page?.page;
		if (!page) return;
		if ((await applyRemoteLoginInput(page, message)) === "cancelled") this.cancel();
	}
	private scheduleLoginCheck(): void {
		if (this.closed || this.captureStarted) return;
		this.loginTimer = setTimeout(() => void this.checkLogin(), 1000);
	}
	private async checkLogin(): Promise<void> {
		if (this.closed || this.captureStarted || !this.page) return;
		try {
			if (await this.page.hasLoginCookie()) {
				void this.captureSession();
			} else {
				this.scheduleLoginCheck();
			}
		} catch {
			this.scheduleLoginCheck();
		}
	}
	private async captureSession(): Promise<void> {
		if (this.closed || !this.page || this.captureStarted) return;
		this.captureStarted = true;
		this.setPhase("capturing_session");
		await this.page.page
			.goto(this.config.probeVideoUrl, {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			})
			.catch(() => undefined);
		const poToken = await this.poToken.wait(this.config.potTimeoutMs);
		if (!poToken || this.closed) return this.fail("PO token capture timed out");
		const cookies = await this.page.cookies();
		const authUser = await this.page.authUser();
		const sent = await sendRemoteLoginCompletion(
			this.target,
			this.sessionId,
			cookies,
			poToken,
			authUser,
			this.config,
		);
		if (!sent || this.closed) return this.fail("Completion callback failed");
		this.setPhase("connected");
		setTimeout(() => this.finish(1000, "Connected"), 50);
	}
	private scheduleFrames(): void {
		if (this.closed || !this.connection || !this.page || this.frameTimer) return;
		this.frameTimer = setTimeout(() => void this.sendFrame(), this.config.frameIntervalMs);
	}
	private async sendFrame(): Promise<void> {
		this.frameTimer = null;
		if (this.closed || !this.connection || !this.page) return;
		if (this.connection.bufferedAmount() <= this.config.maxBufferedBytes) {
			const frame = await this.page.page
				.screenshot({
					type: "jpeg",
					quality: this.config.jpegQuality,
				})
				.catch(() => null);
			if (frame && frame.byteLength <= this.config.maxFrameBytes) this.connection.sendBinary(frame);
		}
		this.scheduleFrames();
	}
	private setPhase(phase: RemoteLoginPhase): void {
		this.phase = phase;
		this.sendStatus();
	}
	private sendStatus(): void {
		this.connection?.sendText(statusMessage(this.phase));
	}
	private fail(message: string): void {
		if (this.closed) return;
		this.connection?.sendText(errorMessage(message));
		this.finish(1000, message);
	}
	private finish(code: number, reason: string): void {
		if (this.closed) return;
		this.closed = true;
		clearTimeout(this.expiryTimer);
		if (this.frameTimer) clearTimeout(this.frameTimer);
		if (this.loginTimer) clearTimeout(this.loginTimer);
		this.connection?.close(code, reason);
		void this.page?.close();
		this.onDone(this.sessionId, this.userId);
	}
}
