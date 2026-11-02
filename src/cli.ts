#!/usr/bin/env node
/**
 * scenemodel CLI. One subcommand per MCP tool, plus `mcp`.
 *   scenemodel get-scene-info
 *   scenemodel get-object-info <object_name>
 *   scenemodel execute-blender-code <code...>
 *   scenemodel get-viewport-screenshot [--max-size n]
 *   scenemodel get-polyhaven-categories [asset_type]
 *   scenemodel search-polyhaven-assets [asset_type] [categories]
 *   scenemodel download-polyhaven-asset <asset_id> <asset_type> [--resolution r] [--format f]
 *   scenemodel generate-hunyuan3d-model [--text prompt] [--image url]
 *   scenemodel mcp
 * The Blender addon is reached at BLENDER_HOST:BLENDER_PORT
 * (defaults localhost:9876). Exit codes: 0 success, 1 error, 2 usage.
 */
import { SceneModel, VERSION } from "./blender.js";

function usage(): never {
  console.error(`Usage:
  scenemodel get-scene-info
  scenemodel get-object-info <object_name>
  scenemodel execute-blender-code <code...>
  scenemodel get-viewport-screenshot [--max-size n]
  scenemodel get-polyhaven-categories [asset_type]
  scenemodel search-polyhaven-assets [asset_type] [categories]
  scenemodel download-polyhaven-asset <asset_id> <asset_type> [--resolution r] [--format f]
  scenemodel generate-hunyuan3d-model [--text prompt] [--image url]
  scenemodel mcp
  scenemodel --version`);
  process.exit(2);
}
function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx < 0 || idx + 1 >= args.length ? undefined : args[idx + 1];
}
function positionals(args: string[], valueFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.includes(args[i])) i++;
    else if (!args[i].startsWith("--")) out.push(args[i]);
  }
  return out;
}
function print(value: unknown): void {
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") { console.log(VERSION); return; }
  if (cmd === "mcp") { await import("./mcp.js"); return; }
  if (!cmd) usage();
  const model = new SceneModel();
  try {
    switch (cmd) {
      case "get-scene-info":
        print(await model.getSceneInfo());
        break;
      case "get-object-info": {
        const [name] = rest; if (!name) usage();
        print(await model.getObjectInfo(name));
        break;
      }
      case "execute-blender-code": {
        const code = rest.join(" ");
        if (!code.trim()) usage();
        print(await model.executeBlenderCode(code));
        break;
      }
      case "get-viewport-screenshot": {
        const raw = flagValue(rest, "--max-size");
        const maxSize = raw !== undefined ? Number(raw) : undefined;
        print(await model.getViewportScreenshot(maxSize !== undefined && Number.isFinite(maxSize) ? maxSize : undefined));
        break;
      }
      case "get-polyhaven-categories": {
        const [assetType] = rest;
        print(await model.getPolyhavenCategories(assetType));
        break;
      }
      case "search-polyhaven-assets": {
        const [assetType, categories] = rest;
        print(await model.searchPolyhavenAssets(assetType, categories));
        break;
      }
      case "download-polyhaven-asset": {
        const [assetId, assetType] = positionals(rest, ["--resolution", "--format"]);
        if (!assetId || !assetType) usage();
        print(await model.downloadPolyhavenAsset(
          assetId,
          assetType,
          flagValue(rest, "--resolution"),
          flagValue(rest, "--format"),
        ));
        break;
      }
      case "generate-hunyuan3d-model": {
        const text = flagValue(rest, "--text") ?? positionals(rest, ["--image"]).join(" ") ?? undefined;
        print(await model.generateHunyuan3dModel(text || undefined, flagValue(rest, "--image")));
        break;
      }
      default:
        usage();
    }
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
void main();
