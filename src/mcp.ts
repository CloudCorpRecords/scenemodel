/**
 * scenemodel MCP server. Tools: get_scene_info, get_object_info,
 * execute_blender_code, get_viewport_screenshot,
 * get_polyhaven_categories, search_polyhaven_assets,
 * download_polyhaven_asset, generate_hunyuan3d_model.
 *
 * Low-level Server API with explicit inputSchema literals identical
 * to the fixture (the McpServer+zod path injects $schema /
 * additionalProperties and breaks parity). Zod validates call args.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SceneModel, VERSION } from "./blender.js";

const str = { type: "string" as const };
const TOOLS = [
  {
    name: "get_scene_info",
    description: "Get information about the current Blender scene.",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_object_info",
    description: "Get information about one object in the Blender scene.",
    inputSchema: {
      type: "object" as const,
      properties: { object_name: { type: "string", description: "The name of the object in the Blender scene to get information about." } },
      required: ["object_name"],
    },
  },
  {
    name: "execute_blender_code",
    description: "Execute Python code inside Blender.",
    inputSchema: {
      type: "object" as const,
      properties: { code: { type: "string", description: "The Python code to execute inside Blender." } },
      required: ["code"],
    },
  },
  {
    name: "get_viewport_screenshot",
    description: "Capture the Blender viewport; returns an artifact summary, not image content.",
    inputSchema: {
      type: "object" as const,
      properties: { max_size: { type: "number", description: "Optional maximum size of the viewport screenshot (default 800)." } },
      required: [],
    },
  },
  {
    name: "get_polyhaven_categories",
    description: "List PolyHaven asset categories, optionally for one asset type.",
    inputSchema: {
      type: "object" as const,
      properties: { asset_type: { type: "string", description: "Optional PolyHaven asset type to list categories for (default 'all')." } },
      required: [],
    },
  },
  {
    name: "search_polyhaven_assets",
    description: "Search PolyHaven assets by type and categories.",
    inputSchema: {
      type: "object" as const,
      properties: { asset_type: { type: "string", description: "Optional PolyHaven asset type to search (default 'all')." }, categories: { type: "string", description: "Optional comma-separated PolyHaven categories to filter the search by." } },
      required: [],
    },
  },
  {
    name: "download_polyhaven_asset",
    description: "Download a PolyHaven asset into the Blender scene.",
    inputSchema: {
      type: "object" as const,
      properties: {
        asset_id: { type: "string", description: "The unique identifier of the PolyHaven asset to download." },
        asset_type: { type: "string", description: "The type of the PolyHaven asset to download." },
        resolution: { type: "string", description: "Optional download resolution for the asset (default '1k')." },
        file_format: { type: "string", description: "Optional file format for the downloaded asset (default 'blend')." },
      },
      required: ["asset_id", "asset_type"],
    },
  },
  {
    name: "generate_hunyuan3d_model",
    description: "Generate a 3D model with Hunyuan3D from a text prompt or an image URL.",
    inputSchema: {
      type: "object" as const,
      properties: { text_prompt: { type: "string", description: "Optional text prompt describing the 3D model to generate; either this or input_image_url is required." }, input_image_url: { type: "string", description: "Optional URL of an input image to generate the 3D model from; either this or text_prompt is required." } },
      required: [],
    },
  },
];

const NoArgs = z.object({});
const ObjectArgs = z.object({ object_name: z.string() });
const CodeArgs = z.object({ code: z.string() });
const ScreenshotArgs = z.object({ max_size: z.number().optional() });
const CategoriesArgs = z.object({ asset_type: z.string().optional() });
const SearchArgs = z.object({
  asset_type: z.string().optional(),
  categories: z.string().optional(),
});
const DownloadArgs = z.object({
  asset_id: z.string(),
  asset_type: z.string(),
  resolution: z.string().optional(),
  file_format: z.string().optional(),
});
const HunyuanArgs = z.object({
  text_prompt: z.string().optional(),
  input_image_url: z.string().optional(),
});

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}
function errorResult(err: unknown) {
  return {
    content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
    isError: true,
  };
}

const model = new SceneModel();
const server = new Server({ name: "scenemodel", version: VERSION }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "get_scene_info":
        NoArgs.parse(args ?? {});
        return textResult(await model.getSceneInfo());
      case "get_object_info":
        return textResult(await model.getObjectInfo(ObjectArgs.parse(args ?? {}).object_name));
      case "execute_blender_code":
        return textResult(await model.executeBlenderCode(CodeArgs.parse(args ?? {}).code));
      case "get_viewport_screenshot":
        return textResult(await model.getViewportScreenshot(ScreenshotArgs.parse(args ?? {}).max_size));
      case "get_polyhaven_categories":
        return textResult(await model.getPolyhavenCategories(CategoriesArgs.parse(args ?? {}).asset_type));
      case "search_polyhaven_assets": {
        const p = SearchArgs.parse(args ?? {});
        return textResult(await model.searchPolyhavenAssets(p.asset_type, p.categories));
      }
      case "download_polyhaven_asset": {
        const p = DownloadArgs.parse(args ?? {});
        return textResult(await model.downloadPolyhavenAsset(p.asset_id, p.asset_type, p.resolution, p.file_format));
      }
      case "generate_hunyuan3d_model": {
        const p = HunyuanArgs.parse(args ?? {});
        return textResult(await model.generateHunyuan3dModel(p.text_prompt, p.input_image_url));
      }
    }
  } catch (err) {
    return errorResult(err);
  }
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
void main();
