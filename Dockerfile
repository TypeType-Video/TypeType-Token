FROM --platform=$BUILDPLATFORM oven/bun:1.3.14-slim AS builder
WORKDIR /app
COPY package.json bun.lock ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN bun install --frozen-lockfile
COPY src/ ./src/
RUN bun build src/index.ts --outfile dist/index.js --target bun --external playwright

FROM oven/bun:1.3.14-slim AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN bun install --frozen-lockfile --production

FROM mcr.microsoft.com/playwright:v1.62.1-noble AS runner
ARG BUILD_VERSION=1.6.0-dev
ARG BUILD_REVISION=development
ARG BUILD_TIME=unknown
RUN apt-get update \
	&& DEBIAN_FRONTEND=noninteractive apt-get upgrade -y \
	&& apt-get purge -y gstreamer1.0-plugins-bad libgstreamer-plugins-bad1.0-0 \
	&& apt-get autoremove -y \
	&& rm -rf /var/lib/apt/lists/* /usr/lib/node_modules
WORKDIR /app
COPY --from=oven/bun:1.3.14-slim /usr/local/bin/bun /usr/local/bin/bun
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh
EXPOSE 8081
ENV NODE_ENV=production
ENV TYPE_TYPE_BUILD_VERSION=$BUILD_VERSION
ENV TYPE_TYPE_BUILD_REVISION=$BUILD_REVISION
ENV TYPE_TYPE_BUILD_TIME=$BUILD_TIME
ENV YOUTUBE_REMOTE_LOGIN_HEADLESS=false
ENV YOUTUBE_REMOTE_LOGIN_DISABLE_AUTOMATION_CONTROLLED=true
CMD ["./docker-entrypoint.sh"]
