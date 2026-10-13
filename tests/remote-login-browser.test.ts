import { describe, expect, it } from "bun:test";
import type { Cookie } from "playwright";
import {
	installWebAuthnBypassOverrides,
	isGoogleLoginCookie,
	isYoutubeLoginCookie,
	isYoutubeUrl,
} from "../src/remote-login-browser.ts";

function cookie(domain: string, name: string, value = "v"): Cookie {
	return {
		domain,
		name,
		value,
		path: "/",
		expires: -1,
		httpOnly: true,
		secure: true,
		sameSite: "None",
	};
}

describe("remote login browser login detection", () => {
	it("only treats youtube.com session cookies on youtube pages as a login", () => {
		expect(isYoutubeLoginCookie(cookie(".youtube.com", "SAPISID"))).toBe(true);
		expect(isYoutubeLoginCookie(cookie(".google.com", "SID"))).toBe(false);
		expect(isYoutubeLoginCookie(cookie(".youtube.com", "SID", ""))).toBe(false);
		expect(isYoutubeLoginCookie(cookie(".youtube.com", "VISITOR_INFO1_LIVE"))).toBe(false);
		expect(isYoutubeUrl("https://www.youtube.com/")).toBe(true);
		expect(isYoutubeUrl("https://accounts.google.com/v3/signin/challenge/totp")).toBe(false);
		expect(isYoutubeUrl("nope")).toBe(false);
	});

	it("detects google login cookies correctly", () => {
		expect(isGoogleLoginCookie(cookie(".google.com", "SID"))).toBe(true);
		expect(isGoogleLoginCookie(cookie("google.com", "SSID"))).toBe(true);
		expect(isGoogleLoginCookie(cookie(".youtube.com", "SID"))).toBe(false);
		expect(isGoogleLoginCookie(cookie(".google.com", "SID", ""))).toBe(false);
	});
});

describe("remote login browser webauthn bypass", () => {
	it("stubs platform authenticator and conditional mediation availability to false", async () => {
		const targetWindow = {
			PublicKeyCredential: {
				isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true),
				isConditionalMediationAvailable: () => Promise.resolve(true),
			},
		};
		installWebAuthnBypassOverrides(targetWindow);
		expect(
			await targetWindow.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(),
		).toBe(false);
		expect(await targetWindow.PublicKeyCredential.isConditionalMediationAvailable()).toBe(false);
	});

	it("rejects publicKey credentials with NotSupportedError while preserving non-WebAuthn requests", async () => {
		let originalGetCalled = false;
		let originalCreateCalled = false;
		const targetWindow = {
			navigator: {
				credentials: {
					get: async (_options?: CredentialRequestOptions) => {
						originalGetCalled = true;
						return null;
					},
					create: async (_options?: CredentialCreationOptions) => {
						originalCreateCalled = true;
						return null;
					},
				},
			},
		};
		installWebAuthnBypassOverrides(targetWindow);

		const dummyKeyRequest: CredentialRequestOptions = {
			publicKey: { challenge: new Uint8Array([1, 2, 3]) },
		};
		const dummyKeyCreation: CredentialCreationOptions = {
			publicKey: {
				challenge: new Uint8Array([1, 2, 3]),
				rp: { name: "Google" },
				user: { id: new Uint8Array([1]), name: "user", displayName: "User" },
				pubKeyCredParams: [],
			},
		};

		// publicKey requests (WebAuthn / Passkeys) must reject immediately
		await expect(targetWindow.navigator.credentials.get(dummyKeyRequest)).rejects.toThrow(
			"The operation is not supported.",
		);
		expect(originalGetCalled).toBe(false);

		await expect(targetWindow.navigator.credentials.create(dummyKeyCreation)).rejects.toThrow(
			"The operation is not supported.",
		);
		expect(originalCreateCalled).toBe(false);

		// Non-publicKey requests (e.g. password, federated) must pass through to original
		const nonKeyRequest: CredentialRequestOptions = { mediation: "optional" };
		const nonKeyCreation: CredentialCreationOptions = {};

		await targetWindow.navigator.credentials.get(nonKeyRequest);
		expect(originalGetCalled).toBe(true);

		await targetWindow.navigator.credentials.create(nonKeyCreation);
		expect(originalCreateCalled).toBe(true);
	});
});
