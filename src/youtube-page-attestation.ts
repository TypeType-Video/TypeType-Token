type PageAttestation = {
	eventId: string;
	rawChallenge: string;
};

const EVENT_ID_PATTERN = /"EVENT_ID"\s*:\s*"([A-Za-z0-9_-]+)"/;
const ATTESTATION_CALL_PATTERN = /window\.ytAtN\s*\(/;
const RESPONSE_PROPERTY_PATTERN = /['"]R['"]\s*:\s*(['"])/;

export function parseYoutubePageAttestation(pageHtml: string): PageAttestation {
	const eventId = EVENT_ID_PATTERN.exec(pageHtml)?.[1];
	if (!eventId) throw new Error("YouTube page has no EVENT_ID");

	const call = ATTESTATION_CALL_PATTERN.exec(pageHtml);
	if (!call) throw new Error("YouTube page has no initial attestation call");

	const responseOffset = call.index + call[0].length;
	const response = RESPONSE_PROPERTY_PATTERN.exec(pageHtml.slice(responseOffset));
	if (!response) throw new Error("YouTube page attestation has no response payload");

	const quote = response[1];
	const rawChallenge = decodeJavascriptString(
		pageHtml,
		responseOffset + response.index + response[0].length,
		quote,
	);
	JSON.parse(rawChallenge);
	return { eventId, rawChallenge };
}

function decodeJavascriptString(source: string, start: number, quote: string): string {
	let result = "";
	let index = start;
	while (index < source.length) {
		const character = source[index++];
		if (character === quote) return result;
		if (character !== "\\") {
			result += character;
			continue;
		}
		if (index >= source.length) throw new Error("Incomplete JavaScript string escape");
		const escaped = source[index++];
		switch (escaped) {
			case "b":
				result += "\b";
				break;
			case "f":
				result += "\f";
				break;
			case "n":
				result += "\n";
				break;
			case "r":
				result += "\r";
				break;
			case "t":
				result += "\t";
				break;
			case "v":
				result += "\v";
				break;
			case "x":
				result += readHexEscape(source, index, 2);
				index += 2;
				break;
			case "u":
				result += readHexEscape(source, index, 4);
				index += 4;
				break;
			case "\n":
				break;
			case "\r":
				if (source[index] === "\n") index += 1;
				break;
			default:
				result += escaped;
		}
	}
	throw new Error("Unterminated JavaScript string");
}

function readHexEscape(source: string, start: number, length: number): string {
	const value = source.slice(start, start + length);
	if (value.length !== length || !/^[0-9a-f]+$/i.test(value)) {
		throw new Error("Invalid hexadecimal escape");
	}
	return String.fromCharCode(Number.parseInt(value, 16));
}
