import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg, FfmpegProgress } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";
import { probeMedia } from "./probe.js";

export const reformatAspectSchema = z.object({
  inputPath: z.string().describe("Path to the source video file."),
  outputPath: z.string().describe("Destination path for the reformatted video."),
  targetRatio: z
    .enum(["9:16", "1:1", "16:9", "4:5"])
    .default("9:16")
    .describe("Target aspect ratio: '9:16' for vertical reels, '1:1' for square, '16:9' for horizontal, or '4:5' for portrait. Default: '9:16'."),
  mode: z
    .enum(["blur_background", "fit_pad", "crop_center"])
    .default("blur_background")
    .describe("Format mode: 'blur_background' adds blurred video borders, 'fit_pad' adds solid color padding, and 'crop_center' zooms and crops the center. Default: 'blur_background'."),
  padColor: z
    .string()
    .default("black")
    .describe("Background color for fit_pad mode, such as 'black', 'white', or hex '0x1e1e2e'. Default: 'black'."),
  blurAmount: z
    .number()
    .min(5)
    .max(50)
    .default(20)
    .describe("Blur strength (5 to 50) for blur_background mode. Default: 20."),
  hardwareAcceleration: z
    .boolean()
    .optional()
    .describe("Use hardware-accelerated video encoding (VideoToolbox, NVENC, QSV, etc.) when available. Default: true."),
});

export type ReformatAspectArgs = z.infer<typeof reformatAspectSchema>;

const RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export async function reformatAspectRatio(
  args: ReformatAspectArgs,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
) {
  const input = await ensureFileExists(args.inputPath);
  const output = await ensureOutputDir(args.outputPath);

  const targetRatio = args.targetRatio ?? "9:16";
  const mode = args.mode ?? "blur_background";
  const padColor = args.padColor ?? "black";
  const blurAmount = args.blurAmount ?? 20;

  const dims = RATIO_DIMENSIONS[targetRatio] || RATIO_DIMENSIONS["9:16"];
  const { width: tw, height: th } = dims;

  const probeInfo = await probeMedia(input, { signal: options?.signal });
  const hasAudio = probeInfo.audioStreams.length > 0;
  const duration = probeInfo.format.durationSeconds;

  const hwInfo = await detectHwAccel();
  const useHw = args.hardwareAcceleration ?? hwInfo.isAvailable;
  const isHwUsed = useHw && hwInfo.isAvailable;
  const videoEncoder = isHwUsed ? hwInfo.h264Encoder : "libx264";

  const ffmpegArgs: string[] = ["-i", input];

  if (mode === "blur_background") {
    const filter = `[0:v]split=2[bg][fg];[bg]scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},boxblur=${blurAmount}:${blurAmount}[blurred];[fg]scale=${tw}:${th}:force_original_aspect_ratio=decrease[sharp];[blurred][sharp]overlay=(W-w)/2:(H-h)/2,setsar=1[outv]`;
    ffmpegArgs.push("-filter_complex", filter, "-map", "[outv]");
  } else if (mode === "fit_pad") {
    const filter = `scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:color=${padColor},setsar=1`;
    ffmpegArgs.push("-vf", filter);
  } else {
    const filter = `scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},setsar=1`;
    ffmpegArgs.push("-vf", filter);
  }

  if (hasAudio) {
    if (mode === "blur_background") {
      ffmpegArgs.push("-map", "0:a?", "-c:a", "aac", "-b:a", "192k");
    } else {
      ffmpegArgs.push("-c:a", "aac", "-b:a", "192k");
    }
  }

  ffmpegArgs.push("-c:v", videoEncoder);
  if (isHwUsed) {
    ffmpegArgs.push("-b:v", "4M", "-pix_fmt", "yuv420p");
  } else {
    ffmpegArgs.push("-crf", "22", "-preset", "fast", "-pix_fmt", "yuv420p");
  }

  ffmpegArgs.push("-movflags", "+faststart", "-y", output);

  const res = await runFfmpeg(ffmpegArgs, {
    signal: options?.signal,
    onProgress: options?.onProgress,
    expectedDurationSeconds: duration,
  });

  return {
    success: true,
    outputPath: output,
    targetRatio,
    mode,
    resolution: `${tw}x${th}`,
    encoderUsed: videoEncoder,
    hardwareAccelerated: isHwUsed,
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
  };
}
