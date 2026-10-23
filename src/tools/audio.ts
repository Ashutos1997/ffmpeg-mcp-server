import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg, FfmpegProgress } from "../utils/exec.js";

export const extractAudioSchema = z.object({
  inputPath: z.string().describe("Path to the source video or audio file."),
  outputPath: z.string().describe("Destination path for the output audio file (e.g. './extracted.wav' or './audio.mp3')."),
  format: z
    .enum(["whisper_wav", "mp3", "aac", "flac", "copy"])
    .optional()
    .describe("Audio format: 'whisper_wav' (16kHz mono WAV for Whisper), 'mp3', 'aac', 'flac', or 'copy' (extract without re-encoding). Default: 'mp3'."),
  bitrate: z.string().optional().describe("Target audio bitrate for MP3 or AAC (e.g. '128k', '192k', '320k')."),
});

export type ExtractAudioParams = z.infer<typeof extractAudioSchema>;

export async function extractAudio(
  params: ExtractAudioParams,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
): Promise<{
  outputPath: string;
  format: string;
  commandExecuted: string;
  durationSeconds: number;
}> {
  const input = await ensureFileExists(params.inputPath);
  const output = await ensureOutputDir(params.outputPath);

  const format = params.format || "mp3";
  const args: string[] = ["-y", "-i", input, "-vn"]; // -vn drops the video track

  switch (format) {
    case "whisper_wav":
      // Optimal 16kHz mono PCM for Whisper and AI speech-to-text
      args.push("-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le");
      break;

    case "mp3":
      args.push("-c:a", "libmp3lame", "-b:a", params.bitrate || "192k");
      break;

    case "aac":
      args.push("-c:a", "aac", "-b:a", params.bitrate || "192k");
      break;

    case "flac":
      args.push("-c:a", "flac");
      break;

    case "copy":
      args.push("-c:a", "copy");
      break;
  }

  args.push(output);

  const res = await runFfmpeg(args, {
    signal: options?.signal,
    onProgress: options?.onProgress,
  });

  return {
    outputPath: output,
    format,
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
  };
}
