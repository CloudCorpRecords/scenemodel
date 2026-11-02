import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SceneModel, describeSocketError, socketConfigFromEnv, summariseScreenshot } from "../src/blender.js";
import type { BlenderCommand, SocketFn } from "../src/types.js";

function fake(responses: Record<string, unknown> = {}): { fn: SocketFn; calls: BlenderCommand[] } {
  const calls: BlenderCommand[] = [];
  const fn: SocketFn = async (command) => {
    calls.push(command);
    if (command.type in responses) {
      const r = responses[command.type];
      return { status: "success", result: r };
    }
    return { status: "success", result: {} };
  };
  return { fn, calls };
}
function failing(message: string): SocketFn {
  return async () => { throw new Error(message); };
}

describe("scenemodel core", () => {
  it("socketConfigFromEnv defaults to localhost:9876 and honours overrides", () => {
    assert.deepEqual(socketConfigFromEnv({}), { host: "localhost", port: 9876 });
    assert.deepEqual(socketConfigFromEnv({ BLENDER_HOST: "192.168.1.5", BLENDER_PORT: "9999" }), {
      host: "192.168.1.5",
      port: 9999,
    });
    assert.deepEqual(socketConfigFromEnv({ BLENDER_PORT: "bogus" }), { host: "localhost", port: 9876 });
  });
  it("getSceneInfo sends {type: get_scene_info, params: {}} and unwraps the result", async () => {
    const scene = { name: "Scene", object_count: 2, objects: [{ name: "Cube", type: "MESH" }] };
    const { fn, calls } = fake({ get_scene_info: scene });
    const model = new SceneModel(fn);
    assert.deepEqual(await model.getSceneInfo(), scene);
    assert.deepEqual(calls[0], { type: "get_scene_info", params: {} });
  });
  it("getObjectInfo maps object_name to the addon name param", async () => {
    const { fn, calls } = fake({ get_object_info: { name: "Cube", type: "MESH" } });
    const model = new SceneModel(fn);
    await model.getObjectInfo("Cube");
    assert.deepEqual(calls[0], { type: "get_object_info", params: { name: "Cube" } });
    await assert.rejects(() => model.getObjectInfo(" "), /object_name is required/);
  });
  it("executeBlenderCode sends execute_code with the code verbatim", async () => {
    const code = "import bpy\nbpy.ops.mesh.primitive_cube_add()";
    const { fn, calls } = fake({ execute_code: { executed: true } });
    const model = new SceneModel(fn);
    await model.executeBlenderCode(code);
    assert.deepEqual(calls[0], { type: "execute_code", params: { code } });
  });
  it("getViewportScreenshot returns a summary, never the image content", async () => {
    const b64 = Buffer.from("fake-png-bytes").toString("base64");
    const { fn, calls } = fake({ get_viewport_screenshot: { format: "png", image_data: b64 } });
    const model = new SceneModel(fn);
    const r = await model.getViewportScreenshot();
    assert.deepEqual(calls[0], { type: "get_viewport_screenshot", params: { max_size: 800 } });
    assert.equal(r.format, "png");
    assert.equal(r.base64_length, b64.length);
    assert.equal(r.byte_length, Buffer.from("fake-png-bytes").length);
    assert.ok(!JSON.stringify(r).includes(b64), "summary must not embed the image payload");
    await model.getViewportScreenshot(1024);
    assert.deepEqual(calls[1].params, { max_size: 1024 });
  });
  it("summariseScreenshot handles string payloads and empty results", () => {
    const s = summariseScreenshot("aGVsbG8="); // "hello", 5 bytes
    assert.equal(s.byte_length, 5);
    assert.equal(s.base64_length, 8);
    const empty = summariseScreenshot({});
    assert.equal(empty.byte_length, 0);
    assert.equal(empty.base64_length, 0);
  });
  it("polyhaven tools shape their params with documented defaults", async () => {
    const { fn, calls } = fake({
      get_polyhaven_categories: { hdris: ["sunset"] },
      search_polyhaven_assets: { "wood-table": { name: "Wood Table" } },
      download_polyhaven_asset: { success: true },
    });
    const model = new SceneModel(fn);
    await model.getPolyhavenCategories();
    assert.deepEqual(calls[0], { type: "get_polyhaven_categories", params: { asset_type: "all" } });
    await model.searchPolyhavenAssets("textures", "wood");
    assert.deepEqual(calls[1], {
      type: "search_polyhaven_assets",
      params: { asset_type: "textures", categories: "wood" },
    });
    await model.downloadPolyhavenAsset("wood_table", "textures");
    assert.deepEqual(calls[2], {
      type: "download_polyhaven_asset",
      params: { asset_id: "wood_table", asset_type: "textures", resolution: "1k", file_format: "blend" },
    });
    await model.downloadPolyhavenAsset("wood_table", "textures", "4k", "gltf");
    assert.deepEqual(calls[3].params, {
      asset_id: "wood_table", asset_type: "textures", resolution: "4k", file_format: "gltf",
    });
  });
  it("generateHunyuan3dModel requires a prompt or an image and shapes params", async () => {
    const { fn, calls } = fake({ generate_hunyuan3d_model: { success: true } });
    const model = new SceneModel(fn);
    await model.generateHunyuan3dModel("a wooden chair");
    assert.deepEqual(calls[0], {
      type: "generate_hunyuan3d_model",
      params: { text_prompt: "a wooden chair", input_image_url: "" },
    });
    await assert.rejects(() => model.generateHunyuan3dModel(), /text_prompt or input_image_url is required/);
    assert.equal(calls.length, 1);
  });
  it("addon error envelopes surface as errors with the addon message", async () => {
    const model = new SceneModel(async () => ({ status: "error", message: "Object not found: Nope" }));
    await assert.rejects(() => model.getObjectInfo("Nope"), /Object not found: Nope/);
  });
  it("describeSocketError unwraps AggregateError causes with empty messages", () => {
    const inner = new Error("connect ECONNREFUSED 127.0.0.1:9876");
    const agg = new AggregateError([inner], "");
    assert.equal(describeSocketError(agg), "connect ECONNREFUSED 127.0.0.1:9876");
    assert.equal(describeSocketError(inner), "connect ECONNREFUSED 127.0.0.1:9876");
  });
  it("connection failures propagate honestly, including ECONNREFUSED text", async () => {
    const model = new SceneModel(failing("connect ECONNREFUSED 127.0.0.1:9876"));
    await assert.rejects(() => model.getSceneInfo(), /ECONNREFUSED/);
  });
});
