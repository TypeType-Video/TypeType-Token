import { expect, test } from "bun:test";
import { decipherHlsManifestUrl } from "../src/youtube-hls-manifest-url.ts";

const MANIFEST =
	"https://manifest.googlevideo.com/api/manifest/hls_variant/expire/1/n/rawValue/itag/0/file/index.m3u8";

test("replaces the throttling value of a live manifest with the decoded one", async () => {
	const asked: string[] = [];
	const decoded = await decipherHlsManifestUrl(MANIFEST, (url) => {
		asked.push(url);
		return "https://example.com/videoplayback?n=decoded";
	});

	expect(asked).toEqual(["https://example.com/videoplayback?n=rawValue"]);
	expect(decoded).toBe(MANIFEST.replace("/n/rawValue/", "/n/decoded/"));
});

test("leaves a manifest alone when nothing can be decoded", async () => {
	const withoutValue =
		"https://manifest.googlevideo.com/api/manifest/hls_variant/expire/1/file/index.m3u8";

	expect(await decipherHlsManifestUrl(withoutValue, () => "https://example.com/?n=x")).toBe(
		withoutValue,
	);
	expect(await decipherHlsManifestUrl(MANIFEST, undefined)).toBe(MANIFEST);
	expect(await decipherHlsManifestUrl(MANIFEST, () => "https://example.com/videoplayback")).toBe(
		MANIFEST,
	);
	expect(await decipherHlsManifestUrl(null, undefined)).toBeNull();
});
