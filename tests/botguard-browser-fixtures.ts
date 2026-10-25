type Listener = () => void;
export type FakeEvaluate = (page: FakePage, args: Record<string, unknown>) => Promise<unknown>;

export class FakePage {
	closed = false;
	executed = false;
	private readonly closeListeners: Listener[] = [];

	constructor(
		readonly userAgent: string,
		private readonly evaluator: () => FakeEvaluate,
	) {}

	async route(): Promise<void> {}

	async goto(): Promise<null> {
		return null;
	}

	evaluate(_script: unknown, args: Record<string, unknown>): Promise<unknown> {
		if (this.closed) return Promise.reject(new Error("Target page has been closed"));
		return this.evaluator()(this, args);
	}

	isClosed(): boolean {
		return this.closed;
	}

	on(_event: "close", listener: Listener): void {
		this.closeListeners.push(listener);
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		for (const listener of this.closeListeners) listener();
	}
}

export class FakeBrowser {
	connected = true;
	readonly pages: FakePage[] = [];
	private readonly disconnectListeners: Listener[] = [];

	constructor(private readonly evaluator: () => FakeEvaluate) {}

	isConnected(): boolean {
		return this.connected;
	}

	on(_event: "disconnected", listener: Listener): void {
		this.disconnectListeners.push(listener);
	}

	async newPage(options: { userAgent: string }): Promise<FakePage> {
		if (!this.connected) throw new Error("Target page, context or browser has been closed");
		const page = new FakePage(options.userAgent, this.evaluator);
		this.pages.push(page);
		return page;
	}

	disconnect(): void {
		this.connected = false;
		for (const page of this.pages) void page.close();
		for (const listener of this.disconnectListeners) listener();
	}
}

export const statefulBotGuardEvaluate: FakeEvaluate = async (page, args) => {
	if ("prog" in args) {
		page.executed = true;
		return "botguard-response";
	}
	if (!page.executed) throw new Error("PMD:Undefined");
	return `pot-${String(args.id)}`;
};

export class FakeChromium {
	readonly browsers: FakeBrowser[] = [];
	evaluate: FakeEvaluate = statefulBotGuardEvaluate;

	async launch(): Promise<FakeBrowser> {
		await Promise.resolve();
		const browser = new FakeBrowser(() => this.evaluate);
		this.browsers.push(browser);
		return browser;
	}

	allPages(): FakePage[] {
		return this.browsers.flatMap((browser) => browser.pages);
	}
}

export const sharedChromium = new FakeChromium();
