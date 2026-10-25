type Listener = () => void;
type Evaluate = (args: unknown) => Promise<unknown>;

export class FakePage {
	closed = false;
	evaluate: Evaluate;
	private readonly closeListeners: Listener[] = [];

	constructor(
		readonly userAgent: string,
		evaluate: Evaluate,
	) {
		this.evaluate = evaluate;
	}

	async route(): Promise<void> {}

	async goto(): Promise<null> {
		return null;
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

	constructor(private readonly evaluate: () => Evaluate) {}

	isConnected(): boolean {
		return this.connected;
	}

	on(_event: "disconnected", listener: Listener): void {
		this.disconnectListeners.push(listener);
	}

	async newPage(options: { userAgent: string }): Promise<FakePage> {
		if (!this.connected) throw new Error("Target page, context or browser has been closed");
		const page = new FakePage(options.userAgent, this.evaluate());
		this.pages.push(page);
		return page;
	}

	disconnect(): void {
		this.connected = false;
		for (const page of this.pages) void page.close();
		for (const listener of this.disconnectListeners) listener();
	}
}

export class FakeChromium {
	readonly browsers: FakeBrowser[] = [];
	evaluate: Evaluate = async () => "evaluated";

	async launch(): Promise<FakeBrowser> {
		await Promise.resolve();
		const browser = new FakeBrowser(() => this.evaluate);
		this.browsers.push(browser);
		return browser;
	}
}
