import { createCookieImportPage } from "./remote-login-browser.ts";
import type { RemoteLoginConfig } from "./remote-login-config.ts";
import { RemoteLoginPoToken } from "./remote-login-po-token.ts";
import { parseSessionCookies, toBrowserCookies } from "./session-binding-cookies.ts";

export type SessionBindingResult =
	| { ok: true; cookies: string; poToken: string; authUser: number }
	| { ok: false; reason: "invalid_cookies" | "po_token_timeout" | "browser_error" };

export async function importSessionBinding(
	config: RemoteLoginConfig,
	rawCookies: string,
): Promise<SessionBindingResult> {
	const cookies = parseSessionCookies(rawCookies);
	if (cookies.length === 0) return { ok: false, reason: "invalid_cookies" };
	const poToken = new RemoteLoginPoToken();
	try {
		const page = await createCookieImportPage(config, toBrowserCookies(cookies), (token) =>
			poToken.receive(token),
		);
		try {
			if (!(await page.hasLoginCookie())) return { ok: false, reason: "invalid_cookies" };
			const token = await poToken.wait(config.potTimeoutMs);
			if (!token) return { ok: false, reason: "po_token_timeout" };
			return {
				ok: true,
				cookies: await page.cookies(),
				poToken: token,
				authUser: await page.authUser(),
			};
		} finally {
			await page.close();
		}
	} catch {
		return { ok: false, reason: "browser_error" };
	}
}
