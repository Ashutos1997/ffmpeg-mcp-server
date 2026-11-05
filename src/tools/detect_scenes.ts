import fs from "node:fs/promises";
import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg, FfmpegProgress } from "../utils/exec.js";
import { probeMedia } from "./probe.js";

export const detectScenesSchema = z.object({
  inputPath: z.string().describe("Path to the source video file to analyze for scene transitions."),
  threshold: z
    .number()
    .min(0.05)
    .max(1.0)
    .optional()
    .default(0.3)
    .describe("Scene cut sensitivity threshold between 0.05 and 1.0. Lower values detect subtle transitions; higher values detect only dramatic scene cuts. Default: 0.3."),
  minDurationSeconds: z
    .number()
    .min(0.1)
    .max(60)
    .optional()
    .default(0.5)
    .describe("Minimum scene duration in seconds to filter out rapid flashes or micro-cuts. Default: 0.5."),
  outputPath: z
    .string()
    .optional()
    .describe("Optional destination path for a contact-sheet montage image (.png or .jpg) visualizing detected scenes."),
  includeBase64: z
    .boolean()
    .optional()
    .default(true)
    .describe("Return base64 contact sheet image data in response for vision models when outputPath is specified. Default: true."),
});

export type DetectScenesParams = z.infer<typeof detectScenesSchema>;

export interface SceneSegment {
  sceneIndex: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
}

export async function detectScenes(
  params: DetectScenesParams,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
) {
  const {
    inputPath,
    threshold = 0.3,
    minDurationSeconds = 0.5,
    outputPath,
    includeBase64 = true,
  } = params;

  const input = await ensureFileExists(inputPath);
  const probe = await probeMedia(input, { signal: options?.signal });
  const totalDuration = Math.max(0.1, probe.format.durationSeconds);

  // Run scene change detection using select filter with showinfo output
  const detectArgs: string[] = [
    "-i", input,
    "-vf", `select='gt(scene\\,${threshold})',showinfo`,
    "-f", "null",
    "-",
  ];

  const res = await runFfmpeg(detectArgs, {
    signal: options?.signal,
    onProgress: options?.onProgress,
    expectedDurationSeconds: totalDuration,
  });

  // Extract cut timestamps from showinfo log lines
  const rawCuts: number[] = [];
  const lines = res.stderr.split(/\r?\n/);
  for (const line of lines) {
    if (line.includes("pts_time:")) {
      const match = line.match(/pts_time:([0-9.]+)/);
      if (match && match[1]) {
        const time = parseFloat(match[1]);
        if (!isNaN(time) && time > 0 && time < totalDuration) {
          rawCuts.push(Number(time.toFixed(3)));
        }
      }
    }
  }

  // Deduplicate and filter out cuts too close to each other
  const validCuts: number[] = [];
  let lastCut = 0;
  for (const cut of rawCuts) {
    if (cut - lastCut >= minDurationSeconds) {
      validCuts.push(cut);
      lastCut = cut;
    }
  }

  // Build structured scene segments
  const scenes: SceneSegment[] = [];
  let currentStart = 0;

  for (let i = 0; i < validCuts.length; i++) {
    const cutTime = validCuts[i];
    const duration = Number((cutTime - currentStart).toFixed(3));
    scenes.push({
      sceneIndex: i + 1,
      startTimeSeconds: currentStart,
      endTimeSeconds: cutTime,
      durationSeconds: duration,
    });
    currentStart = cutTime;
  }

  // Final scene segment to end of video
  const lastDuration = Number((totalDuration - currentStart).toFixed(3));
  scenes.push({
    sceneIndex: scenes.length + 1,
    startTimeSeconds: currentStart,
    endTimeSeconds: Number(totalDuration.toFixed(3)),
    durationSeconds: lastDuration,
  });

  // Optional Contact Sheet generation
  let contactSheetPath: string | undefined;
  let base64: string | undefined;
  let mimeType: string | undefined;

  if (outputPath) {
    contactSheetPath = await ensureOutputDir(outputPath);
    const count = scenes.length;
    const cols = count <= 3 ? count : Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    const sheetArgs: string[] = [
      "-i", input,
      "-vf", `select='eq(n\\,0)+gt(scene\\,${threshold})',scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,tile=${cols}x${rows}`,
      "-frames:v", "1",
      "-y", contactSheetPath,
    ];

    await runFfmpeg(sheetArgs, { signal: options?.signal });

    if (includeBase64) {
      try {
        const buffer = await fs.readFile(contactSheetPath);
        if (buffer.length < 8 * 1024 * 1024) {
          base64 = buffer.toString("base64");
          mimeType = contactSheetPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
        }
      } catch {}
    }
  }

  return {
    success: true,
    totalScenes: scenes.length,
    totalCuts: validCuts.length,
    cutTimestamps: validCuts,
    scenes,
    contactSheetPath,
    base64,
    mimeType,
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
  };
}

