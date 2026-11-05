import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg, FfmpegProgress } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";

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

  const args: string[] = ["-y"];

  // Fast seek before -i
  args.push("-ss", params.startTime);
  args.push("-i", input);

  if (params.endTime) {
    const duration = timestampToSeconds(params.endTime) - timestampToSeconds(params.startTime);
    if (duration <= 0) {
      throw new Error("endTime must be later than startTime");
    }
    args.push("-t", String(duration));
  } else if (params.duration) {
    args.push("-t", params.duration);
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
  });

  return {
    outputPath: output,
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
  };
}
