import { z } from "zod";
import { ensureFileExists, ensureOutputDir, runFfmpeg } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";
import { probeMedia } from "./probe.js";

export const splitScreenSchema = z.object({
  firstVideoPath: z.string().describe("Path to the top video (vertical layout) or left video (horizontal layout)."),
  secondVideoPath: z.string().describe("Path to the bottom video (vertical layout) or right video (horizontal layout)."),
  outputPath: z.string().describe("Destination path for the split-screen output file (e.g. './reel.mp4')."),
  layout: z
    .enum(["vertical_9_16", "horizontal_16_9", "square_1_1"])
    .default("vertical_9_16")
    .describe("Split layout: 'vertical_9_16' (1080x1920 stacked top/bottom for Reels and TikTok), 'horizontal_16_9' (1920x1080 side-by-side), or 'square_1_1' (1080x1080 stacked). Default: 'vertical_9_16'."),
  audioSource: z
    .enum(["mix", "first", "second", "mute"])
    .default("mix")
    .describe("Audio track selection: 'mix' (blends audio from both videos), 'first' (uses only top/left audio), 'second' (uses only bottom/right audio), or 'mute'. Default: 'mix'."),
  subtitlesPath: z
    .string()
    .optional()
    .describe("Optional path to an .srt or .vtt subtitle file to embed into the output video."),
  hardwareAcceleration: z
    .boolean()
    .optional()
    .describe("Use Apple Silicon VideoToolbox encoding when available. Default: true."),
});

export type SplitScreenParams = z.infer<typeof splitScreenSchema>;

export async function createSplitScreen(params: SplitScreenParams) {
  const {
    firstVideoPath,
    secondVideoPath,
    outputPath,
    layout = "vertical_9_16",
    audioSource = "mix",
    subtitlesPath,
    hardwareAcceleration = true,
  } = params;

  const firstInput = await ensureFileExists(firstVideoPath);
  const secondInput = await ensureFileExists(secondVideoPath);
  const output = await ensureOutputDir(outputPath);

  let subInput: string | undefined;
  if (subtitlesPath) {
    subInput = await ensureFileExists(subtitlesPath);
  }

  const [firstProbe, secondProbe] = await Promise.all([
    probeMedia(firstInput),
    probeMedia(secondInput),
  ]);

  const firstHasAudio = firstProbe.audioStreams.length > 0;
  const secondHasAudio = secondProbe.audioStreams.length > 0;

  const hwInfo = await detectHwAccel();
  const useHw = hardwareAcceleration && hwInfo.isAvailable;
  const videoEncoder = useHw ? hwInfo.h264Encoder : "libx264";

  // Compute dimensions per tile
  let filter = "";
  let totalResolution = "1080x1920";

  if (layout === "vertical_9_16") {
    // 1080x1920 total -> each tile is 1080x960
    totalResolution = "1080x1920";
    filter = "[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[v0];[1:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[v1];[v0][v1]vstack=inputs=2[outv]";
  } else if (layout === "horizontal_16_9") {
    // 1920x1080 total -> each tile is 960x1080
    totalResolution = "1920x1080";
    filter = "[0:v]scale=960:1080:force_original_aspect_ratio=increase,crop=960:1080,setsar=1[v0];[1:v]scale=960:1080:force_original_aspect_ratio=increase,crop=960:1080,setsar=1[v1];[v0][v1]hstack=inputs=2[outv]";
  } else {
    // square_1_1 -> 1080x1080 total -> each tile is 1080x540
    totalResolution = "1080x1080";
    filter = "[0:v]scale=1080:540:force_original_aspect_ratio=increase,crop=1080:540,setsar=1[v0];[1:v]scale=1080:540:force_original_aspect_ratio=increase,crop=1080:540,setsar=1[v1];[v0][v1]vstack=inputs=2[outv]";
  }

  const args: string[] = ["-i", firstInput, "-i", secondInput];

  let hasSubtitles = false;
  if (subInput) {
    args.push("-i", subInput);
    hasSubtitles = true;
  }

  // Audio filter handling
  let audioMapped = false;
  if (audioSource === "mix" && firstHasAudio && secondHasAudio) {
    filter += ";[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[outa]";
    args.push("-filter_complex", filter, "-map", "[outv]", "-map", "[outa]");
    audioMapped = true;
  } else {
    args.push("-filter_complex", filter, "-map", "[outv]");

    if (audioSource === "first" && firstHasAudio) {
      args.push("-map", "0:a:0");
      audioMapped = true;
    } else if (audioSource === "second" && secondHasAudio) {
      args.push("-map", "1:a:0");
      audioMapped = true;
    } else if (audioSource === "mix") {
      if (firstHasAudio) {
        args.push("-map", "0:a:0");
        audioMapped = true;
      } else if (secondHasAudio) {
        args.push("-map", "1:a:0");
        audioMapped = true;
      }
    }
  }

  if (hasSubtitles) {
    args.push("-map", "2:s");
    const isMp4 = output.endsWith(".mp4") || output.endsWith(".mov");
    args.push("-c:s", isMp4 ? "mov_text" : "srt");
  }

  args.push("-c:v", videoEncoder);
  if (videoEncoder === "h264_videotoolbox") {
    args.push("-b:v", "4M", "-pix_fmt", "yuv420p");
  } else {
    args.push("-crf", "22", "-preset", "fast", "-pix_fmt", "yuv420p");
  }

  if (audioMapped) {
    args.push("-c:a", "aac", "-b:a", "192k");
  }

  args.push("-movflags", "+faststart", "-y", output);

  const res = await runFfmpeg(args);

  return {
    success: true,
    outputPath: output,
    layout,
    resolution: totalResolution,
    audioSource,
    subtitlesEmbedded: hasSubtitles,
    encoderUsed: videoEncoder,
    hardwareAccelerated: videoEncoder.includes("videotoolbox"),
    commandExecuted: res.command,
    durationSeconds: res.durationSeconds,
  };
}
