import { ensureFileExists, ensureOutputDir, runCommand } from "../utils/exec.js";

export interface ConvertOptions {
  inputPath: string;
  outputPath: string;
  preset?: "web_mp4" | "webm" | "gif" | "auto";
  crf?: number; // Quality: 18-28 (lower is higher quality, default ~23)
  resolution?: string; // e.g. "1920x1080", "1280x720", "854x480"
  fps?: number;
}

export async function convertMedia(options: ConvertOptions): Promise<{
  outputPath: string;
  commandExecuted: string;
}> {
  const input = await ensureFileExists(options.inputPath);
  const output = await ensureOutputDir(options.outputPath);

  const preset = options.preset || "auto";
  const args: string[] = ["-y", "-i", input];

  if (preset === "gif") {
    // Generate a high quality palette-based GIF
    const scale = options.resolution
      ? `scale=${options.resolution.replace("x", ":")}:flags=lanczos`
      : "scale=iw:ih:flags=lanczos";
    const fps = options.fps ? `fps=${options.fps},` : "fps=15,";
    const filter = `${fps}${scale},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;

    args.push("-vf", filter, output);
  } else if (preset === "web_mp4" || (preset === "auto" && output.endsWith(".mp4"))) {
    // Universal web-safe H.264 + AAC
    args.push("-c:v", "libx264");
    args.push("-pix_fmt", "yuv420p");
    args.push("-crf", String(options.crf ?? 23));
    args.push("-preset", "medium");
    args.push("-c:a", "aac");
    args.push("-b:a", "192k");
    args.push("-movflags", "+faststart"); // Web streaming optimization

    if (options.resolution) {
      args.push("-vf", `scale=${options.resolution.replace("x", ":")}`);
    }
    if (options.fps) {
      args.push("-r", String(options.fps));
    }
    args.push(output);
  } else if (preset === "webm" || (preset === "auto" && output.endsWith(".webm"))) {
    // VP9 + Opus for modern open web
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
    // Default pass-through or automatic ffmpeg container translation
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
  };
}
