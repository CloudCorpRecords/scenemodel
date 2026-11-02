# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- MCP server (`scenemodel mcp`, stdio) and CLI with eight tools from
  the documented ahujasid/blender-mcp surface: `get_scene_info`,
  `get_object_info`, `execute_blender_code`,
  `get_viewport_screenshot`, `get_polyhaven_categories`,
  `search_polyhaven_assets`, `download_polyhaven_asset`,
  `generate_hunyuan3d_model`.
- Transport matches the original: JSON commands `{type, params}`
  over a TCP socket to the Blender addon (BLENDER_HOST /
  BLENDER_PORT, defaults localhost:9876), behind an injectable
  socket function. A refused connection surfaces as an honest
  ECONNREFUSED tool error.
- Gap by design: `get_viewport_screenshot` returns an artifact
  summary (format, byte/base64 lengths), not the image content
  block the upstream tool returns.
- Omitted: Hyper3D (Rodin) tools/status, Hunyuan status polling,
  dedicated set_texture tool, telemetry/user_id tools.
- Tests run on a fake socket function only — no live Blender.
