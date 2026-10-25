import type { SabrFormat } from "googlevideo/shared-types";

export type YoutubeSabrClient = "WEB" | "MWEB";

export type YoutubeSabrSession = {
	videoId: string;
	client: YoutubeSabrClient;
	visitorData: string;
	poToken: string;
	streamingPot: string;
	tokenGeneration: string;
	serverAbrStreamingUrl: string;
	rawServerAbrStreamingUrl: string;
	hlsManifestUrl: string | null;
	videoPlaybackUstreamerConfig: string;
	durationMs: number | null;
	title: string | null;
	metadata: YoutubeSabrMetadata;
	formats: SabrFormat[];
	adaptiveFormats: YoutubeSabrAdaptiveFormat[];
};

export type YoutubeSabrMetadata = {
	title: string;
	author: string;
	channelId: string;
	channelAvatarUrl: string;
	description: string;
	durationMs: number;
	viewCount: number;
	thumbnailUrl: string;
	tags: string[];
	isLive: boolean;
	isLiveContent: boolean;
};

export type YoutubeSabrAdaptiveFormat = {
	itag: number;
	lastModified: string;
	xtags?: string;
	mimeType: string;
	audioTrack?: {
		id: string;
		displayName: string;
		audioIsDefault: boolean;
	};
	qualityLabel?: string;
	audioQuality?: string;
	isDrc: boolean;
	width?: number;
	height?: number;
	bitrate: number;
	contentLength?: number;
	approxDurationMs: number;
	url?: string;
	signatureCipher?: string;
	initRange?: YoutubeSabrByteRange;
	indexRange?: YoutubeSabrByteRange;
};

export type YoutubeSabrByteRange = {
	start: number;
	end: number;
};

export type YoutubeAudioTrack = {
	id: string;
};

export type YoutubeAdaptiveFormat = {
	itag: number;
	last_modified_ms?: string;
	lastModified?: string;
	xtags?: string;
	width?: number;
	height?: number;
	mime_type?: string;
	mimeType?: string;
	audio_quality?: string;
	audioQuality?: string;
	bitrate: number;
	average_bitrate?: number;
	averageBitrate?: number;
	quality?: string;
	quality_label?: string;
	qualityLabel?: string;
	audio_track?: YoutubeAudioTrack;
	audioTrackId?: string;
	approx_duration_ms?: number;
	approxDurationMs?: string;
	content_length?: number;
	contentLength?: string;
	is_drc?: boolean;
	is_auto_dubbed?: boolean;
	is_descriptive?: boolean;
	is_dubbed?: boolean;
	language?: string | null;
	is_original?: boolean;
	is_secondary?: boolean;
};

export type YoutubePlayerResponse = {
	playabilityStatus?: {
		status?: string;
		reason?: string;
	};
	streamingData?: {
		adaptiveFormats?: YoutubeAdaptiveFormat[];
		serverAbrStreamingUrl?: string;
	};
	playerConfig?: {
		mediaCommonConfig?: {
			mediaUstreamerRequestConfig?: {
				videoPlaybackUstreamerConfig?: string;
			};
		};
	};
	videoDetails?: {
		lengthSeconds?: string;
		title?: string;
	};
};

export type YoutubeClientContext = {
	hl: string;
	gl: string;
	clientName: YoutubeSabrClient;
	clientVersion: string;
	visitorData: string;
	userAgent: string;
	clientFormFactor?: string;
	platform?: string;
};
