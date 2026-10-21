import fs from "node:fs";
import { z } from "zod";
import { runFfmpeg, ensureFileExists, ensureOutputDir } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";
import { probeMedia } from "./probe.js";

export const compressMediaSchema = z.object({
  inputPath: z.string().describe("Absolute or relative file path to the source video to compress (e.g. './recordings/demo.mov')"),
  outputPath: z.string().describe("Target destination path for the compressed MP4 output file (e.g. './recordings/demo_compressed.mp4')"),
  targetSizeMB: z.number().positive().optional().describe("Target output file size in Megabytes (e.g., 9.5 for GitHub PRs, 24 for Discord). When provided, bitrates are calculated dynamically based on media duration."),
  preset: z.enum(["github_pr", "discord", "email", "balanced", "high_quality"]).optional().default("balanced").describe("Compression preset when targetSizeMB is not specified: 'github_pr' (CRF 28, max 720p), 'discord' (CRF 26), 'email' (CRF 32, max 480p), 'balanced' (CRF 26, default), or 'high_quality' (CRF 21)."),
  crf: z.number().int().min(18).max(45).optional().describe("Custom Constant Rate Factor quality value between 18 (near-lossless) and 45 (maximum compression). Overrides preset. Lower values produce higher visual quality and larger files."),
  maxWidth: z.number().int().positive().optional().describe("Maximum video width in pixels to downscale if the source is larger (e.g. 1280 for 720p, 1920 for 1080p). Preserves aspect ratio."),
  hardwareAcceleration: z.boolean().optional().describe("Whether to use Apple Silicon VideoToolbox hardware encoding (h264_videotoolbox) on macOS for 10x faster encoding. Defaults to true if available."),
});

export type CompressMediaParams = z.infer<typeof compressMediaSchema>;

export async function compressMedia(params: CompressMediaParams) {
  const { inputPath, outputPath, targetSizeMB, preset = "balanced", crf, maxWidth, hardwareAcceleration } = params;
  const input = await ensureFileExists(inputPath);
  const output = await ensureOutputDir(outputPath);

  const hwInfo = await detectHwAccel();
  const useHw = hardwareAcceleration ?? hwInfo.isAvailable;

  const statsBefore = fs.statSync(input);
  const probe = await probeMedia(input);
  const duration = probe.format.durationSeconds || 10;
  const hasAudio = probe.audioStreams.length > 0;

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

  let videoEncoder = "libx264";
  let isHwUsed = false;

  if (targetSizeMB) {
    const totalBits = targetSizeMB * 8 * 1024 * 1024;
    const audioBitrateK = hasAudio ? 96 : 0;
    const totalBitrateK = Math.floor(totalBits / duration / 1000);
    const videoBitrateK = Math.max(100, totalBitrateK - audioBitrateK);

    if (useHw && hwInfo.isAvailable) {
      videoEncoder = hwInfo.h264Encoder;
      isHwUsed = true;
      args.push("-c:v", videoEncoder, "-b:v", `${videoBitrateK}k`);
    } else {
      args.push(
        "-c:v", "libx264",
        "-b:v", `${videoBitrateK}k`,
        "-maxrate", `${Math.floor(videoBitrateK * 1.4)}k`,
        "-bufsize", `${Math.floor(videoBitrateK * 2)}k`
      );
    }

    args.push("-pix_fmt", "yuv420p");
    if (hasAudio) {
      args.push("-c:a", "aac", "-b:a", `${audioBitrateK}k`);
    }
    args.push("-movflags", "+faststart");
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

    if (useHw && hwInfo.isAvailable) {
      videoEncoder = hwInfo.h264Encoder;
      isHwUsed = true;
      const bitrateMap: Record<string, string> = {
        github_pr: "1500k",
        discord: "2000k",
        email: "800k",
        balanced: "2200k",
        high_quality: "4000k",
      };
      args.push("-c:v", videoEncoder, "-b:v", bitrateMap[preset] || "2200k");
    } else {
      args.push(
        "-c:v", "libx264",
        "-crf", chosenCrf.toString(),
        "-preset", "medium"
      );
    }

    args.push("-pix_fmt", "yuv420p");
    if (hasAudio) {
      args.push("-c:a", "aac", "-b:a", "128k");
    }
    args.push("-movflags", "+faststart");
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
    hardwareAccelerated: isHwUsed,
    encoderUsed: videoEncoder,
    commandExecuted: result.command,
    durationSeconds: result.durationSeconds,
  };
}
