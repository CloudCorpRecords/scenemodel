# scenemodel

scenemodel is a small MCP server and CLI for driving a Blender
scene from an agent. It is a clean-room rebuild of a core subset —
eight tools — from the documented surface of ahujasid/blender-mcp:
scene and object info, arbitrary Blender Python execution,
viewport screenshots, PolyHaven category browsing, search and
download, and Hunyuan3D model generation.

The transport is the original's, unchanged: Blender runs an addon
that listens on a TCP socket (default `localhost:9876`) and
exchanges JSON commands of the shape `{type, params}` for JSON
responses. scenemodel implements exactly that protocol behind an
injectable socket function — one connection, one JSON request, one
JSON response per call — with the host and port taken from
`BLENDER_HOST` / `BLENDER_PORT`. When nothing is listening, calls
fail honestly with the underlying connection error (ECONNREFUSED);
scenemodel never invents scene data.

One documented gap: upstream, the screenshot tool returns image
content. scenemodel returns an artifact summary instead — the image
format plus its byte and base64 lengths — and never the image
content block itself.

Deliberately omitted: the Hyper3D (Rodin) generation tools and
their status checks, Hunyuan job status/polling beyond the generate
call, the dedicated set_texture tool (texture setting stays
reachable through asset download and code execution, as in the
original), telemetry/user-id tools, and viewport scene manipulation
beyond `execute_blender_code`.

The published container image bundles no Blender binary: the addon
runs inside the user's own Blender install, so the image expects to
reach a host Blender socket and says so in its Dockerfile.

## Install

```bash
npx @reneturcios/scenemodel get-scene-info
docker run -i ghcr.io/cloudcorprecords/scenemodel
```

Start Blender with the blender-mcp addon enabled first; it listens
on `localhost:9876` by default.

## CLI

```bash
scenemodel get-scene-info
scenemodel get-object-info <object_name>
scenemodel execute-blender-code "import bpy; print(bpy.context.scene.name)"
scenemodel get-viewport-screenshot [--max-size 1024]
scenemodel get-polyhaven-categories [asset_type]
scenemodel search-polyhaven-assets [asset_type] [categories]
scenemodel download-polyhaven-asset <asset_id> <asset_type> [--resolution 2k] [--format gltf]
scenemodel generate-hunyuan3d-model --text "a wooden chair"
scenemodel --version
```

Exit codes: `0` success, `1` addon/socket error, `2` usage error.

## MCP server

```bash
npx -y @reneturcios/scenemodel mcp
```

```json
{
  "mcpServers": {
    "scenemodel": {
      "command": "npx",
      "args": ["-y", "@reneturcios/scenemodel", "mcp"],
      "env": { "BLENDER_HOST": "localhost", "BLENDER_PORT": "9876" }
    }
  }
}
```

The `env` block is optional; the defaults are shown.

### Tools

| Tool | Input | Addon command |
| --- | --- | --- |
| `get_scene_info` | — | `get_scene_info` |
| `get_object_info` | `object_name` (required) | `get_object_info` |
| `execute_blender_code` | `code` (required) | `execute_code` |
| `get_viewport_screenshot` | `max_size` (optional) | `get_viewport_screenshot` — returns a format/length summary, not image content |
| `get_polyhaven_categories` | `asset_type` (optional) | `get_polyhaven_categories` |
| `search_polyhaven_assets` | `asset_type`, `categories` (optional) | `search_polyhaven_assets` |
| `download_polyhaven_asset` | `asset_id`, `asset_type` (required), `resolution`, `file_format` | `download_polyhaven_asset` |
| `generate_hunyuan3d_model` | `text_prompt`, `input_image_url` (one required) | `generate_hunyuan3d_model` |

Addon error envelopes and socket failures — a refused connection,
a timeout, a malformed response — are reported as tool errors
carrying the underlying message.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

Tests run entirely on a fake socket function: command shaping,
response unwrapping, screenshot summarisation, and error
propagation. No live Blender instance is touched.

## License

MIT — see `LICENSE`.
