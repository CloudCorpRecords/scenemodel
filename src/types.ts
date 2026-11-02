/**
 * scenemodel types.
 *
 * The original blender-mcp talks to a Blender addon over a TCP
 * socket (default localhost:9876) using JSON commands of the shape
 * {type, params} and JSON responses. That transport is described
 * here by an injectable SocketFn: send one command object, resolve
 * with the parsed response object. The default implementation uses
 * node:net (see blender.ts); tests inject a fake that records the
 * commands and returns canned responses. The addon host/port come
 * from BLENDER_HOST / BLENDER_PORT, defaulting to localhost:9876.
 */

export interface BlenderCommand {
  type: string;
  params: Record<string, unknown>;
}

/** Sends one command to the Blender addon and resolves with its parsed JSON response. */
export type SocketFn = (command: BlenderCommand) => Promise<unknown>;

export interface SocketConfig {
  host: string;
  port: number;
}
