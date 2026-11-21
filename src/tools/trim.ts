import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg, FfmpegProgress } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";
import { probeMedia } from "./probe.js";

export const trimMediaSchema = z.object({
  inputPath: z.string().describe("Path to the source media file to cut."),
  outputPath: z.string().describe("Destination path for the trimmed output file (e.g. './clip.mp4')."),
  startTime: z
    .string()
    .regex(/^((\d{1,2}:)?\d{1,2}:\d{1,2}(\.\d+)?|\d+(\.\d+)?)$/, "startTime must be 'HH:MM:SS' (e.g. '00:01:30') or seconds (e.g. '90')")
    .describe("Start timestamp formatted as 'HH:MM:SS' (e.g. '00:01:30') or seconds (e.g. '90')."),
  endTime: z
    .string()
    .regex(/^((\d{1,2}:)?\d{1,2}:\d{1,2}(\.\d+)?|\d+(\.\d+)?)$/, "endTime must be 'HH:MM:SS' or seconds")
    .optional()
    .describe("Optional end timestamp formatted as 'HH:MM:SS' or seconds. Do not combine with duration."),
  duration: z
    .string()
    .regex(/^(\d+(\.\d+)?)$/, "duration must be a positive number of seconds (e.g. '30')")
    .optional()
    .describe("Optional duration in seconds from startTime (e.g. '30'). If neither endTime nor duration is set, trims to end of file."),
  accurateReencode: z
    .boolean()
    .optional()
    .describe("Re-encode video for cuts between keyframes. Default: false (uses fast stream copy)."),
});

export type TrimMediaParams = z.infer<typeof trimMediaSchema>;

function timestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(":").map(Number);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export async function trimMedia(
  params: TrimMediaParams,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
): Promise<{
  outputPath: string;
  commandExecuted: string;
  durationSeconds: number;
}> {
  const input = await ensureFileExists(params.inputPath);
  const output = await ensureOutputDir(params.outputPath);

  const probe = await probeMedia(input, { signal: options?.signal });
  const fileDuration = probe.format.durationSeconds;
  const startSec = timestampToSeconds(params.startTime);

  if (fileDuration > 0 && startSec >= fileDuration) {
    throw new Error(
      `startTime (${params.startTime} / ${startSec}s) is greater than or equal to file duration (${fileDuration.toFixed(2)}s).`
    );
  }

  let durationToCut: number | undefined;

  if (params.endTime) {
    const endSec = timestampToSeconds(params.endTime);
    if (endSec <= startSec) {
      throw new Error(`endTime (${params.endTime}) must be later than startTime (${params.startTime}).`);
    }
    const effectiveEndSec = fileDuration > 0 ? Math.min(endSec, fileDuration) : endSec;
    durationToCut = Math.max(0.001, effectiveEndSec - startSec);
  } else if (params.duration) {
    const reqDuration = Number(params.duration);
    if (reqDuration <= 0) {
      throw new Error("duration must be a positive number of seconds");
    }
    durationToCut = fileDuration > 0 ? Math.min(reqDuration, Math.max(0.001, fileDuration - startSec)) : reqDuration;
  }

  const args: string[] = ["-y"];

  // Fast seek before -i
  args.push("-ss", params.startTime);
  args.push("-i", input);

  if (durationToCut !== undefined) {
    args.push("-t", String(durationToCut));
  }

  if (params.accurateReencode) {
    const hwInfo = await detectHwAccel();
    if (hwInfo.isAvailable) {
      args.push("-c:v", hwInfo.h264Encoder, "-b:v", "4M", "-c:a", "aac");
    } else {
      args.push("-c:v", "libx264", "-crf", "22", "-preset", "fast", "-c:a", "aac");
    }
  } else {
    // Lossless instantaneous stream copy
    args.push("-c", "copy");
  }

  args.push(output);

  const res = await runFfmpeg(args, {
    signal: options?.signal,
    onProgress: options?.onProgress,
    expectedDurationSeconds: durationToCut,
  });

  return {
    outputPath: output,
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
  };
}
