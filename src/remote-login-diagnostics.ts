import type { Cookie } from "playwright";
import { logMessage } from "./remote-login-messages.ts";
import type { RemoteLoginConnection } from "./remote-login-session-types.ts";

const MAX_BUFFERED_LINES = 200;
const MAX_MESSAGE_LENGTH = 400;
const MAX_ERROR_LENGTH = 160;

export class RemoteLoginDiagnostics {
	private readonly startedAt = Date.now();
	private readonly buffered: string[] = [];
	private connection: RemoteLoginConnection | null = null;

	constructor(private readonly label: string) {}

	attach(connection: RemoteLoginConnection): void {
		this.connection = connection;
		for (const line of this.buffered) connection.sendText(line);
	}

	log(message: string): void {
		const at = Date.now() - this.startedAt;
		const text =
			message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}...` : message;
		console.log(`[remote-login ${this.label}] +${at}ms ${text}`);
		const line = logMessage(at, text);
		this.buffered.push(line);
		if (this.buffered.length > MAX_BUFFERED_LINES) this.buffered.shift();
		this.connection?.sendText(line);
	}
}

export function describeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return "invalid-url";
	}
}

export function describeCookies(cookies: Cookie[]): string {
	const byDomain = new Map<string, string[]>();
	for (const cookie of cookies) {
		const domain = cookie.domain.replace(/^\./, "");
		const names = byDomain.get(domain) ?? [];
		names.push(cookie.name);
		byDomain.set(domain, names);
	}
	if (byDomain.size === 0) return "none";
	return [...byDomain.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([domain, names]) => `${domain}=[${names.sort().join(",")}]`)
		.join(" ");
}

export function describeError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	const firstLine = message.split("\n", 1)[0] ?? "";
	return firstLine.length > MAX_ERROR_LENGTH
		? `${firstLine.slice(0, MAX_ERROR_LENGTH)}...`
		: firstLine;
}
