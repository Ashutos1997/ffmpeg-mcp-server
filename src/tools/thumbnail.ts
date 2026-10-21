import fs from "node:fs/promises";
import { ensureFileExists, ensureOutputDir, runCommand } from "../utils/exec.js";
import { probeMedia } from "./probe.js";

export interface ThumbnailOptions {
  inputPath: string;
  outputPath: string;
  timestamp?: string; // e.g. "00:00:05", "10", or "midpoint" (default: "00:00:01")
  resolution?: string; // e.g. "1280x720", "640x360"
  includeBase64?: boolean; // If true, returns base64 image data for vision models
}

export async function extractThumbnail(options: ThumbnailOptions): Promise<{
  outputPath: string;
  timestampUsed: string;
  commandExecuted: string;
  base64?: string;
  mimeType?: string;
}> {
  const input = await ensureFileExists(options.inputPath);
  const output = await ensureOutputDir(options.outputPath);

  let timestamp = options.timestamp || "00:00:01";

  if (timestamp === "midpoint") {
    try {
      const info = await probeMedia(input);
      const midpointSeconds = Math.max(0, Math.floor(info.format.durationSeconds / 2));
      timestamp = String(midpointSeconds);
    } catch {
      timestamp = "00:00:01";
    }
  }

  const args: string[] = [
    "-y",
    "-ss", timestamp,
    "-i", input,
    "-vframes", "1",
  ];

  if (options.resolution) {
    args.push("-vf", `scale=${options.resolution.replace("x", ":")}`);
  }

  args.push(output);

  await runCommand("ffmpeg", args);

  let base64: string | undefined;
  let mimeType: string | undefined;

  const shouldInclude = options.includeBase64 ?? true;
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
    commandExecuted: `ffmpeg ${args.join(" ")}`,
    base64,
    mimeType,
  };
}
