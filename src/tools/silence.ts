import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runCommand, runFfmpeg, FfmpegProgress } from "../utils/exec.js";
import { probeMedia } from "./probe.js";
import { detectHwAccel } from "../utils/hwaccel.js";

export const trimSilenceSchema = z.object({
  inputPath: z.string().describe("Path to the source audio or video file."),
  outputPath: z.string().describe("Destination path for the trimmed file (e.g. './recordings/cleaned.mp4')."),
  mode: z
    .enum(["start_end", "all_pauses"])
    .default("start_end")
    .describe("Trim mode: 'start_end' removes silence at the start and end (preserving perfect A/V sync on videos); 'all_pauses' removes silent pauses across audio files. Default: 'start_end'."),
  thresholdDb: z
    .number()
    .min(-60)
    .max(-10)
    .default(-35)
    .describe("Volume threshold in decibels, between -60dB and -10dB. Audio quieter than this is treated as silence. Default: -35."),
  minDurationSeconds: z
    .number()
    .min(0.1)
    .max(10)
    .default(0.5)
    .describe("Minimum silence duration in seconds to trigger a cut. Default: 0.5."),
});

export type TrimSilenceArgs = z.infer<typeof trimSilenceSchema>;

export async function trimSilence(
  args: TrimSilenceArgs,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
) {
  const input = await ensureFileExists(args.inputPath);
  const output = await ensureOutputDir(args.outputPath);

  const mode = args.mode ?? "start_end";
  const thresholdDb = args.thresholdDb ?? -35;
  const minDuration = args.minDurationSeconds ?? 0.5;

  const originalProbe = await probeMedia(input, { signal: options?.signal });
  if (originalProbe.audioStreams.length === 0) {
    throw new Error(`Cannot trim silence: input file '${input}' contains no audio streams.`);
  }

  const isVideo = originalProbe.videoStreams.length > 0;
  const originalDuration = originalProbe.format.durationSeconds;

  if (isVideo && mode === "all_pauses") {
    throw new Error(
      "Trimming internal pauses ('all_pauses') on video files causes severe audio/video desync. For video files, please use mode: 'start_end', or extract the audio track first with extract_audio."
    );
  }

  let commandExecuted = "";
  let durationSeconds = 0;

  if (isVideo && mode === "start_end") {
    // Detect silence intervals using silencedetect filter
    const detectRes = await runCommand(
      "ffmpeg",
      ["-i", input, "-af", `silencedetect=noise=${thresholdDb}dB:d=${minDuration}`, "-f", "null", "-"],
      { signal: options?.signal }
    );

    const log = `${detectRes.stdout}\n${detectRes.stderr}`;
    const startEndRegex = /silence_end:\s*([\d.]+)/g;
    const startSilenceRegex = /silence_start:\s*([\d.]+)/g;

    let startTime = 0;
    let endTime = originalDuration;

    // Check if there was silence at the beginning (silence_start at 0)
    const firstSilenceMatch = log.match(/silence_start:\s*([0-9.]+)/);
    if (firstSilenceMatch && parseFloat(firstSilenceMatch[1]) < 0.2) {
      const endMatch = log.match(/silence_end:\s*([0-9.]+)/);
      if (endMatch) {
        startTime = Math.min(originalDuration - 0.5, parseFloat(endMatch[1]));
      }
    }

    // Check for silence at the end
    const allSilenceStarts: number[] = [];
    let m;
    while ((m = startSilenceRegex.exec(log)) !== null) {
      allSilenceStarts.push(parseFloat(m[1]));
    }
    if (allSilenceStarts.length > 0) {
      const lastStart = allSilenceStarts[allSilenceStarts.length - 1];
      // If the last silence starts near the end and doesn't end before original duration
      if (lastStart > startTime && originalDuration - lastStart <= minDuration * 2 + 1) {
        endTime = lastStart;
      }
    }

    const hwInfo = await detectHwAccel();
    const ffmpegArgs: string[] = ["-ss", startTime.toFixed(3), "-i", input];

    if (endTime < originalDuration) {
      ffmpegArgs.push("-to", endTime.toFixed(3));
    }

    if (hwInfo.isAvailable) {
      ffmpegArgs.push("-c:v", hwInfo.h264Encoder, "-b:v", "4M", "-c:a", "aac", "-b:a", "192k");
    } else {
      ffmpegArgs.push("-c:v", "libx264", "-crf", "22", "-preset", "fast", "-c:a", "aac", "-b:a", "192k");
    }

    ffmpegArgs.push("-movflags", "+faststart", "-y", output);

    const res = await runFfmpeg(ffmpegArgs, {
      signal: options?.signal,
      onProgress: options?.onProgress,
      expectedDurationSeconds: originalDuration,
    });
    commandExecuted = res.command;
    durationSeconds = res.durationSeconds;
  } else {
    // Audio file or fallback
    let audioFilter = "";
    if (mode === "start_end") {
      audioFilter = `silenceremove=start_periods=1:start_duration=${minDuration}:start_threshold=${thresholdDb}dB:detection=peak,areverse,silenceremove=start_periods=1:start_duration=${minDuration}:start_threshold=${thresholdDb}dB:detection=peak,areverse`;
    } else {
      audioFilter = `silenceremove=stop_periods=-1:stop_duration=${minDuration}:stop_threshold=${thresholdDb}dB`;
    }

    const ffmpegArgs: string[] = ["-i", input, "-af", audioFilter, "-y", output];

    const res = await runFfmpeg(ffmpegArgs, {
      signal: options?.signal,
      onProgress: options?.onProgress,
      expectedDurationSeconds: originalDuration,
    });
    commandExecuted = res.command;
    durationSeconds = res.durationSeconds;
  }

  let timeSaved = 0;
  let newDuration = originalDuration;
  try {
    const newProbe = await probeMedia(output, { signal: options?.signal });
    newDuration = newProbe.format.durationSeconds;
    timeSaved = Number(Math.max(0, originalDuration - newDuration).toFixed(2));
  } catch {
    // Optional
  }

  return {
    success: true,
    outputPath: output,
    mode,
    originalDurationSeconds: originalDuration,
    newDurationSeconds: newDuration,
    timeSavedSeconds: timeSaved,
    thresholdDb,
    commandExecuted,
    durationSeconds,
  };
}
