export type RemoteLoginPhase = "opening" | "awaiting_login" | "capturing_session" | "connected";

export type RemoteLoginStartRequest = {
	serverSessionId: string;
	userId: string;
	callbackUrl: string;
	ttlMs: number;
};

export type RemoteLoginStartResponse = {
	sessionId: string;
	expiresAt: number;
};

export type RemoteLoginReadinessRequest = {
	callbackUrl: string;
};

export type PointerButton = "left" | "middle" | "right";

export type RemoteLoginInput =
	| { type: "resize"; width: number; height: number }
	| { type: "pointer"; event: "move" | "down" | "up"; x: number; y: number; button?: PointerButton }
	| { type: "wheel"; deltaX: number; deltaY: number }
	| { type: "key"; event: "down" | "up"; key: string; code?: string; modifiers?: string[] }
	| { type: "text"; value: string }
	| { type: "cancel" };

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return Math.trunc(Math.min(Math.max(value, min), max));
}

function stringValue(value: unknown, maxLength: number): string | null {
	if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return null;
	return value;
}

function pointerButton(value: unknown): PointerButton {
	return value === "middle" || value === "right" ? value : "left";
}

export function parseStartRequest(value: unknown): RemoteLoginStartRequest | null {
	if (!isRecord(value)) return null;
	const serverSessionId = stringValue(value.serverSessionId, 256);
	const userId = stringValue(value.userId, 256);
	const callbackUrl = stringValue(value.callbackUrl, 2048);
	const ttlMs = boundedInteger(value.ttlMs, 300_000, 600_000);
	if (!serverSessionId || !userId || !callbackUrl || ttlMs === null) return null;
	return { serverSessionId, userId, callbackUrl, ttlMs };
}

export function parseReadinessRequest(value: unknown): RemoteLoginReadinessRequest | null {
	if (!isRecord(value)) return null;
	const callbackUrl = stringValue(value.callbackUrl, 2048);
	return callbackUrl ? { callbackUrl } : null;
}

export function parseRemoteLoginInput(raw: string): RemoteLoginInput | null {
	const parsed = (() => {
		try {
			return JSON.parse(raw) as unknown;
		} catch {
			return null;
		}
	})();
	if (!isRecord(parsed)) return null;
	if (parsed.type === "cancel") return { type: "cancel" };
	if (parsed.type === "resize") {
		const width = boundedInteger(parsed.width, 360, 1920);
		const height = boundedInteger(parsed.height, 240, 1080);
		return width && height ? { type: "resize", width, height } : null;
	}
	if (parsed.type === "pointer") {
		const x = boundedInteger(parsed.x, 0, 4096);
		const y = boundedInteger(parsed.y, 0, 4096);
		if (x === null || y === null) return null;
		if (parsed.event !== "move" && parsed.event !== "down" && parsed.event !== "up") return null;
		return { type: "pointer", event: parsed.event, x, y, button: pointerButton(parsed.button) };
	}
	if (parsed.type === "wheel") {
		const deltaX = boundedInteger(parsed.deltaX, -5000, 5000);
		const deltaY = boundedInteger(parsed.deltaY, -5000, 5000);
		return deltaX !== null && deltaY !== null ? { type: "wheel", deltaX, deltaY } : null;
	}
	if (parsed.type === "key") {
		const key = stringValue(parsed.key, 64);
		if (!key || (parsed.event !== "down" && parsed.event !== "up")) return null;
		return { type: "key", event: parsed.event, key };
	}
	if (parsed.type === "text") {
		const value = stringValue(parsed.value, 4096);
		return value ? { type: "text", value } : null;
	}
	return null;
}

export function statusMessage(phase: RemoteLoginPhase): string {
	return JSON.stringify({ type: "status", phase });
}

export function errorMessage(message: string): string {
	return JSON.stringify({ type: "error", message });
}
