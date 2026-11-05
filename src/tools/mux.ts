import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg, FfmpegProgress } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";
import { probeMedia } from "./probe.js";

export const muxMediaSchema = z.object({
  videoPath: z.string().describe("Path to the source video file."),
  audioPath: z.string().describe("Path to the source audio file (.mp3, .wav, .aac, .m4a, etc.) to mux."),
  outputPath: z.string().describe("Target output video path (.mp4, .mov, or .mkv)."),
  mode: z
    .enum(["replace", "add"])
    .optional()
    .default("replace")
    .describe("Muxing mode: 'replace' drops existing video audio and uses new audio; 'add' keeps original audio and adds new audio as secondary track. Default: 'replace'."),
  audioOffsetSeconds: z
    .number()
    .optional()
    .default(0)
    .describe("Audio delay or advance in seconds. Positive numbers delay audio; negative numbers advance it. Default: 0."),
  shortest: z
    .boolean()
    .optional()
    .default(true)
    .describe("End output when the shorter input stream finishes. Default: true."),
  streamCopyVideo: z
    .boolean()
    .optional()
    .default(true)
    .describe("Use stream copy (-c:v copy) for instantaneous video multiplexing without quality loss. Default: true."),
  hardwareAcceleration: z
    .boolean()
    .optional()
    .default(true)
    .describe("Use hardware-accelerated video encoding when streamCopyVideo is false. Default: true."),
});

export type MuxMediaParams = z.infer<typeof muxMediaSchema>;

export async function muxMedia(
  params: MuxMediaParams,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
) {
  const {
    videoPath,
    audioPath,
    outputPath,
    mode = "replace",
    audioOffsetSeconds = 0,
    shortest = true,
    streamCopyVideo = true,
    hardwareAcceleration = true,
  } = params;

  const video = await ensureFileExists(videoPath);
  const audio = await ensureFileExists(audioPath);
  const output = await ensureOutputDir(outputPath);

  let expectedDuration: number | undefined;
  try {
    const probe = await probeMedia(video, { signal: options?.signal });
    expectedDuration = probe.format.durationSeconds;
  } catch {}

  const hwInfo = await detectHwAccel();
  const useHw = hardwareAcceleration && hwInfo.isAvailable;
  const isHwUsed = !streamCopyVideo && useHw;
  const videoEncoder = streamCopyVideo ? "copy" : (isHwUsed ? hwInfo.h264Encoder : "libx264");

  const args: string[] = [];

  // Input 0: Video
  args.push("-i", video);

  // Input 1: Audio (with optional offset)
  if (audioOffsetSeconds !== 0) {
    args.push("-itsoffset", String(audioOffsetSeconds));
  }
  args.push("-i", audio);

  // Explicit Stream Mapping
  if (mode === "replace") {
    // Map video stream from input 0 and audio stream from input 1
    args.push("-map", "0:v:0", "-map", "1:a:0");
  } else {
    // Keep original audio from input 0 if present, and append audio from input 1
    args.push("-map", "0:v:0", "-map", "0:a?", "-map", "1:a:0");
  }

  // Video codec
  if (streamCopyVideo) {
    args.push("-c:v", "copy");
  } else {
    args.push("-c:v", videoEncoder);
    if (isHwUsed) {
      args.push("-b:v", "4M", "-pix_fmt", "yuv420p");
    } else {
      args.push("-crf", "22", "-preset", "fast", "-pix_fmt", "yuv420p");
    }
  }

  // Audio codec
  args.push("-c:a", "aac", "-b:a", "192k");

  if (shortest) {
    args.push("-shortest");
  }

  args.push("-movflags", "+faststart", "-y", output);

  const res = await runFfmpeg(args, {
    signal: options?.signal,
    onProgress: options?.onProgress,
    expectedDurationSeconds: expectedDuration,
  });

  return {
    success: true,
    outputPath: output,
    mode,
    encoderUsed: videoEncoder,
    hardwareAccelerated: isHwUsed,
    audioOffsetSeconds,
    shortest,
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
  };
}

