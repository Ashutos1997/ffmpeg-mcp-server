import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { runFfmpeg, ensureFileExists, ensureOutputDir } from "../utils/exec.js";

export const concatMediaSchema = z.object({
  inputPaths: z.array(z.string()).min(2).describe("List of media files to concatenate in sequential order"),
  outputPath: z.string().describe("Target output file path"),
  mode: z.enum(["lossless", "reencode"]).optional().default("lossless").describe("Concatenation mode. 'lossless' uses stream copy without quality loss (inputs must share codecs). 'reencode' normalizes differing resolutions/codecs."),
});

export type ConcatMediaParams = z.infer<typeof concatMediaSchema>;

export async function concatMedia(params: ConcatMediaParams) {
  const { inputPaths, outputPath, mode = "lossless" } = params;

  const resolvedInputs: string[] = [];
  for (const p of inputPaths) {
    resolvedInputs.push(await ensureFileExists(p));
  }
  const output = await ensureOutputDir(outputPath);

  const tmpManifest = path.join(os.tmpdir(), `mcp_concat_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
  const manifestContent = resolvedInputs
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");

  fs.writeFileSync(tmpManifest, manifestContent, "utf8");

  try {
    const args: string[] = ["-f", "concat", "-safe", "0", "-i", tmpManifest];

    if (mode === "lossless") {
      args.push("-c", "copy");
    } else {
      args.push(
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart"
      );
    }

    args.push("-y", output);

    const result = await runFfmpeg(args);

    return {
      success: true,
      outputPath: output,
      totalInputs: resolvedInputs.length,
      mode,
      commandExecuted: result.command,
      durationSeconds: result.durationSeconds,
    };
  } finally {
    if (fs.existsSync(tmpManifest)) {
      try { fs.unlinkSync(tmpManifest); } catch {}
    }
  }
}
