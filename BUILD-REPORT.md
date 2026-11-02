# BUILD-REPORT — scenemodel (original: blender)

Built 2026-10-26 for the MCP Rebuild 100 program (Tier C, core
subset). Local only; nothing pushed or published.

## Identity

- npm: `@reneturcios/scenemodel`, bin `scenemodel`, version 0.1.0
- Registry name: `io.github.CloudCorpRecords/scenemodel`
  (matches package.json `mcpName`, server.json `name`, and the
  Dockerfile `io.modelcontextprotocol.server.name` label)
- server.json description: 86 chars (≤100, counted)
- server.json OCI package entry: no `version` field (version only in
  the tagged identifier `ghcr.io/cloudcorprecords/scenemodel:0.1.0`)

## Subset scope

Core subset of 8 tools from the documented ahujasid/blender-mcp
surface:

| Tool | Addon command (`{type, params}`) |
| --- | --- |
| `get_scene_info` {} | `get_scene_info` |
| `get_object_info` {object_name} | `get_object_info` (param `name`) |
| `execute_blender_code` {code} | `execute_code` |
| `get_viewport_screenshot` {max_size?} | `get_viewport_screenshot` |
| `get_polyhaven_categories` {asset_type?} | `get_polyhaven_categories` |
| `search_polyhaven_assets` {asset_type?, categories?} | `search_polyhaven_assets` |
| `download_polyhaven_asset` {asset_id, asset_type, resolution?, file_format?} | `download_polyhaven_asset` |
| `generate_hunyuan3d_model` {text_prompt?, input_image_url?} | `generate_hunyuan3d_model` |

Omitted: hyper3d (Rodin) generation tools/status, Hunyuan status/job
polling beyond generate, the dedicated set_texture tool (texture
setting remains reachable via download/execute in the original),
telemetry/user_id tools, and viewport scene manipulation beyond
execute_blender_code.

## Implementation

- Transport is the original's: a TCP socket to the Blender addon
  exchanging JSON commands `{type, params}` for `{status, result}`
  responses, implemented behind an injectable `SocketFn`. The
  default implementation uses `node:net` — one connection, one JSON
  request, one JSON response per command — with host/port from
  `BLENDER_HOST` / `BLENDER_PORT` (defaults localhost / 9876).
  Addon `{status:"error"}` envelopes surface with the addon message.
- Registered via the low-level MCP `Server` API with explicit
  inputSchema literals; zod validates call arguments.
- The runtime container image bundles no Blender binary (noted in
  the Dockerfile): the addon lives in the user's own Blender install.

## Verification (all foreground, verified from disk/output)

- tsc: `npm run build` exit 0; `node dist/cli.js --version` → `0.1.0`;
  unknown command prints Usage and exits 2
- Tests: 11/11 pass (`npm test`, fake SocketFn only — exact command
  shaping for every tool, `{status, result}` unwrapping, addon error
  envelopes, env config defaults/overrides, screenshot summary
  behaviour including a no-image-payload assertion, AggregateError
  unwrapping, ECONNREFUSED propagation)
- Parity: fixture `harness/fixtures/blender-tools-original.json`
  (`_source`: docs-derived from ahujasid/blender-mcp public docs,
  core subset of 8) vs live stdio rebuild via `harness/parity.py` →
  `parity_pct == 100.0`, identical 8/8, output in
  `parity-out/parity.json` (verdict PASS)
- Live failure-path stdio check: no Blender addon is listening in
  this VM. Piping initialize + `tools/call get_scene_info {}` into
  `node dist/cli.js mcp` returned `isError: true` with text
  `connect ECONNREFUSED ::1:9876; connect ECONNREFUSED 127.0.0.1:9876`.
  The first live run exposed a real bug — Node's happy-eyeballs
  connect wraps the refusal in an AggregateError with an empty
  message, so the isError text was empty — fixed by unwrapping the
  aggregate's causes in `describeSocketError`, covered by a test,
  and re-verified live with the text above.

## Honest gaps

- Screenshot gap (by design, recorded): upstream,
  `get_viewport_screenshot` returns image content. This build
  returns an artifact summary only — format plus byte/base64
  lengths — never the image content block.
- No Blender instance exists in this VM, so no successful live addon
  exchange was run or claimed; wire behaviour against a real addon
  (response framing nuances, large payloads) is proven only through
  the fake-socket tests.
- Lockfile flag: `package-lock.json` is a copy of the libdocs-remote
  lockfile with identity fields edited (name, bin). **Clean lockfile
  regeneration (no node_modules present) is required before
  publish** — fleet lesson 2026-10-25.
- mcpaudit / mcpvet / shipcheck pre-publish gate not run (belongs to
  the publish wave, per SCOREBOARD).
