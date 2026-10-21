import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";
import { probeMedia } from "./probe.js";

export const reformatAspectSchema = z.object({
  inputPath: z.string().describe("Path to the source video file"),
  outputPath: z.string().describe("Destination path for the reformatted video"),
  targetRatio: z
    .enum(["9:16", "1:1", "16:9", "4:5"])
    .default("9:16")
    .describe("Target aspect ratio. '9:16' (Reels/Shorts/TikTok), '1:1' (Square), '16:9' (Landscape), '4:5' (Portrait Feed)"),
  mode: z
    .enum(["blur_background", "fit_pad", "crop_center"])
    .default("blur_background")
    .describe("Reformatting mode. 'blur_background' adds an aesthetic blurred background of the video itself. 'fit_pad' adds solid colored padding. 'crop_center' zooms and crops the center."),
  padColor: z
    .string()
    .default("black")
    .describe("Background color when using 'fit_pad' mode (e.g. 'black', 'white', or hex '0x1e1e2e')"),
  blurAmount: z
    .number()
    .min(5)
    .max(50)
    .default(20)
    .describe("Blur intensity (5-50) for 'blur_background' mode. Default: 20"),
  hardwareAcceleration: z
    .boolean()
    .optional()
    .describe("Whether to use Apple Silicon VideoToolbox hardware acceleration if available (default: true)"),
});

export type ReformatAspectArgs = z.infer<typeof reformatAspectSchema>;

const RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export async function reformatAspectRatio(args: ReformatAspectArgs) {
  const input = await ensureFileExists(args.inputPath);
  const output = await ensureOutputDir(args.outputPath);

  const targetRatio = args.targetRatio ?? "9:16";
  const mode = args.mode ?? "blur_background";
  const padColor = args.padColor ?? "black";
  const blurAmount = args.blurAmount ?? 20;

  const dims = RATIO_DIMENSIONS[targetRatio] || RATIO_DIMENSIONS["9:16"];
  const { width: tw, height: th } = dims;

  // Probe media to check if audio exists
  const probeInfo = await probeMedia(input);
  const hasAudio = probeInfo.audioStreams.length > 0;

  // Determine hardware encoder
  const hwInfo = await detectHwAccel();
  const useHw = args.hardwareAcceleration ?? hwInfo.isAvailable;
  const videoEncoder = useHw && hwInfo.isAvailable ? hwInfo.h264Encoder : "libx264";

  const ffmpegArgs: string[] = ["-i", input];

  if (mode === "blur_background") {
    const filter = `[0:v]split=2[bg][fg];[bg]scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},boxblur=${blurAmount}:${blurAmount}[blurred];[fg]scale=${tw}:${th}:force_original_aspect_ratio=decrease[sharp];[blurred][sharp]overlay=(W-w)/2:(H-h)/2,setsar=1[outv]`;
    ffmpegArgs.push("-filter_complex", filter, "-map", "[outv]");
  } else if (mode === "fit_pad") {
    const filter = `scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:color=${padColor},setsar=1`;
    ffmpegArgs.push("-vf", filter);
  } else {
    // crop_center
    const filter = `scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},setsar=1`;
    ffmpegArgs.push("-vf", filter);
  }

  // Audio handling
  if (hasAudio) {
    if (mode === "blur_background") {
      ffmpegArgs.push("-map", "0:a?", "-c:a", "aac", "-b:a", "192k");
    } else {
      ffmpegArgs.push("-c:a", "aac", "-b:a", "192k");
    }
  }

  // Video codec parameters
  ffmpegArgs.push("-c:v", videoEncoder);
  if (videoEncoder === "h264_videotoolbox") {
    ffmpegArgs.push("-b:v", "4M", "-pix_fmt", "yuv420p");
  } else {
    ffmpegArgs.push("-crf", "22", "-preset", "fast", "-pix_fmt", "yuv420p");
  }

  ffmpegArgs.push("-movflags", "+faststart", "-y", output);

  const res = await runFfmpeg(ffmpegArgs);

  return {
    success: true,
    outputPath: output,
    targetRatio,
    mode,
    resolution: `${tw}x${th}`,
    encoderUsed: videoEncoder,
    hardwareAccelerated: videoEncoder.includes("videotoolbox"),
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
  };
}
