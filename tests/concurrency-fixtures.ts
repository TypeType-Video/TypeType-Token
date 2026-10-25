export async function maxConcurrency(
	count: number,
	start: (task: () => Promise<void>) => Promise<unknown>,
): Promise<number> {
	let active = 0;
	let peak = 0;
	const releases: Array<() => void> = [];
	const tasks = Array.from({ length: count }, () =>
		start(async () => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise<void>((resolve) => releases.push(resolve));
			active -= 1;
		}),
	);
	for (let settled = 0; settled < count; settled += 1) {
		while (releases.length === 0) await Bun.sleep(1);
		releases.shift()?.();
		await Bun.sleep(1);
	}
	await Promise.allSettled(tasks);
	return peak;
}
