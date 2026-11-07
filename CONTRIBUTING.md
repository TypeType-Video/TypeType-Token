# Contributing to TypeType Token

Thank you for helping improve TypeType's YouTube token and decoder service.

## Scope

This repository owns BotGuard challenges, PO-token generation, player decoding, YouTube SABR session metadata, subtitle metadata, and disposable remote-login browser sessions.

Open bug reports and feature requests in the [central TypeType issue tracker](https://github.com/TypeType-Video/TypeType/issues). Mention that the problem affects `TypeType-Token` and link the issue from your pull request.

HTTP extraction and user data belong in [TypeType-Server](https://github.com/TypeType-Video/TypeType-Server). Browser playback belongs in [TypeType-Player](https://github.com/TypeType-Video/TypeType-Player). The frontend must never call TypeType-Token directly.

## Set up the project

Use Bun 1.4.4. Live BotGuard and remote-login flows also require a Playwright-compatible Chromium installation.

```sh
git switch dev
bun install --frozen-lockfile
bun run start
```

The service starts at `http://localhost:8081`.

## Source ownership

| Area | Files |
| --- | --- |
| HTTP entry point | `src/index.ts` |
| BotGuard and PO tokens | `src/botguard-*.ts`, `src/token-service.ts` |
| Player decoding | `src/youtube-player-decoder.ts` |
| SABR session metadata | `src/youtube-sabr-*.ts` |
| Remote login | `src/remote-login-*.ts` |
| Subtitles and channel metadata | `src/subtitles.ts`, `src/youtube-channel-*.ts` |
| Tests | `tests/` |

Keep HTTP routing, BotGuard execution, token caching, decoding, and remote-login behavior in separate modules.

## YouTube and SABR changes

Check the current PipePipe Client and PipePipeExtractor sources before changing YouTube client selection, PO-token binding, player requests, SABR formats, playback cookies, or session metadata. WEB and MWEB are the supported SABR clients for this service.

Changes to an internal response must remain compatible with TypeType-Server. Coordinate the server contract in the same issue when both repositories need updates.

## Programming preferences

- Use Bun exclusively. Do not use npm, yarn, or pnpm.
- Do not use `any`.
- Narrow `unknown` values before use.
- Add explicit return types to exported functions.
- Do not use wildcard imports.
- Prefer clear names and structure over explanatory comments, but comments are welcome whenever a contributor finds them useful.
- Name types and interfaces in PascalCase, files in kebab-case, functions in camelCase, constants in SCREAMING_SNAKE_CASE, and directories in lowercase.
- Do not prefix interfaces with `I` or suffix implementations with `Impl`.
- Keep strict TypeScript and Biome checks clean.
- Keep source files under 170 lines and split by responsibility.
- Keep one responsibility per file and do not mix HTTP routing, token orchestration, and BotGuard execution.
- Preserve bounded caches, serialized refreshes, and per-video request isolation.
- Add regression tests for refresh, concurrency, token binding, decoder, and session changes.
- Do not add an HTTP framework or a second package manager.
- Prefer Bun-native APIs before adding libraries, and do not add an external Redis client.
- New dependencies must use MIT, ISC, or Apache-2.0 and preserve all required notices.
- Do not place cookies, private keys, shared internal tokens, or captured account data in tests, issues, or pull requests.

## Required checks

```sh
bun audit --audit-level=high
bun run lint
bun test --coverage --coverage-reporter=lcov
bun run build
```

## Commits and pull requests

Create your branch from `dev` and open the pull request against `dev`.

Use commit messages in this form:

```text
type: short description
```

Common types are `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, and `style`. Use the imperative mood and keep the first line under 72 characters.

Describe the affected token or decoder flow, compatibility impact, tests, and any required Server update in the pull request.

Contributions to this repository are distributed under the [MIT License](LICENSE).
