import type { Cookie } from "playwright";

const MAX_RAW_COOKIES_LENGTH = 32 * 1024;
const MAX_COOKIES = 120;
const COOKIE_DOMAINS = [".youtube.com", ".google.com"];

export type SessionCookie = { name: string; value: string };

export function parseSessionCookies(raw: string): SessionCookie[] {
	if (raw.length > MAX_RAW_COOKIES_LENGTH) return [];
	const parsed = raw.includes("\t") ? parseNetscape(raw) : parseHeader(raw);
	const unique = new Map<string, string>();
	for (const cookie of parsed) {
		if (cookie.name && cookie.value) unique.set(cookie.name, cookie.value);
	}
	return [...unique].slice(0, MAX_COOKIES).map(([name, value]) => ({ name, value }));
}

export function toBrowserCookies(cookies: SessionCookie[]): Cookie[] {
	return cookies.flatMap((cookie) =>
		COOKIE_DOMAINS.map((domain) => ({
			name: cookie.name,
			value: cookie.value,
			domain,
			path: "/",
			expires: -1,
			secure: true,
			httpOnly: true,
			sameSite: "None",
		})),
	);
}

function parseHeader(raw: string): SessionCookie[] {
	return raw
		.trim()
		.replace(/^cookie:\s*/i, "")
		.split(";")
		.flatMap((part) => {
			const index = part.indexOf("=");
			return index > 0
				? [{ name: part.slice(0, index).trim(), value: part.slice(index + 1).trim() }]
				: [];
		});
}

function parseNetscape(raw: string): SessionCookie[] {
	return raw.split("\n").flatMap((line) => {
		const httpOnly = line.startsWith("#HttpOnly_");
		if (!line.trim() || (line.startsWith("#") && !httpOnly)) return [];
		const fields = line.replace(/^#HttpOnly_/, "").split("\t");
		return fields.length >= 7 ? [{ name: fields[5].trim(), value: fields[6].trim() }] : [];
	});
}
