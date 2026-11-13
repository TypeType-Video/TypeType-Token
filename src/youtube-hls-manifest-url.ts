type Decipher = (url: string) => Promise<string> | string;

const THROTTLING_SEGMENT = /\/n\/([^/]+)(?=\/|$)/;

export async function decipherHlsManifestUrl(
	manifestUrl: string | null | undefined,
	decipher: Decipher | undefined,
): Promise<string | null> {
	if (!manifestUrl) return null;
	const raw = THROTTLING_SEGMENT.exec(manifestUrl)?.[1];
	if (!raw || !decipher) return manifestUrl;
	const probe = `https://example.com/videoplayback?n=${encodeURIComponent(decodeURIComponent(raw))}`;
	const decoded = new URL(await decipher(probe)).searchParams.get("n");
	if (!decoded) return manifestUrl;
	return manifestUrl.replace(THROTTLING_SEGMENT, `/n/${encodeURIComponent(decoded)}`);
}
