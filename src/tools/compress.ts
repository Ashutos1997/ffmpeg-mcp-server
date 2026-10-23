import fs from "node:fs";
import { z } from "zod";
import { runFfmpeg, ensureFileExists, ensureOutputDir, FfmpegProgress } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";
import { probeMedia } from "./probe.js";

export const compressMediaSchema = z.object({
  inputPath: z.string().describe("Path to the source video file (e.g. './recordings/demo.mov')"),
  outputPath: z.string().describe("Destination path for the compressed MP4 file (e.g. './recordings/demo_compressed.mp4')"),
  targetSizeMB: z.number().positive().optional().describe("Target output size in megabytes, such as 9.5 for GitHub or 24 for Discord. Computes bitrates from duration."),
  preset: z.enum(["github_pr", "discord", "email", "balanced", "high_quality"]).optional().default("balanced").describe("Preset when targetSizeMB is not set: 'github_pr', 'discord', 'email', 'balanced', or 'high_quality'. Default: 'balanced'."),
  crf: z.number().int().min(18).max(45).optional().describe("Quality value between 18 (higher quality) and 45 (smaller file). Overrides preset."),
  maxWidth: z.number().int().positive().optional().describe("Maximum video width in pixels, such as 1280 for 720p. Keeps aspect ratio."),
  hardwareAcceleration: z.boolean().optional().describe("Use hardware-accelerated video encoding (VideoToolbox, NVENC, QSV, etc.) when available. Default: true."),
});

export type CompressMediaParams = z.infer<typeof compressMediaSchema>;

export async function compressMedia(
  params: CompressMediaParams,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
) {
  const { inputPath, outputPath, targetSizeMB, preset = "balanced", crf, maxWidth, hardwareAcceleration } = params;
  const input = await ensureFileExists(inputPath);
  const output = await ensureOutputDir(outputPath);

  const hwInfo = await detectHwAccel();
  const useHw = hardwareAcceleration ?? hwInfo.isAvailable;

  const statsBefore = fs.statSync(input);
  const probe = await probeMedia(input, { signal: options?.signal });
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

  const result = await runFfmpeg(args, {
    signal: options?.signal,
    onProgress: options?.onProgress,
    expectedDurationSeconds: duration,
  });
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
