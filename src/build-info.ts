const revision = process.env.TYPE_TYPE_BUILD_REVISION ?? "development";

export const buildInfo = {
	service: "token",
	version: process.env.TYPE_TYPE_BUILD_VERSION ?? "1.2.4-dev",
	revision,
	shortRevision: revision.slice(0, 12),
	buildTime: process.env.TYPE_TYPE_BUILD_TIME ?? "unknown",
};
