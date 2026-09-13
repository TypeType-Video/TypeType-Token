import type { RemoteLoginPage } from "./remote-login-browser.ts";
import { sendRemoteLoginCompletion } from "./remote-login-callback.ts";
import type { RemoteLoginConfig } from "./remote-login-config.ts";
import { describeError, describeUrl, RemoteLoginDiagnostics } from "./remote-login-diagnostics.ts";
import { RemoteLoginInputQueue } from "./remote-login-input-queue.ts";
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

const SCREENSHOT_FAILURE_LOG_EVERY = 20;

export class RemoteLoginSession {
	readonly sessionId: string;
	readonly userId: string;
	readonly expiresAt: number;
	private readonly config: RemoteLoginConfig;
	private readonly createPage: RemoteLoginPageFactory;
	private readonly onDone: (sessionId: string, userId: string) => void;
	private readonly target: RemoteLoginSessionOptions["target"];
	private readonly poToken = new RemoteLoginPoToken();
	private readonly diagnostics: RemoteLoginDiagnostics;
	private page: RemoteLoginPage | null = null;
	private connection: RemoteLoginConnection | null = null;
	private phase: RemoteLoginPhase = "opening";
	private closed = false;
	private captureStarted = false;
	private lastLoginState = "";
	private screenshotFailures = 0;
	private expiryTimer: ReturnType<typeof setTimeout>;
	private frameTimer: ReturnType<typeof setTimeout> | null = null;
	private loginTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly inputQueue = new RemoteLoginInputQueue(
		(message) => this.fail(message),
		(message) => this.diagnostics.log(message),
	);
	constructor(options: RemoteLoginSessionOptions) {
		this.sessionId = options.sessionId;
		this.userId = options.userId;
		this.expiresAt = options.expiresAt;
		this.config = options.config;
		this.createPage = options.createPage;
		this.onDone = options.onDone;
		this.target = options.target;
		this.diagnostics = new RemoteLoginDiagnostics(this.sessionId.slice(0, 8));
		this.expiryTimer = setTimeout(() => this.fail("Session expired"), this.expiresAt - Date.now());
	}
	async start(): Promise<void> {
		try {
			this.setPhase("opening");
			this.diagnostics.log(
				`session start viewport=${this.config.viewportWidth}x${this.config.viewportHeight} headless=${this.config.headless} channel=${this.config.browserChannel ?? "chromium"} locale=${this.config.locale} ttlMs=${this.expiresAt - Date.now()}`,
			);
			const page = await this.createPage(this.config, (poToken) => this.receivePoToken(poToken));
			if (this.closed) {
				void page.close();
				return;
			}
			this.page = page;
			page.observe((event) => this.diagnostics.log(event));
			this.diagnostics.log(`page ready url=${describeUrl(page.url())}`);
			await this.inputQueue.attach(page.page);
			if (this.closed) return;
			this.setPhase("awaiting_login");
			this.scheduleFrames();
			this.scheduleLoginCheck();
		} catch (error) {
			this.diagnostics.log(`browser start failed: ${describeError(error)}`);
			this.fail("Remote browser failed to start");
		}
	}
	attach(connection: RemoteLoginConnection): void {
		if (this.connection) this.connection.close(1000, "Connection replaced");
		this.connection = connection;
		this.diagnostics.attach(connection);
		this.diagnostics.log("client websocket attached");
		this.sendStatus();
		this.scheduleFrames();
	}
	handleMessage(raw: string | Buffer): void {
		if (this.closed || typeof raw !== "string") return;
		const message = parseRemoteLoginInput(raw);
		if (!message) {
			this.diagnostics.log(`rejected client message ${raw.slice(0, 80)}`);
			return;
		}
		this.inputQueue.enqueue(message);
	}
	disconnect(): void {
		this.fail("WebSocket disconnected");
	}
	cancel(): void {
		this.fail("Session cancelled");
	}
	private receivePoToken(poToken: string): void {
		this.diagnostics.log(`po token observed length=${poToken.length}`);
		this.poToken.receive(poToken);
	}
	private scheduleLoginCheck(): void {
		if (this.closed || this.captureStarted) return;
		this.loginTimer = setTimeout(() => void this.checkLogin(), 1000);
	}
	private async checkLogin(): Promise<void> {
		if (this.closed || this.captureStarted || !this.page) return;
		try {
			await this.logLoginState(this.page);
			if (await this.page.hasLoginCookie()) {
				void this.captureSession();
			} else {
				this.scheduleLoginCheck();
			}
		} catch (error) {
			this.diagnostics.log(`login check failed: ${describeError(error)}`);
			this.scheduleLoginCheck();
		}
	}
	private async logLoginState(page: RemoteLoginPage): Promise<void> {
		const state = `url=${describeUrl(page.url())} cookies=${await page.cookieSummary()}`;
		if (state === this.lastLoginState) return;
		this.lastLoginState = state;
		this.diagnostics.log(`login check ${state}`);
	}
	private async captureSession(): Promise<void> {
		if (this.closed || !this.page || this.captureStarted) return;
		this.captureStarted = true;
		this.diagnostics.log(`youtube login detected at url=${describeUrl(this.page.url())}`);
		this.setPhase("capturing_session");
		const probeStarted = Date.now();
		await this.page.page
			.goto(this.config.probeVideoUrl, { waitUntil: "domcontentloaded", timeout: 30_000 })
			.then(() => this.diagnostics.log(`probe page loaded in ${Date.now() - probeStarted}ms`))
			.catch((error) => this.diagnostics.log(`probe page failed: ${describeError(error)}`));
		const poToken = await this.poToken.wait(this.config.potTimeoutMs);
		if (!poToken || this.closed) {
			this.diagnostics.log(
				`po token wait ended without token after ${Date.now() - probeStarted}ms`,
			);
			return this.fail("PO token capture timed out");
		}
		const cookies = await this.page.cookies();
		const authUser = await this.page.authUser();
		this.diagnostics.log(
			`captured cookies=${cookies.split("\n").length - 1} lines bytes=${cookies.length} authUser=${authUser} poToken=${poToken.length} chars`,
		);
		const sent = await sendRemoteLoginCompletion(
			this.target,
			this.sessionId,
			cookies,
			poToken,
			authUser,
			this.config,
		);
		this.diagnostics.log(`completion callback ${sent ? "accepted" : "rejected"} by server`);
		if (!sent || this.closed) return this.fail("Completion callback failed");
		this.setPhase("connected");
		setTimeout(() => this.finish(1000, "Connected"), 50);
	}
	private scheduleFrames(): void {
		if (this.phase === "opening") return;
		if (this.closed || !this.connection || !this.page || this.frameTimer) return;
		this.frameTimer = setTimeout(() => void this.sendFrame(), this.config.frameIntervalMs);
	}
	private async sendFrame(): Promise<void> {
		this.frameTimer = null;
		if (this.closed || !this.connection || !this.page) return;
		if (this.connection.bufferedAmount() <= this.config.maxBufferedBytes) {
			const frame = await this.page.page
				.screenshot({ type: "jpeg", quality: this.config.jpegQuality })
				.catch((error) => this.reportScreenshotFailure(error));
			if (frame && frame.byteLength <= this.config.maxFrameBytes) this.connection.sendBinary(frame);
		}
		this.scheduleFrames();
	}
	private reportScreenshotFailure(error: unknown): null {
		this.screenshotFailures += 1;
		if (
			this.screenshotFailures === 1 ||
			this.screenshotFailures % SCREENSHOT_FAILURE_LOG_EVERY === 0
		) {
			this.diagnostics.log(
				`screenshot failed #${this.screenshotFailures}: ${describeError(error)}`,
			);
		}
		return null;
	}
	private setPhase(phase: RemoteLoginPhase): void {
		this.phase = phase;
		this.diagnostics.log(`phase ${phase}`);
		this.sendStatus();
	}
	private sendStatus(): void {
		this.connection?.sendText(statusMessage(this.phase));
	}
	private fail(message: string): void {
		if (this.closed) return;
		this.diagnostics.log(`session failed: ${message}`);
		this.connection?.sendText(errorMessage(message));
		this.finish(1000, message);
	}
	private finish(code: number, reason: string): void {
		if (this.closed) return;
		this.closed = true;
		this.diagnostics.log(`session closed: ${reason}`);
		this.inputQueue.close();
		clearTimeout(this.expiryTimer);
		if (this.frameTimer) clearTimeout(this.frameTimer);
		if (this.loginTimer) clearTimeout(this.loginTimer);
		this.connection?.close(code, reason);
		void this.page?.close();
		this.onDone(this.sessionId, this.userId);
	}
}
