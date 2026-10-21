import { z } from "zod";
import { runFfmpeg, ensureFileExists, ensureOutputDir } from "../utils/exec.js";

export const changeSpeedSchema = z.object({
  inputPath: z.string().describe("Path to the source video or audio file"),
  outputPath: z.string().describe("Target output file path"),
  speed: z.number().positive().min(0.1).max(50.0).describe("Playback speed multiplier (e.g., 2.0 for 2x fast-forward/timelapse, 0.5 for slow-motion)"),
  muteAudio: z.boolean().optional().default(false).describe("Whether to strip audio track completely"),
});

export type ChangeSpeedParams = z.infer<typeof changeSpeedSchema>;

function getAtempoFilter(speed: number): string {
  const filters: string[] = [];
  let s = speed;
  while (s > 2.0) {
    filters.push("atempo=2.0");
    s /= 2.0;
  }
  while (s < 0.5) {
    filters.push("atempo=0.5");
    s /= 0.5;
  }
  filters.push(`atempo=${s.toFixed(4)}`);
  return filters.join(",");
}

export async function changeSpeed(params: ChangeSpeedParams) {
  const { inputPath, outputPath, speed, muteAudio = false } = params;
  const input = await ensureFileExists(inputPath);
  const output = await ensureOutputDir(outputPath);

  const videoFilter = `setpts=${(1 / speed).toFixed(6)}*PTS`;
  const args: string[] = ["-i", input, "-filter:v", videoFilter];

  if (muteAudio) {
    args.push("-an");
  } else {
    const audioFilter = getAtempoFilter(speed);
    args.push("-filter:a", audioFilter);
  }

  args.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-y", output
  );

  const result = await runFfmpeg(args);

  return {
    success: true,
    outputPath: output,
    speedMultiplier: speed,
    audioMuted: muteAudio,
    commandExecuted: result.command,
    durationSeconds: result.durationSeconds,
  };
}
