import { ensureFileExists, ensureOutputDir, runCommand } from "../utils/exec.js";

export interface TrimOptions {
  inputPath: string;
  outputPath: string;
  startTime: string; // e.g. "00:01:30" or "90" (seconds)
  endTime?: string;  // e.g. "00:02:00" or "120"
  duration?: string; // e.g. "30" (seconds)
  accurateReencode?: boolean; // If false (default), uses fast lossless stream copy (-c copy)
}

export async function trimMedia(options: TrimOptions): Promise<{
  outputPath: string;
  commandExecuted: string;
}> {
  const input = await ensureFileExists(options.inputPath);
  const output = await ensureOutputDir(options.outputPath);

  const args: string[] = ["-y"];

  // Fast seek before -i
  args.push("-ss", options.startTime);
  args.push("-i", input);

  if (options.endTime) {
    args.push("-to", options.endTime);
  } else if (options.duration) {
    args.push("-t", options.duration);
  }

  if (options.accurateReencode) {
    // Re-encode for frame-accurate cut
    args.push("-c:v", "libx264", "-c:a", "aac");
  } else {
    // Lossless instantaneous stream copy
    args.push("-c", "copy");
  }

  args.push(output);

  await runCommand("ffmpeg", args);

  return {
    outputPath: output,
    commandExecuted: `ffmpeg ${args.join(" ")}`,
  };
}
