import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg, FfmpegProgress } from "../utils/exec.js";
import { probeMedia } from "./probe.js";

export const normalizeAudioSchema = z.object({
  inputPath: z.string().describe("Path to the source audio or video file."),
  outputPath: z.string().describe("Destination path for the normalized media file."),
  targetLufs: z
    .number()
    .min(-30)
    .max(-10)
    .optional()
    .default(-16)
    .describe("Target integrated loudness in LUFS (-16 for podcasts/Reels, -14 for YouTube, -23 for broadcast). Default: -16."),
  targetPeakDb: z
    .number()
    .min(-5)
    .max(0)
    .optional()
    .default(-1.5)
    .describe("Maximum allowed true peak level in dBTP. Default: -1.5."),
  voiceClarity: z
    .boolean()
    .optional()
    .default(false)
    .describe("Apply speech enhancement filters (80Hz high-pass to remove mic rumble and gentle compressor for presence). Default: false."),
});

export type NormalizeAudioParams = z.infer<typeof normalizeAudioSchema>;

export async function normalizeAudio(
  params: NormalizeAudioParams,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
) {
  const { inputPath, outputPath, targetLufs = -16, targetPeakDb = -1.5, voiceClarity = false } = params;

  const input = await ensureFileExists(inputPath);
  const output = await ensureOutputDir(outputPath);

  const probe = await probeMedia(input, { signal: options?.signal });
  if (probe.audioStreams.length === 0) {
    throw new Error(`Cannot normalize audio: input file '${input}' contains no audio streams.`);
  }

  const isVideo = probe.videoStreams.length > 0;
  const duration = probe.format.durationSeconds;

  let audioFilter = `loudnorm=I=${targetLufs}:TP=${targetPeakDb}:LRA=11`;
  if (voiceClarity) {
    audioFilter = `highpass=f=80,acompressor=threshold=-21dB:ratio=3:attack=15:release=100,${audioFilter}`;
  }

  const args: string[] = ["-i", input, "-af", audioFilter];

  if (isVideo) {
    // Lossless copy for video stream, encode audio to AAC
    args.push("-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart");
  } else {
    const isWav = output.toLowerCase().endsWith(".wav");
    const isMp3 = output.toLowerCase().endsWith(".mp3");
    if (isWav) {
      args.push("-c:a", "pcm_s16le");
    } else if (isMp3) {
      args.push("-c:a", "libmp3lame", "-b:a", "192k");
    } else {
      args.push("-c:a", "aac", "-b:a", "192k");
    }
  }

  args.push("-y", output);

  const res = await runFfmpeg(args, {
    signal: options?.signal,
    onProgress: options?.onProgress,
    expectedDurationSeconds: duration,
  });

  return {
    success: true,
    outputPath: output,
    targetLufs,
    targetPeakDb,
    voiceClarityEnabled: voiceClarity,
    isVideo,
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
  };
}
