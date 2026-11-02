/**
 * scenemodel core: a core subset of 8 tools from the documented
 * ahujasid/blender-mcp surface.
 *
 * Covered: get_scene_info, get_object_info, execute_blender_code,
 * get_viewport_screenshot, get_polyhaven_categories,
 * search_polyhaven_assets, download_polyhaven_asset,
 * generate_hunyuan3d_model.
 *
 * Omitted: hyper3d (Rodin) generation tools and status,
 * Hunyuan job status/polling beyond generate, the dedicated
 * set_texture tool (texture setting stays reachable through
 * download_polyhaven_asset / execute_blender_code, as in the
 * original), telemetry/user_id tools, and viewport scene
 * manipulation beyond execute_blender_code.
 *
 * Transport is exactly the original's: the Blender addon listens on
 * a TCP socket (default localhost:9876) and exchanges JSON commands
 * {type, params} for JSON responses {status, result|message}. That
 * exchange sits behind an injectable SocketFn; the default
 * implementation opens one node:net socket per command, sends one
 * JSON request and parses one JSON response. Host/port come from
 * BLENDER_HOST / BLENDER_PORT (defaults localhost / 9876). A refused
 * connection rejects with the underlying error (ECONNREFUSED) and
 * the MCP layer surfaces it honestly — never fake scene data.
 *
 * Known gap: upstream, get_viewport_screenshot returns image
 * content. This build returns an artifact summary instead (format
 * plus byte/base64 lengths), never the image content block.
 */
import { createConnection } from "node:net";
import type { BlenderCommand, SocketConfig, SocketFn } from "./types.js";

export const VERSION = "0.1.0";

export function socketConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): SocketConfig {
  const host = typeof env.BLENDER_HOST === "string" && env.BLENDER_HOST.trim()
    ? env.BLENDER_HOST.trim()
    : "localhost";
  const portRaw = Number(env.BLENDER_PORT);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 9876;
  return { host, port };
}

/**
 * Default SocketFn: one TCP connection per command. Sends the JSON
 * command, accumulates bytes until a complete JSON document parses
 * (the addon's response), then resolves with it. Connection errors
 * reject with the underlying error untouched.
 */
export function createSocketFn(config: SocketConfig = socketConfigFromEnv()): SocketFn {
  return (command: BlenderCommand) =>
    new Promise((resolve, reject) => {
      const socket = createConnection({ host: config.host, port: config.port });
      let buffer = "";
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        fn();
      };
      socket.setTimeout(30000, () => {
        finish(() => reject(new Error(`Blender addon socket timed out (${config.host}:${config.port})`)));
      });
      socket.on("connect", () => {
        socket.write(JSON.stringify(command));
      });
      socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        try {
          const parsed = JSON.parse(buffer) as unknown;
          finish(() => resolve(parsed));
        } catch {
          // Incomplete JSON so far; keep accumulating.
        }
      });
      socket.on("error", (err) => {
        finish(() => reject(new Error(describeSocketError(err))));
      });
      socket.on("end", () => {
        try {
          const parsed = JSON.parse(buffer) as unknown;
          finish(() => resolve(parsed));
        } catch {
          finish(() => reject(new Error("Blender addon closed the connection without a JSON response")));
        }
      });
    });
}

/**
 * Render a socket error with its underlying message. Node's
 * happy-eyeballs connect can surface an AggregateError whose own
 * message is empty while its `errors` carry the real causes (e.g.
 * "connect ECONNREFUSED 127.0.0.1:9876"); unwrap those so failures
 * stay honest and readable.
 */
export function describeSocketError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message) return err.message;
    const inner = (err as Error & { errors?: unknown[] }).errors;
    if (Array.isArray(inner) && inner.length > 0) {
      return inner.map((e) => describeSocketError(e)).join("; ");
    }
    const code = (err as Error & { code?: string }).code;
    return code ? `socket error ${code}` : String(err);
  }
  return String(err);
}

function requireValue(value: string | undefined, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} is required`);
  return v;
}

export interface ScreenshotSummary {
  format: string;
  byte_length: number;
  base64_length: number;
  summary: string;
}

/** Summarise an upstream screenshot payload without returning image content. */
export function summariseScreenshot(result: unknown): ScreenshotSummary {
  let format = "png";
  let b64 = "";
  if (typeof result === "string") {
    b64 = result;
  } else if (result !== null && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.format === "string" && r.format) format = r.format;
    for (const key of ["image_data", "data", "image", "base64", "screenshot"]) {
      if (typeof r[key] === "string") {
        b64 = r[key] as string;
        break;
      }
    }
  }
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const byteLength = b64 ? Math.max(0, Math.floor((b64.length * 3) / 4) - padding) : 0;
  return {
    format,
    byte_length: byteLength,
    base64_length: b64.length,
    summary: b64
      ? `Viewport screenshot captured as ${format} image data (${b64.length} base64 chars, ~${byteLength} bytes); scenemodel returns this summary, not the image content.`
      : "Viewport screenshot response carried no image data.",
  };
}

export class SceneModel {
  private readonly socketFn: SocketFn;
  constructor(socketFn: SocketFn = createSocketFn()) {
    this.socketFn = socketFn;
  }

  /** Send one command and unwrap the addon's {status, result|message} envelope. */
  private async call(type: string, params: Record<string, unknown>): Promise<unknown> {
    const raw = await this.socketFn({ type, params });
    if (raw !== null && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (obj.status === "error") {
        throw new Error(typeof obj.message === "string" ? obj.message : "Blender addon returned an error");
      }
      if (obj.status === "success") return obj.result ?? null;
    }
    return raw;
  }

  async getSceneInfo(): Promise<unknown> {
    return this.call("get_scene_info", {});
  }

  async getObjectInfo(objectName: string): Promise<unknown> {
    const name = requireValue(objectName, "object_name");
    return this.call("get_object_info", { name });
  }

  async executeBlenderCode(code: string): Promise<unknown> {
    const c = requireValue(code, "code");
    return this.call("execute_code", { code: c });
  }

  async getViewportScreenshot(maxSize?: number): Promise<ScreenshotSummary> {
    const result = await this.call("get_viewport_screenshot", { max_size: maxSize ?? 800 });
    return summariseScreenshot(result);
  }

  async getPolyhavenCategories(assetType?: string): Promise<unknown> {
    return this.call("get_polyhaven_categories", { asset_type: assetType ?? "all" });
  }

  async searchPolyhavenAssets(assetType?: string, categories?: string): Promise<unknown> {
    return this.call("search_polyhaven_assets", {
      asset_type: assetType ?? "all",
      categories: categories ?? "",
    });
  }

  async downloadPolyhavenAsset(
    assetId: string,
    assetType: string,
    resolution?: string,
    fileFormat?: string,
  ): Promise<unknown> {
    const id = requireValue(assetId, "asset_id");
    const type = requireValue(assetType, "asset_type");
    return this.call("download_polyhaven_asset", {
      asset_id: id,
      asset_type: type,
      resolution: resolution ?? "1k",
      file_format: fileFormat ?? "blend",
    });
  }

  async generateHunyuan3dModel(textPrompt?: string, inputImageUrl?: string): Promise<unknown> {
    const prompt = typeof textPrompt === "string" ? textPrompt : "";
    const image = typeof inputImageUrl === "string" ? inputImageUrl : "";
    if (!prompt.trim() && !image.trim()) {
      throw new Error("text_prompt or input_image_url is required");
    }
    return this.call("generate_hunyuan3d_model", {
      text_prompt: prompt,
      input_image_url: image,
    });
  }
}
