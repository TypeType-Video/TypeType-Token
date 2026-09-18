U want to know the current position of TypeType about AI ? Go check [this](https://github.com/TypeType-Video/TypeType/blob/dev/AI_TRANSPARENCY.md).

<div align="center">
  <img src="https://raw.githubusercontent.com/TypeType-Video/TypeType/main/assets/banner.svg" alt="TypeType" width="100%">
  <h1>TypeType Token</h1>
  <p>YouTube token, decoder, and session service for TypeType-Server.</p>
</div>

TypeType-Token is an internal Bun service used exclusively by [TypeType-Server](https://github.com/TypeType-Video/TypeType-Server). It handles YouTube Proof-of-Origin tokens, player decoding, SABR session metadata, subtitles, and disposable remote-login browser sessions.

The frontend never calls this service directly. If you want to run TypeType, use the [central stack](https://github.com/TypeType-Video/TypeType) instead of exposing this service as a public API.

## Responsibilities

- Fetch YouTube visitor data and BotGuard challenges
- Generate visitor-bound and video-bound PO tokens
- Decode YouTube player signatures and throttling parameters locally
- Return WEB and MWEB SABR session metadata to TypeType-Server
- Resolve subtitle tracks with the required token data
- Manage authenticated, disposable YouTube remote-login sessions

TypeType does not rely on third-party decoder endpoints. Player decoding stays on the TypeType-owned service path.

## Stack

| Role | Technology |
| --- | --- |
| Runtime and package manager | Bun 1.3.14 |
| HTTP server | `Bun.serve()` |
| Browser runtime | Playwright Chromium |
| Cache | In-memory BotGuard and token state |
| Tests | `bun:test` |
| Lint and format | Biome |

## Internal API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service health |
| `GET` | `/version` | Build information |
| `GET` | `/potoken?videoId=<id>` | PO token data for a YouTube video |
| `GET` | `/subtitles?videoId=<id>` | Subtitle track metadata |
| `GET` | `/youtube/sabr/session?videoId=<id>&client=MWEB` | WEB or MWEB SABR session metadata |
| `POST` | `/youtube/player/decoder` | Batch player URL decoding |

Remote-login routes are disabled unless configured by the TypeType stack. They require a shared internal token and are intended only for the Server-to-Token connection.

## Development

Requirements:

- Bun 1.3.14
- A Playwright-compatible Chromium installation for live token and login flows

```sh
bun install --frozen-lockfile
bun run start
```

The service listens on `http://localhost:8081`.

## Checks

```sh
bun run lint
bun test
bun run build
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Bug reports and feature requests belong in the [central issue tracker](https://github.com/TypeType-Video/TypeType/issues).

## Related projects

- [TypeType-Server](https://github.com/TypeType-Video/TypeType-Server) consumes the internal service API.
- [PipePipe](https://github.com/InfinityLoop1308/PipePipe) and [PipePipeExtractor](https://github.com/InfinityLoop1308/PipePipeExtractor) are the external behavioral references for YouTube extraction and SABR behavior.
- [BgUtils](https://github.com/LuanRT/BgUtils) provides compatibility types used by the BotGuard integration.

## License

TypeType-Token is licensed under the [MIT License](LICENSE). Dependency notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
