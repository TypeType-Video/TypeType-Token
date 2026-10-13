export function isYoutubeOopsUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase();
		return (
			parsed.protocol === "https:" &&
			(host === "youtube.com" || host.endsWith(".youtube.com")) &&
			parsed.pathname === "/oops"
		);
	} catch {
		return false;
	}
}
