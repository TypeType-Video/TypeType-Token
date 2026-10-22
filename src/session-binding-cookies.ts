import type { Cookie } from "playwright";

const MAX_RAW_COOKIES_LENGTH = 32 * 1024;
const MAX_COOKIES = 120;
const DEFAULT_DOMAIN = "youtube.com";

export type SessionCookie = {
	name: string;
	value: string;
	domain: string;
	includeSubdomains: boolean;
	path: string;
	expires: number;
	secure: boolean;
	httpOnly: boolean;
};

export function parseSessionCookies(raw: string): SessionCookie[] {
	if (raw.length > MAX_RAW_COOKIES_LENGTH) return [];
	const parsed = raw.includes("\t") ? parseNetscape(raw) : parseHeader(raw);
	const unique = new Map<string, SessionCookie>();
	for (const cookie of parsed) {
		if (!cookie.name || !cookie.value || !isAllowedDomain(cookie.domain)) continue;
		unique.set([cookie.domain, cookie.includeSubdomains, cookie.path, cookie.name].join("|"), cookie);
	}
	return [...unique.values()].slice(0, MAX_COOKIES);
}

export function toBrowserCookies(cookies: SessionCookie[]): Cookie[] {
	return cookies.map((cookie) => {
		const shared = {
			name: cookie.name,
			value: cookie.value,
			path: cookie.path,
			expires: cookie.expires,
			secure: cookie.secure,
			httpOnly: cookie.httpOnly,
			sameSite: "None" as const,
		};
		return cookie.includeSubdomains
			? { ...shared, domain: `.${cookie.domain}` }
			: { ...shared, url: `https://${cookie.domain}${cookie.path}` };
	});
}

function parseHeader(raw: string): SessionCookie[] {
	return raw
		.trim()
		.replace(/^cookie:\s*/i, "")
		.split(";")
		.flatMap((part) => {
			const index = part.indexOf("=");
			return index > 0
				? [{
						name: part.slice(0, index).trim(),
						value: part.slice(index + 1).trim(),
						domain: DEFAULT_DOMAIN,
						includeSubdomains: true,
						path: "/",
						expires: -1,
						secure: true,
						httpOnly: true,
					}]
				: [];
		});
}

function parseNetscape(raw: string): SessionCookie[] {
	return raw.split("\n").flatMap((line) => {
		const httpOnly = line.startsWith("#HttpOnly_");
		if (!line.trim() || (line.startsWith("#") && !httpOnly)) return [];
		const fields = line.replace(/^#HttpOnly_/, "").split("\t");
		if (fields.length < 7) return [];
		const domain = normalizeDomain(fields[0]);
		const path = fields[2].trim();
		if (!domain || !path.startsWith("/")) return [];
		const expiresAt = Number(fields[4]);
		return [
			{
				name: fields[5].trim(),
				value: fields[6].trim(),
				domain,
				includeSubdomains: fields[1].trim().toUpperCase() === "TRUE",
				path,
				expires: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : -1,
				secure: fields[3].trim().toUpperCase() === "TRUE",
				httpOnly,
			},
		];
	});
}

function normalizeDomain(value: string): string | null {
	const domain = value.trim().replace(/^\./, "").toLowerCase();
	return isAllowedDomain(domain) ? domain : null;
}

function isAllowedDomain(domain: string): boolean {
	return ["youtube.com", "google.com"].some(
		(root) => domain === root || domain.endsWith(`.${root}`),
	);
}
