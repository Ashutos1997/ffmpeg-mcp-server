import { ensureFileExists, ensureOutputDir, runCommand } from "../utils/exec.js";

export interface ExtractAudioOptions {
  inputPath: string;
  outputPath: string;
  format?: "whisper_wav" | "mp3" | "aac" | "flac" | "copy";
  bitrate?: string; // e.g. "192k", "320k"
}

export async function extractAudio(options: ExtractAudioOptions): Promise<{
  outputPath: string;
  commandExecuted: string;
}> {
  const input = await ensureFileExists(options.inputPath);
  const output = await ensureOutputDir(options.outputPath);

  const format = options.format || "mp3";
  const args: string[] = ["-y", "-i", input, "-vn"]; // -vn drops the video track

  switch (format) {
    case "whisper_wav":
      // Optimal 16kHz mono PCM for Whisper and AI speech-to-text
      args.push("-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le");
      break;

    case "mp3":
      args.push("-c:a", "libmp3lame", "-b:a", options.bitrate || "192k");
      break;

    case "aac":
      args.push("-c:a", "aac", "-b:a", options.bitrate || "192k");
      break;

    case "flac":
      args.push("-c:a", "flac");
      break;

    case "copy":
      args.push("-c:a", "copy");
      break;
  }

  args.push(output);

  await runCommand("ffmpeg", args);

  return {
    outputPath: output,
    commandExecuted: `ffmpeg ${args.join(" ")}`,
  };
}
