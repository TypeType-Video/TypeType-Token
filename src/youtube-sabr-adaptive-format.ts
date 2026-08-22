import type { YoutubeSabrAdaptiveFormat, YoutubeSabrByteRange } from "./youtube-sabr-types.ts";

type SourceAudioTrack = {
	id: string;
	display_name: string;
	audio_is_default: boolean;
};

type SourceFormat = {
	itag: number;
	last_modified_ms: string;
	xtags?: string;
	mime_type: string;
	audio_track?: SourceAudioTrack;
	quality_label?: string;
	audio_quality?: string;
	is_drc?: boolean;
	width?: number;
	height?: number;
	bitrate: number;
	content_length?: number;
	approx_duration_ms: number;
	url?: string;
	signature_cipher?: string;
	init_range?: YoutubeSabrByteRange;
	index_range?: YoutubeSabrByteRange;
};

export function toYoutubeSabrAdaptiveFormat(format: SourceFormat): YoutubeSabrAdaptiveFormat {
	const audioTrack = format.audio_track
		? {
				id: format.audio_track.id,
				displayName: format.audio_track.display_name,
				audioIsDefault: format.audio_track.audio_is_default,
			}
		: undefined;
	return {
		itag: format.itag,
		lastModified: format.last_modified_ms,
		mimeType: format.mime_type,
		isDrc: format.is_drc ?? false,
		bitrate: format.bitrate,
		approxDurationMs: format.approx_duration_ms,
		...(format.xtags ? { xtags: format.xtags } : {}),
		...(audioTrack ? { audioTrack } : {}),
		...(format.quality_label ? { qualityLabel: format.quality_label } : {}),
		...(format.audio_quality ? { audioQuality: format.audio_quality } : {}),
		...(format.width !== undefined ? { width: format.width } : {}),
		...(format.height !== undefined ? { height: format.height } : {}),
		...(format.content_length !== undefined ? { contentLength: format.content_length } : {}),
		...(format.url ? { url: format.url } : {}),
		...(format.signature_cipher ? { signatureCipher: format.signature_cipher } : {}),
		...(format.init_range ? { initRange: format.init_range } : {}),
		...(format.index_range ? { indexRange: format.index_range } : {}),
	};
}
