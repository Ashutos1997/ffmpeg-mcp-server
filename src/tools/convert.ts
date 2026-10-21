import { ensureFileExists, ensureOutputDir, runCommand } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";

export interface ConvertOptions {
  inputPath: string;
  outputPath: string;
  preset?: "web_mp4" | "webm" | "gif" | "auto";
  crf?: number; // Quality: 18-28 (lower is higher quality, default 23)
  resolution?: string; // e.g. "1920x1080", "1280x720"
  fps?: number;
  hardwareAcceleration?: boolean;
}

export async function convertMedia(options: ConvertOptions): Promise<{
  outputPath: string;
  commandExecuted: string;
  hardwareAccelerated: boolean;
}> {
  const input = await ensureFileExists(options.inputPath);
  const output = await ensureOutputDir(options.outputPath);

  const hwInfo = await detectHwAccel();
  const useHw = options.hardwareAcceleration ?? hwInfo.isAvailable;

  const preset = options.preset || "auto";
  const args: string[] = ["-y", "-i", input];
  let isHwUsed = false;

  if (preset === "gif") {
    const scale = options.resolution
      ? `scale=${options.resolution.replace("x", ":")}:flags=lanczos`
      : "scale=iw:ih:flags=lanczos";
    const fps = options.fps ? `fps=${options.fps},` : "fps=15,";
    const filter = `${fps}${scale},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;

    args.push("-vf", filter, output);
  } else if (preset === "web_mp4" || (preset === "auto" && output.endsWith(".mp4"))) {
    if (useHw && hwInfo.isAvailable) {
      args.push("-c:v", hwInfo.h264Encoder);
      args.push("-b:v", "4M");
      isHwUsed = true;
    } else {
      args.push("-c:v", "libx264");
      args.push("-crf", String(options.crf ?? 23));
      args.push("-preset", "medium");
    }
    args.push("-pix_fmt", "yuv420p");
    args.push("-c:a", "aac");
    args.push("-b:a", "192k");
    args.push("-movflags", "+faststart");

    if (options.resolution) {
      args.push("-vf", `scale=${options.resolution.replace("x", ":")}`);
    }
    if (options.fps) {
      args.push("-r", String(options.fps));
    }
    args.push(output);
  } else if (preset === "webm" || (preset === "auto" && output.endsWith(".webm"))) {
    args.push("-c:v", "libvpx-vp9");
    args.push("-crf", String(options.crf ?? 30));
    args.push("-b:v", "0");
    args.push("-c:a", "libopus");
    args.push("-b:a", "128k");

    if (options.resolution) {
      args.push("-vf", `scale=${options.resolution.replace("x", ":")}`);
    }
    args.push(output);
  } else {
    if (options.crf) {
      args.push("-crf", String(options.crf));
    }
    if (options.resolution) {
      args.push("-vf", `scale=${options.resolution.replace("x", ":")}`);
    }
    args.push(output);
  }

  await runCommand("ffmpeg", args);

  return {
    outputPath: output,
    commandExecuted: `ffmpeg ${args.join(" ")}`,
    hardwareAccelerated: isHwUsed,
  };
}
