import type { RemoteLoginPage } from "./remote-login-browser.ts";
import type { RemoteLoginInput } from "./remote-login-messages.ts";

export async function applyRemoteLoginInput(
	page: RemoteLoginPage["page"],
	message: RemoteLoginInput,
): Promise<"cancelled" | "applied"> {
	if (message.type === "cancel") return "cancelled";
	if (message.type === "resize") {
		await page.setViewportSize({ width: message.width, height: message.height });
		return "applied";
	}
	if (message.type === "wheel") {
		await page.mouse.wheel(message.deltaX, message.deltaY);
		return "applied";
	}
	if (message.type === "text") {
		await page.keyboard.insertText(message.value);
		return "applied";
	}
	if (message.type === "key") {
		if (message.event === "down") await page.keyboard.down(message.key);
		if (message.event === "up") await page.keyboard.up(message.key);
		return "applied";
	}
	await page.mouse.move(message.x, message.y);
	const button = message.button ? { button: message.button } : undefined;
	if (message.event === "down") await page.mouse.down(button);
	if (message.event === "up") await page.mouse.up(button);
	return "applied";
}
