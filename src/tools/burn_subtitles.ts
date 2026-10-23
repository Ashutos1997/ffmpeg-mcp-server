import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg, FfmpegProgress } from "../utils/exec.js";
import { detectHwAccel, hasFilter } from "../utils/hwaccel.js";
import { probeMedia } from "./probe.js";

export const burnSubtitlesSchema = z.object({
  videoPath: z.string().describe("Path to the source video file."),
  subtitlesPath: z.string().describe("Path to the subtitle file (.srt, .vtt, or .ass) to burn into the video."),
  outputPath: z.string().describe("Target output video path (.mp4, .mov, or .mkv)."),
  fontSize: z.number().int().min(8).max(120).optional().default(24).describe("Subtitle font size in points. Default: 24."),
  fontColor: z
    .string()
    .optional()
    .default("white")
    .describe("Primary subtitle text color: 'white', 'yellow', 'cyan', or ASS hex e.g. '&H00FFFFFF'. Default: 'white'."),
  outlineColor: z
    .string()
    .optional()
    .default("black")
    .describe("Subtitle border/outline color: 'black', 'white', or ASS hex. Default: 'black'."),
  outlineWidth: z.number().int().min(0).max(10).optional().default(2).describe("Outline thickness in pixels. Default: 2."),
  marginV: z.number().int().min(0).max(500).optional().default(35).describe("Vertical margin distance in pixels from the bottom edge. Default: 35."),
  hardwareAcceleration: z
    .boolean()
    .optional()
    .default(true)
    .describe("Use hardware-accelerated video encoding when available. Default: true."),
});

export type BurnSubtitlesParams = z.infer<typeof burnSubtitlesSchema>;

function toAssColor(color: string): string {
  const c = color.toLowerCase().trim();
  if (c.startsWith("&h")) return color;
  const map: Record<string, string> = {
    white: "&H00FFFFFF",
    black: "&H00000000",
    yellow: "&H0000FFFF",
    cyan: "&H00FFFF00",
    red: "&H000000FF",
    green: "&H0000FF00",
    blue: "&H00FF0000",
  };
  return map[c] || "&H00FFFFFF";
}

export async function burnSubtitles(
  params: BurnSubtitlesParams,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
) {
  const {
    videoPath,
    subtitlesPath,
    outputPath,
    fontSize = 24,
    fontColor = "white",
    outlineColor = "black",
    outlineWidth = 2,
    marginV = 35,
    hardwareAcceleration = true,
  } = params;

  const video = await ensureFileExists(videoPath);
  const subs = await ensureFileExists(subtitlesPath);
  const output = await ensureOutputDir(outputPath);

  const filterAvailable = await hasFilter("subtitles");
  if (!filterAvailable) {
    throw new Error(
      "FFmpeg installation is missing the 'subtitles' filter (requires FFmpeg compiled with --enable-libass). To hardcode subtitles, please install an FFmpeg build with libass. Alternatively, use 'add_subtitles' to embed soft subtitle tracks into MP4/MKV without re-encoding."
    );
  }

  const probe = await probeMedia(video, { signal: options?.signal });
  const duration = probe.format.durationSeconds;

  const hwInfo = await detectHwAccel();
  const useHw = hardwareAcceleration && hwInfo.isAvailable;
  const isHwUsed = useHw;
  const videoEncoder = isHwUsed ? hwInfo.h264Encoder : "libx264";

  // Escape special characters in path for FFmpeg filter syntax
  const escapedSubPath = subs.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const primaryAssColor = toAssColor(fontColor);
  const outlineAssColor = toAssColor(outlineColor);

  const style = `FontSize=${fontSize},PrimaryColour=${primaryAssColor},OutlineColour=${outlineAssColor},Outline=${outlineWidth},MarginV=${marginV},Alignment=2`;
  const filter = `subtitles=filename='${escapedSubPath}':force_style='${style}'`;

  const args: string[] = [
    "-i", video,
    "-vf", filter,
    "-c:v", videoEncoder,
  ];

  if (isHwUsed) {
    args.push("-b:v", "4M", "-pix_fmt", "yuv420p");
  } else {
    args.push("-crf", "22", "-preset", "fast", "-pix_fmt", "yuv420p");
  }

  args.push("-c:a", "copy", "-movflags", "+faststart", "-y", output);

  const res = await runFfmpeg(args, {
    signal: options?.signal,
    onProgress: options?.onProgress,
    expectedDurationSeconds: duration,
  });

  return {
    success: true,
    outputPath: output,
    subtitlesBurned: subs,
    fontSize,
    fontColor,
    encoderUsed: videoEncoder,
    hardwareAccelerated: isHwUsed,
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
  };
}
