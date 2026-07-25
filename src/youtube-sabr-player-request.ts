export function buildYoutubeSabrPlaybackContext(
	signatureTimestamp: number | undefined,
	reloadPlaybackParamsToken?: string,
) {
	const playbackContext: {
		adPlaybackContext: { pyv: boolean };
		contentPlaybackContext: {
			vis: number;
			splay: boolean;
			lactMilliseconds: string;
			signatureTimestamp: number | undefined;
		};
		reloadPlaybackContext?: {
			reloadPlaybackParams: { token: string };
		};
	} = {
		adPlaybackContext: { pyv: true },
		contentPlaybackContext: {
			vis: 0,
			splay: false,
			lactMilliseconds: "-1",
			signatureTimestamp,
		},
	};
	if (reloadPlaybackParamsToken) {
		playbackContext.reloadPlaybackContext = {
			reloadPlaybackParams: { token: reloadPlaybackParamsToken },
		};
	}

	return playbackContext;
}

export function buildYoutubeSabrPlayerRequest(
	signatureTimestamp: number | undefined,
	playerPoToken: string,
	reloadPlaybackParamsToken?: string,
) {
	return {
		playbackContext: buildYoutubeSabrPlaybackContext(signatureTimestamp, reloadPlaybackParamsToken),
		serviceIntegrityDimensions: { poToken: playerPoToken },
		attestationRequest: { omitBotguardData: true },
		contentCheckOk: true,
		racyCheckOk: true,
	};
}
