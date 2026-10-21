import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg } from "../utils/exec.js";
import { probeMedia } from "./probe.js";

export const trimSilenceSchema = z.object({
  inputPath: z.string().describe("Path to the source audio or video file containing speech or audio to clean up."),
  outputPath: z.string().describe("Destination path for the trimmed media file without dead air (e.g. './recordings/cleaned.mp4')."),
  mode: z
    .enum(["start_end", "all_pauses"])
    .default("start_end")
    .describe("Trimming behavior: 'start_end' removes silence only at the beginning and end of recording. 'all_pauses' removes silent gaps and dead air throughout the entire recording."),
  thresholdDb: z
    .number()
    .min(-60)
    .max(-10)
    .default(-35)
    .describe("Silence audio threshold in decibels (dB), between -60dB (very quiet background) and -10dB (aggressive). Audio quieter than this threshold is treated as silence. Default: -35dB."),
  minDurationSeconds: z
    .number()
    .min(0.1)
    .max(10)
    .default(0.5)
    .describe("Minimum silence duration in seconds to trigger trimming (e.g. 0.5s). Pauses shorter than this threshold are preserved to sound natural. Default: 0.5s."),
});

export type TrimSilenceArgs = z.infer<typeof trimSilenceSchema>;

export async function trimSilence(args: TrimSilenceArgs) {
  const input = await ensureFileExists(args.inputPath);
  const output = await ensureOutputDir(args.outputPath);

  const mode = args.mode ?? "start_end";
  const thresholdDb = args.thresholdDb ?? -35;
  const minDuration = args.minDurationSeconds ?? 0.5;

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
    ffmpegArgs.push("-c:v", "copy", "-c:a", "aac", "-b:a", "192k");
  }

  ffmpegArgs.push("-y", output);

  const res = await runFfmpeg(ffmpegArgs);

  let timeSaved = 0;
  let newDuration = 0;
  try {
    const newProbe = await probeMedia(output);
    newDuration = newProbe.format.durationSeconds;
    timeSaved = Number(Math.max(0, originalProbe.format.durationSeconds - newDuration).toFixed(2));
  } catch {
    // Optional
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
