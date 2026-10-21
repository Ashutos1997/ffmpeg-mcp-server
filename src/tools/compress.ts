import fs from "node:fs";
import { z } from "zod";
import { runFfmpeg, ensureFileExists, ensureOutputDir } from "../utils/exec.js";
import { probeMedia } from "./probe.js";

export const compressMediaSchema = z.object({
  inputPath: z.string().describe("Path to the source video file"),
  outputPath: z.string().describe("Target path for compressed output file"),
  targetSizeMB: z.number().positive().optional().describe("Optional target file size in Megabytes (e.g., 10 for GitHub PRs, 25 for Discord)"),
  preset: z.enum(["github_pr", "discord", "email", "balanced", "high_quality"]).optional().default("balanced").describe("Compression preset if targetSizeMB is not specified"),
  crf: z.number().int().min(18).max(45).optional().describe("Custom Constant Rate Factor (18=near lossless, 23=default, 28=small, 35=very small)"),
  maxWidth: z.number().int().positive().optional().describe("Optional maximum width to downscale (e.g. 1280 for 720p)"),
});

export type CompressMediaParams = z.infer<typeof compressMediaSchema>;

export async function compressMedia(params: CompressMediaParams) {
  const { inputPath, outputPath, targetSizeMB, preset = "balanced", crf, maxWidth } = params;
  const input = await ensureFileExists(inputPath);
  const output = await ensureOutputDir(outputPath);

  const statsBefore = fs.statSync(input);
  const probe = await probeMedia(input);
  const duration = probe.format.durationSeconds || 10;

  const args: string[] = ["-i", input];

  let scaleFilter = "";
  if (maxWidth) {
    scaleFilter = `scale='min(${maxWidth},iw)':-2`;
  } else if (preset === "github_pr") {
    scaleFilter = "scale='min(1280,iw)':-2";
  } else if (preset === "email") {
    scaleFilter = "scale='min(854,iw)':-2";
  }

  if (scaleFilter) {
    args.push("-vf", scaleFilter);
  }

  if (targetSizeMB) {
    const totalBits = targetSizeMB * 8 * 1024 * 1024;
    const audioBitrateK = 96;
    const totalBitrateK = Math.floor(totalBits / duration / 1000);
    const videoBitrateK = Math.max(100, totalBitrateK - audioBitrateK);

    args.push(
      "-c:v", "libx264",
      "-b:v", `${videoBitrateK}k`,
      "-maxrate", `${Math.floor(videoBitrateK * 1.4)}k`,
      "-bufsize", `${Math.floor(videoBitrateK * 2)}k`,
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", `${audioBitrateK}k`,
      "-movflags", "+faststart"
    );
  } else {
    let chosenCrf = 26;
    if (crf !== undefined) {
      chosenCrf = crf;
    } else {
      switch (preset) {
        case "github_pr": chosenCrf = 28; break;
        case "discord": chosenCrf = 26; break;
        case "email": chosenCrf = 32; break;
        case "balanced": chosenCrf = 26; break;
        case "high_quality": chosenCrf = 21; break;
      }
    }

    args.push(
      "-c:v", "libx264",
      "-crf", chosenCrf.toString(),
      "-preset", "medium",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart"
    );
  }

  args.push("-y", output);

  const result = await runFfmpeg(args);
  const statsAfter = fs.statSync(output);

  return {
    success: true,
    outputPath: output,
    originalSizeBytes: statsBefore.size,
    compressedSizeBytes: statsAfter.size,
    compressionRatio: `${((1 - (statsAfter.size / statsBefore.size)) * 100).toFixed(1)}%`,
    commandExecuted: result.command,
    durationSeconds: result.durationSeconds,
  };
}
