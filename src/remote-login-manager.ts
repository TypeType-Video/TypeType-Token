import { createRemoteLoginPage, probeRemoteLoginBrowser } from "./remote-login-browser.ts";
import type { RemoteLoginCompletionTarget } from "./remote-login-callback.ts";
import type { RemoteLoginConfig } from "./remote-login-config.ts";
import type { RemoteLoginStartResponse } from "./remote-login-messages.ts";
import { RemoteLoginSession } from "./remote-login-session.ts";
import type {
	RemoteLoginConnection,
	RemoteLoginPageFactory,
} from "./remote-login-session-types.ts";

export type RemoteLoginStartOptions = {
	userId: string;
	ttlMs: number;
	target: RemoteLoginCompletionTarget;
};

export type RemoteLoginRuntimeProbe = (config: RemoteLoginConfig) => Promise<void>;

export class RemoteLoginManager {
	private readonly config: RemoteLoginConfig;
	private readonly createPage: RemoteLoginPageFactory;
	private readonly probeRuntime: RemoteLoginRuntimeProbe;
	private readonly sessions = new Map<string, RemoteLoginSession>();
	private readonly byUser = new Map<string, string>();

	constructor(
		config: RemoteLoginConfig,
		createPage: RemoteLoginPageFactory = createRemoteLoginPage,
		probeRuntime: RemoteLoginRuntimeProbe = probeRemoteLoginBrowser,
	) {
		this.config = config;
		this.createPage = createPage;
		this.probeRuntime = probeRuntime;
	}

	async isReady(): Promise<boolean> {
		try {
			await this.probeRuntime(this.config);
			return true;
		} catch {
			return false;
		}
	}

	async start(options: RemoteLoginStartOptions): Promise<RemoteLoginStartResponse | null> {
		const existing = this.byUser.get(options.userId);
		if (existing) this.sessions.get(existing)?.cancel();
		if (this.sessions.size >= this.config.maxSessions) return null;
		const sessionId = crypto.randomUUID();
		const expiresAt = Date.now() + Math.min(options.ttlMs, this.config.ttlMs);
		const session = new RemoteLoginSession({
			sessionId,
			userId: options.userId,
			expiresAt,
			target: options.target,
			config: this.config,
			createPage: this.createPage,
			onDone: (doneSessionId, doneUserId) => this.deleteDone(doneSessionId, doneUserId),
		});
		this.sessions.set(sessionId, session);
		this.byUser.set(options.userId, sessionId);
		void session.start();
		return { sessionId, expiresAt };
	}

	has(sessionId: string): boolean {
		return this.sessions.has(sessionId);
	}

	attach(sessionId: string, connection: RemoteLoginConnection): boolean {
		const session = this.sessions.get(sessionId);
		if (!session) return false;
		session.attach(connection);
		return true;
	}

	message(sessionId: string, message: string | Buffer): void {
		this.sessions.get(sessionId)?.handleMessage(message);
	}

	disconnect(sessionId: string): void {
		this.sessions.get(sessionId)?.disconnect();
	}

	cancel(sessionId: string): boolean {
		const session = this.sessions.get(sessionId);
		if (!session) return false;
		session.cancel();
		return true;
	}

	activeCount(): number {
		return this.sessions.size;
	}

	private deleteDone(sessionId: string, userId: string): void {
		if (this.sessions.get(sessionId)?.sessionId === sessionId) this.sessions.delete(sessionId);
		if (this.byUser.get(userId) === sessionId) this.byUser.delete(userId);
	}
}
