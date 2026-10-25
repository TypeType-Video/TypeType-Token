import type { TvPoTokenMinter } from "./tv-po-token.ts";

export function createTvPoTokenRoutes(
	minter: TvPoTokenMinter,
): (req: Request, url: URL) => Promise<Response | null> {
	return async (req, url) => {
		if (url.pathname !== "/tv-token") return null;
		if (req.method !== "GET" && req.method !== "POST") return null;
		try {
			return Response.json(await minter.get(url.searchParams.get("refresh") === "true"));
		} catch (error) {
			const message = error instanceof Error ? error.message : "tv_token_unavailable";
			return Response.json({ error: message }, { status: 502 });
		}
	};
}
