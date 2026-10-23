import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg, FfmpegProgress } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";
import { probeMedia } from "./probe.js";

export const addOverlaySchema = z.object({
  videoPath: z.string().describe("Path to the base video file."),
  overlayPath: z.string().describe("Path to the watermark, logo, or overlay image (.png, .jpg, or .webp)."),
  outputPath: z.string().describe("Destination path for the output video (.mp4 or .mov)."),
  position: z
    .enum(["top_left", "top_right", "bottom_left", "bottom_right", "center"])
    .optional()
    .default("bottom_right")
    .describe("Corner or screen placement for the overlay. Default: 'bottom_right'."),
  padding: z
    .number()
    .int()
    .min(0)
    .max(500)
    .optional()
    .default(20)
    .describe("Margin padding in pixels from the edge. Default: 20."),
  scaleWidth: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional width in pixels to scale the overlay, keeping its original aspect ratio (e.g. 150)."),
  opacity: z
    .number()
    .min(0.05)
    .max(1.0)
    .optional()
    .default(1.0)
    .describe("Overlay opacity from 0.05 (subtle watermark) to 1.0 (fully opaque). Default: 1.0."),
  hardwareAcceleration: z
    .boolean()
    .optional()
    .default(true)
    .describe("Use hardware-accelerated video encoding when available. Default: true."),
});

export type AddOverlayParams = z.infer<typeof addOverlaySchema>;

export async function addOverlay(
  params: AddOverlayParams,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
) {
  const {
    videoPath,
    overlayPath,
    outputPath,
    position = "bottom_right",
    padding = 20,
    scaleWidth,
    opacity = 1.0,
    hardwareAcceleration = true,
  } = params;

  const video = await ensureFileExists(videoPath);
  const overlay = await ensureFileExists(overlayPath);
  const output = await ensureOutputDir(outputPath);

  const probe = await probeMedia(video, { signal: options?.signal });
  const duration = probe.format.durationSeconds;
  const hasAudio = probe.audioStreams.length > 0;

  const hwInfo = await detectHwAccel();
  const useHw = hardwareAcceleration && hwInfo.isAvailable;
  const videoEncoder = useHw ? hwInfo.h264Encoder : "libx264";

  // Build overlay filter chain
  let overlayFilterChain = "[1:v]";
  if (scaleWidth) {
    overlayFilterChain += `scale=${scaleWidth}:-1,`;
  }
  if (opacity < 1.0) {
    overlayFilterChain += `format=rgba,colorchannelmixer=aa=${opacity.toFixed(2)}[logo]`;
  } else {
    overlayFilterChain += "format=rgba[logo]";
  }

  let coords = "W-w-20:H-h-20";
  switch (position) {
    case "top_left":
      coords = `${padding}:${padding}`;
      break;
    case "top_right":
      coords = `W-w-${padding}:${padding}`;
      break;
    case "bottom_left":
      coords = `${padding}:H-h-${padding}`;
      break;
    case "bottom_right":
      coords = `W-w-${padding}:H-h-${padding}`;
      break;
    case "center":
      coords = "(W-w)/2:(H-h)/2";
      break;
  }

  const filter = `${overlayFilterChain};[0:v][logo]overlay=${coords}[outv]`;

  const args: string[] = [
    "-i", video,
    "-i", overlay,
    "-filter_complex", filter,
    "-map", "[outv]",
  ];

  if (hasAudio) {
    args.push("-map", "0:a?", "-c:a", "copy");
  }

  args.push("-c:v", videoEncoder);
  if (useHw) {
    args.push("-b:v", "4M", "-pix_fmt", "yuv420p");
  } else {
    args.push("-crf", "22", "-preset", "fast", "-pix_fmt", "yuv420p");
  }

  args.push("-movflags", "+faststart", "-y", output);

  const res = await runFfmpeg(args, {
    signal: options?.signal,
    onProgress: options?.onProgress,
    expectedDurationSeconds: duration,
  });

  return {
    success: true,
    outputPath: output,
    position,
    padding,
    opacity,
    encoderUsed: videoEncoder,
    hardwareAccelerated: useHw,
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
  };
}
