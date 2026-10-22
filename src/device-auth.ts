const DEVICE_CODE_URL = "https://www.youtube.com/o/oauth2/device/code";
const TOKEN_URL = "https://www.youtube.com/o/oauth2/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

const CLIENT_ID = "861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com";
const CLIENT_SECRET = "SboVhoG9s0rNafixCSGGKXAT";
const SCOPE = "http://gdata.youtube.com https://www.googleapis.com/auth/youtube-paid-content";
const MODEL_NAME = "ytlr::";
const DEVICE_GRANT_TYPE = "http://oauth.net/grant_type/device/1.0";

export const DEVICE_CODE_TTL_MS = 30 * 60_000;
const MAX_PENDING = 500;

export type DeviceTokens = {
	accessToken: string;
	refreshToken: string | null;
	expiresIn: number;
	scope: string;
};

export type DeviceStart = {
	userCode: string;
	verificationUrl: string;
	expiresAt: number;
	intervalSeconds: number;
};

export type DevicePoll =
	| { status: "pending" }
	| { status: "slow_down" }
	| { status: "expired" }
	| { status: "denied" }
	| { status: "authorized"; tokens: DeviceTokens };

type PendingDevice = {
	deviceCode: string;
	expiresAt: number;
	intervalSeconds: number;
	nextPollAt: number;
	userCode: string;
	verificationUrl: string;
};

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

type Options = {
	fetchImpl?: FetchLike;
	now?: () => number;
	randomId?: () => string;
};

export class DeviceAuth {
	private readonly pending = new Map<string, PendingDevice>();
	private readonly fetchImpl: FetchLike;
	private readonly now: () => number;
	private readonly randomId: () => string;

	constructor(options: Options = {}) {
		this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
		this.now = options.now ?? (() => Date.now());
		this.randomId =
			options.randomId ??
			(() =>
				Array.from(crypto.getRandomValues(new Uint8Array(16)))
					.map((byte) => byte.toString(16).padStart(2, "0"))
					.join(""));
	}

	async start(userKey: string): Promise<DeviceStart> {
		const existing = this.active(userKey);
		if (existing) return this.describe(existing);
		if (this.pending.size >= MAX_PENDING) {
			this.pruneExpired();
			if (this.pending.size >= MAX_PENDING) throw new Error("device auth capacity reached");
		}
		const response = await this.fetchImpl(DEVICE_CODE_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_id: CLIENT_ID,
				device_id: this.randomId(),
				model_name: MODEL_NAME,
				scope: SCOPE,
			}),
		});
		if (!response.ok) throw new Error("device code request rejected");
		const body = (await response.json()) as {
			device_code?: unknown;
			user_code?: unknown;
			verification_url?: unknown;
			expires_in?: unknown;
			interval?: unknown;
		};
		const deviceCode = stringValue(body.device_code);
		const userCode = stringValue(body.user_code);
		const verificationUrl = stringValue(body.verification_url);
		if (!deviceCode || !userCode || !verificationUrl)
			throw new Error("invalid device code response");
		const now = this.now();
		const expiresAt = now + Math.min(numberValue(body.expires_in, 1800), 1800) * 1000;
		const intervalSeconds = Math.max(5, Math.min(numberValue(body.interval, 5), 60));
		const entry: PendingDevice = {
			deviceCode,
			expiresAt,
			intervalSeconds,
			nextPollAt: now + intervalSeconds * 1000,
			userCode,
			verificationUrl,
		};
		this.pending.set(userKey, entry);
		return this.describe(entry);
	}

	async poll(userKey: string): Promise<DevicePoll> {
		const entry = this.pending.get(userKey);
		if (!entry) return { status: "expired" };
		const now = this.now();
		if (now >= entry.expiresAt) {
			this.pending.delete(userKey);
			return { status: "expired" };
		}
		if (now < entry.nextPollAt) return { status: "slow_down" };
		entry.nextPollAt = now + entry.intervalSeconds * 1000;
		const response = await this.fetchImpl(TOKEN_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				code: entry.deviceCode,
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
				grant_type: DEVICE_GRANT_TYPE,
			}),
		});
		const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
		if (response.status === 200 && typeof body.access_token === "string") {
			this.pending.delete(userKey);
			return { status: "authorized", tokens: parseTokens(body, null) };
		}
		const error = stringValue(body.error);
		if (error === "authorization_pending") return { status: "pending" };
		if (error === "slow_down") {
			entry.intervalSeconds = Math.min(entry.intervalSeconds + 5, 60);
			return { status: "slow_down" };
		}
		this.pending.delete(userKey);
		if (error === "access_denied") return { status: "denied" };
		return { status: "expired" };
	}

	async refresh(refreshToken: string): Promise<DeviceTokens> {
		const response = await this.fetchImpl(TOKEN_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				refresh_token: refreshToken,
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
				grant_type: "refresh_token",
			}),
		});
		const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
		if (!response.ok || typeof body.access_token !== "string") {
			throw new Error(stringValue(body.error) ?? "refresh rejected");
		}
		return parseTokens(body, refreshToken);
	}

	async revoke(token: string): Promise<void> {
		await this.fetchImpl(REVOKE_URL, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ token }).toString(),
		});
	}

	cancel(userKey: string): void {
		this.pending.delete(userKey);
	}

	private active(userKey: string): PendingDevice | null {
		const entry = this.pending.get(userKey);
		if (!entry) return null;
		if (this.now() >= entry.expiresAt) {
			this.pending.delete(userKey);
			return null;
		}
		return entry;
	}

	private pruneExpired(): void {
		const now = this.now();
		for (const [key, entry] of this.pending) {
			if (now >= entry.expiresAt) this.pending.delete(key);
		}
	}

	private describe(entry: PendingDevice): DeviceStart {
		return {
			userCode: entry.userCode,
			verificationUrl: entry.verificationUrl,
			expiresAt: entry.expiresAt,
			intervalSeconds: entry.intervalSeconds,
		};
	}
}

function parseTokens(body: Record<string, unknown>, fallbackRefresh: string | null): DeviceTokens {
	const refresh = stringValue(body.refresh_token) ?? fallbackRefresh;
	return {
		accessToken: String(body.access_token),
		refreshToken: refresh && refresh.length > 0 ? refresh : null,
		expiresIn: numberValue(body.expires_in, 3600),
		scope: stringValue(body.scope) ?? "",
	};
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
