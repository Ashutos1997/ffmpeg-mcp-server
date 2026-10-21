import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg } from "../utils/exec.js";
import { probeMedia } from "./probe.js";

export const trimSilenceSchema = z.object({
  inputPath: z.string().describe("Path to the source audio or video file"),
  outputPath: z.string().describe("Destination path for the trimmed file"),
  mode: z
    .enum(["start_end", "all_pauses"])
    .default("start_end")
    .describe("'start_end' removes dead air at the beginning and end of recording. 'all_pauses' strips silent gaps throughout the entire recording."),
  thresholdDb: z
    .number()
    .min(-60)
    .max(-10)
    .default(-35)
    .describe("Silence volume threshold in dB (e.g. -35). Audio quieter than this is treated as silence."),
  minDurationSeconds: z
    .number()
    .min(0.1)
    .max(10)
    .default(0.5)
    .describe("Minimum silence duration to trigger trimming (in seconds). Default: 0.5s"),
});

export type TrimSilenceArgs = z.infer<typeof trimSilenceSchema>;

export async function trimSilence(args: TrimSilenceArgs) {
  const input = await ensureFileExists(args.inputPath);
  const output = await ensureOutputDir(args.outputPath);

  const mode = args.mode ?? "start_end";
  const thresholdDb = args.thresholdDb ?? -35;
  const minDuration = args.minDurationSeconds ?? 0.5;

  // Probe original file to check audio and duration
  const originalProbe = await probeMedia(input);
  if (originalProbe.audioStreams.length === 0) {
    throw new Error(`Cannot trim silence: input file '${input}' contains no audio streams.`);
  }

  const isVideo = originalProbe.videoStreams.length > 0;
  let audioFilter = "";

  if (mode === "start_end") {
    audioFilter = `silenceremove=start_periods=1:start_duration=${minDuration}:start_threshold=${thresholdDb}dB:detection=peak,areverse,silenceremove=start_periods=1:start_duration=${minDuration}:start_threshold=${thresholdDb}dB:detection=peak,areverse`;
  } else {
    audioFilter = `silenceremove=stop_periods=-1:stop_duration=${minDuration}:stop_threshold=${thresholdDb}dB`;
  }

  const ffmpegArgs: string[] = ["-i", input, "-af", audioFilter];

  if (isVideo) {
    // If input is video, keep video stream
    ffmpegArgs.push("-c:v", "copy", "-c:a", "aac", "-b:a", "192k");
  }

  ffmpegArgs.push("-y", output);

  const res = await runFfmpeg(ffmpegArgs);

  // Probe output to compute time saved
  let timeSaved = 0;
  let newDuration = 0;
  try {
    const newProbe = await probeMedia(output);
    newDuration = newProbe.format.durationSeconds;
    timeSaved = Number(Math.max(0, originalProbe.format.durationSeconds - newDuration).toFixed(2));
  } catch {
    // Output duration probing optional
  }

  return {
    success: true,
    outputPath: output,
    mode,
    originalDurationSeconds: originalProbe.format.durationSeconds,
    newDurationSeconds: newDuration,
    timeSavedSeconds: timeSaved,
    thresholdDb,
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
  };
}
