import fs from "node:fs/promises";
import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg } from "../utils/exec.js";
import { probeMedia } from "./probe.js";

export const extractThumbnailSchema = z.object({
  inputPath: z.string().describe("Path to the source video file."),
  outputPath: z.string().describe("Destination image path ending in .png or .jpg (e.g. './thumb.png')."),
  timestamp: z
    .string()
    .optional()
    .describe("Timestamp to capture, such as '00:00:05', '10', or 'midpoint' for the middle frame. Default: '00:00:01'."),
  resolution: z.string().optional().describe("Optional scaled size formatted as 'WIDTHxHEIGHT', such as '1280x720'. Defaults to source resolution."),
  includeBase64: z.boolean().optional().describe("Return base64 image data in response for vision models. Default: true."),
});

export type ExtractThumbnailParams = z.infer<typeof extractThumbnailSchema>;

export async function extractThumbnail(
  params: ExtractThumbnailParams,
  options?: { signal?: AbortSignal }
): Promise<{
  outputPath: string;
  timestampUsed: string;
  commandExecuted: string;
  durationSeconds: number;
  base64?: string;
  mimeType?: string;
}> {
  const input = await ensureFileExists(params.inputPath);
  const output = await ensureOutputDir(params.outputPath);

  let timestamp = params.timestamp || "00:00:01";

  if (timestamp === "midpoint") {
    try {
      const info = await probeMedia(input, { signal: options?.signal });
      const midpointSeconds = Math.max(0, Math.floor(info.format.durationSeconds / 2));
      timestamp = String(midpointSeconds);
    } catch {
      timestamp = "00:00:01";
    }
  }

  const args: string[] = [
    "-ss", timestamp,
    "-i", input,
    "-vframes", "1",
  ];

  if (params.resolution) {
    args.push("-vf", `scale=${params.resolution.replace("x", ":")}`);
  }

  args.push("-y", output);

  const res = await runFfmpeg(args, { signal: options?.signal });

  let base64: string | undefined;
  let mimeType: string | undefined;

  const shouldInclude = params.includeBase64 ?? true;
  if (shouldInclude) {
    try {
      const buffer = await fs.readFile(output);
      if (buffer.length < 4 * 1024 * 1024) {
        base64 = buffer.toString("base64");
        mimeType = output.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      }
    } catch {
      // Optional
    }
  }

  return {
    outputPath: output,
    timestampUsed: timestamp,
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
    base64,
    mimeType,
  };
}
