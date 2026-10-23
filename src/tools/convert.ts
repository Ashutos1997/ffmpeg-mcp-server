import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg, FfmpegProgress } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";
import { probeMedia } from "./probe.js";

export const convertMediaSchema = z.object({
  inputPath: z.string().describe("Path to the source media file to convert"),
  outputPath: z.string().describe("Destination path for the converted file (e.g. ./output.mp4, ./output.webm, ./animation.gif)"),
  preset: z
    .enum(["web_mp4", "webm", "gif", "auto"])
    .optional()
    .describe("Encoding preset: 'web_mp4' for browser playback, 'webm' for WebM video, 'gif' for animated GIF, or 'auto'. Default: 'auto'."),
  crf: z
    .number()
    .min(0)
    .max(51)
    .optional()
    .describe("Quality factor from 0 to 51. Lower numbers mean higher quality. Default: 23 for MP4, 30 for WebM."),
  resolution: z
    .string()
    .optional()
    .describe("Target size formatted as 'WIDTHxHEIGHT', such as '1920x1080' or '1280x720'"),
  fps: z
    .number()
    .positive()
    .optional()
    .describe("Target frame rate in frames per second, such as 30, 60, or 15"),
  hardwareAcceleration: z
    .boolean()
    .optional()
    .describe("Use hardware-accelerated video encoding (VideoToolbox, NVENC, QSV, etc.) when available. Default: true."),
});

export type ConvertMediaParams = z.infer<typeof convertMediaSchema>;

export async function convertMedia(
  params: ConvertMediaParams,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
): Promise<{
  outputPath: string;
  commandExecuted: string;
  hardwareAccelerated: boolean;
  encoderUsed: string;
  durationSeconds: number;
}> {
  const input = await ensureFileExists(params.inputPath);
  const output = await ensureOutputDir(params.outputPath);

  let inputDuration: number | undefined;
  try {
    const probe = await probeMedia(input, { signal: options?.signal });
    inputDuration = probe.format.durationSeconds;
  } catch {}

  const hwInfo = await detectHwAccel();
  const useHw = params.hardwareAcceleration ?? hwInfo.isAvailable;

  const preset = params.preset || "auto";
  const args: string[] = ["-i", input];
  let isHwUsed = false;
  let encoderUsed = "auto";

  if (preset === "gif") {
    encoderUsed = "gif (palettegen/paletteuse)";
    const scale = params.resolution
      ? `scale=${params.resolution.replace("x", ":")}:flags=lanczos`
      : "scale=iw:ih:flags=lanczos";
    const fps = params.fps ? `fps=${params.fps},` : "fps=15,";
    const filter = `${fps}${scale},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;

    args.push("-vf", filter);
  } else if (preset === "web_mp4" || (preset === "auto" && output.toLowerCase().endsWith(".mp4"))) {
    if (useHw && hwInfo.isAvailable) {
      encoderUsed = hwInfo.h264Encoder;
      args.push("-c:v", hwInfo.h264Encoder, "-b:v", "4M");
      isHwUsed = true;
    } else {
      encoderUsed = "libx264";
      args.push("-c:v", "libx264", "-crf", String(params.crf ?? 23), "-preset", "medium");
    }
    args.push("-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart");

    if (params.resolution) {
      args.push("-vf", `scale=${params.resolution.replace("x", ":")}`);
    }
    if (params.fps) {
      args.push("-r", String(params.fps));
    }
  } else if (preset === "webm" || (preset === "auto" && output.toLowerCase().endsWith(".webm"))) {
    encoderUsed = "libvpx-vp9";
    args.push("-c:v", "libvpx-vp9", "-crf", String(params.crf ?? 30), "-b:v", "0", "-c:a", "libopus", "-b:a", "128k");

    if (params.resolution) {
      args.push("-vf", `scale=${params.resolution.replace("x", ":")}`);
    }
  } else {
    encoderUsed = "copy/default";
    if (params.crf) {
      args.push("-crf", String(params.crf));
    }
    if (params.resolution) {
      args.push("-vf", `scale=${params.resolution.replace("x", ":")}`);
    }
  }

  args.push("-y", output);

  const res = await runFfmpeg(args, {
    signal: options?.signal,
    onProgress: options?.onProgress,
    expectedDurationSeconds: inputDuration,
  });

  return {
    outputPath: output,
    commandExecuted: res.command,
    hardwareAccelerated: isHwUsed,
    encoderUsed,
    durationSeconds: res.durationSeconds,
  };
}
