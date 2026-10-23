import fs from "node:fs/promises";
import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg } from "../utils/exec.js";
import { probeMedia } from "./probe.js";

export const extractKeyframesSchema = z.object({
  inputPath: z.string().describe("Path to the source video file."),
  outputPath: z.string().describe("Destination image path (e.g. './keyframes_grid.png' or './frames/frame_%02d.jpg')."),
  count: z
    .number()
    .int()
    .min(2)
    .max(24)
    .optional()
    .default(6)
    .describe("Number of representative frames to extract across the video timeline. Default: 6."),
  layout: z
    .enum(["montage", "individual"])
    .optional()
    .default("montage")
    .describe("Output format: 'montage' combines all frames into a single contact-sheet grid image for vision models; 'individual' exports separate frame images. Default: 'montage'."),
  includeBase64: z
    .boolean()
    .optional()
    .default(true)
    .describe("Inline base64 image data in response for vision models. Default: true."),
});

export type ExtractKeyframesParams = z.infer<typeof extractKeyframesSchema>;

export async function extractKeyframes(
  params: ExtractKeyframesParams,
  options?: { signal?: AbortSignal }
) {
  const { inputPath, outputPath, count = 6, layout = "montage", includeBase64 = true } = params;

  const input = await ensureFileExists(inputPath);
  const output = await ensureOutputDir(outputPath);

  const probe = await probeMedia(input, { signal: options?.signal });
  const duration = Math.max(1, probe.format.durationSeconds);

  // Compute montage dimensions (e.g. 6 -> 3x2, 4 -> 2x2, 9 -> 3x3)
  const cols = count <= 3 ? count : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const args: string[] = ["-i", input];

  if (layout === "montage") {
    // Extract evenly spaced frames and tile them into a contact sheet
    const filter = `fps=${count}/${duration},scale=480:-1,tile=${cols}x${rows}`;
    args.push("-vf", filter, "-vframes", "1", "-y", output);
  } else {
    // Export individual frames
    const filter = `fps=${count}/${duration},scale=640:-1`;
    args.push("-vf", filter, "-vframes", String(count), "-y", output);
  }

  const res = await runFfmpeg(args, { signal: options?.signal });

  let base64: string | undefined;
  let mimeType: string | undefined;

  if (includeBase64 && layout === "montage") {
    try {
      const buffer = await fs.readFile(output);
      if (buffer.length < 5 * 1024 * 1024) {
        base64 = buffer.toString("base64");
        mimeType = output.toLowerCase().endsWith(".jpg") || output.toLowerCase().endsWith(".jpeg")
          ? "image/jpeg"
          : "image/png";
      }
    } catch {
      // Optional
    }
  }

  return {
    success: true,
    outputPath: output,
    frameCount: count,
    layout,
    gridDimensions: layout === "montage" ? `${cols}x${rows}` : undefined,
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
    base64,
    mimeType,
  };
}
