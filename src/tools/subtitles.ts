import { z } from "zod";
import { runFfmpeg, ensureFileExists, ensureOutputDir, FfmpegProgress } from "../utils/exec.js";

export const addSubtitlesSchema = z.object({
  videoPath: z.string().describe("Path to the source video file"),
  subtitlesPath: z.string().describe("Path to subtitle file (.srt or .vtt)"),
  outputPath: z.string().describe("Target output video path (.mp4, .mkv, or .mov)"),
  language: z.string().optional().default("eng").describe("ISO 639-2 three-letter language code (e.g. 'eng', 'spa', 'fra', 'deu')"),
  title: z.string().optional().default("English").describe("Subtitle track label displayed in video players"),
});

export type AddSubtitlesParams = z.infer<typeof addSubtitlesSchema>;

export async function addSubtitles(
  params: AddSubtitlesParams,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
) {
  const { videoPath, subtitlesPath, outputPath, language = "eng", title = "English" } = params;

  const video = await ensureFileExists(videoPath);
  const subs = await ensureFileExists(subtitlesPath);
  const output = await ensureOutputDir(outputPath);

  const isMp4 = output.toLowerCase().endsWith(".mp4") || output.toLowerCase().endsWith(".mov");
  const subtitleCodec = isMp4 ? "mov_text" : "srt";

  const args: string[] = [
    "-i", video,
    "-i", subs,
    "-c:v", "copy",
    "-c:a", "copy",
    "-c:s", subtitleCodec,
    "-metadata:s:s:0", `language=${language}`,
    "-metadata:s:s:0", `title=${title}`,
    "-y", output
  ];

  const result = await runFfmpeg(args, {
    signal: options?.signal,
    onProgress: options?.onProgress,
  });

  return {
    success: true,
    outputPath: output,
    subtitlesApplied: subs,
    subtitleCodec,
    commandExecuted: result.command,
    durationSeconds: result.durationSeconds,
  };
}
