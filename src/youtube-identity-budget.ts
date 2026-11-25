// YouTube stops playing anything to one visitor identity after roughly 900 player requests in an hour: it answers
// UNPLAYABLE "Video unavailable" until its window resets, while a fresh identity on the same address plays at once
// (measured on 2026-11-25). The budget renews the identity in the background well before that point, and right away
// when several different videos are refused in a row with no success between them.
export const ROTATE_AFTER_PLAYER_CALLS = 500;
export const REFUSALS_BEFORE_ROTATION = 3;
export const REFUSAL_WINDOW_MS = 60_000;
const KEPT_IDENTITIES = 8;

export function isIdentityRefusal(status?: string, reason?: string): boolean {
	return status === "UNPLAYABLE" && (reason?.toLowerCase().includes("unavailable") ?? false);
}

export class YoutubeIdentityBudget {
	private readonly calls = new Map<string, number>();
	private readonly refusals = new Map<string, Map<string, number>>();

	constructor(private readonly now: () => number = Date.now) {}

	/** Counts one player request; true from the limit on, until a new identity is in use. */
	notePlayerCall(visitorData: string): boolean {
		const calls = (this.calls.get(visitorData) ?? 0) + 1;
		this.calls.set(visitorData, calls);
		trim(this.calls);
		return calls >= ROTATE_AFTER_PLAYER_CALLS;
	}

	noteSuccess(visitorData: string): void {
		this.refusals.delete(visitorData);
	}

	/** Records a refused video; true when the identity looks used up and must be renewed before retrying. */
	noteRefusal(visitorData: string, videoId: string): boolean {
		const now = this.now();
		const recent = this.refusals.get(visitorData) ?? new Map<string, number>();
		for (const [id, at] of recent) {
			if (now - at > REFUSAL_WINDOW_MS) recent.delete(id);
		}
		recent.set(videoId, now);
		this.refusals.set(visitorData, recent);
		trim(this.refusals);
		return recent.size >= REFUSALS_BEFORE_ROTATION;
	}

	forget(visitorData: string): void {
		this.calls.delete(visitorData);
		this.refusals.delete(visitorData);
	}
}

function trim<V>(byIdentity: Map<string, V>): void {
	for (const identity of byIdentity.keys()) {
		if (byIdentity.size <= KEPT_IDENTITIES) return;
		byIdentity.delete(identity);
	}
}

export const youtubeIdentityBudget = new YoutubeIdentityBudget();
