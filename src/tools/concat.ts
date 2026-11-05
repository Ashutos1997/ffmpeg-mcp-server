import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { runFfmpeg, ensureFileExists, ensureOutputDir, FfmpegProgress } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";
import { probeMedia } from "./probe.js";

export const concatMediaSchema = z.object({
  inputPaths: z.array(z.string()).min(2).describe("List of media files to concatenate in sequential order"),
  outputPath: z.string().describe("Target output file path"),
  mode: z.enum(["lossless", "reencode"]).optional().default("lossless").describe("Concatenation mode. 'lossless' uses stream copy without quality loss (inputs must share codecs). 'reencode' normalizes differing resolutions/codecs."),
});

export type ConcatMediaParams = z.infer<typeof concatMediaSchema>;

export async function concatMedia(
  params: ConcatMediaParams,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
) {
  const { inputPaths, outputPath, mode = "lossless" } = params;

  const resolvedInputs: string[] = [];
  for (const p of inputPaths) {
    resolvedInputs.push(await ensureFileExists(p));
  }
  const output = await ensureOutputDir(outputPath);

  if (mode === "reencode") {
    const probes = await Promise.all(
      resolvedInputs.map((input) => probeMedia(input, { signal: options?.signal }))
    );
    const allVideo = probes.every((probe) => probe.videoStreams.length > 0);
    const allAudioOnly = probes.every(
      (probe) => probe.videoStreams.length === 0 && probe.audioStreams.length > 0
    );

    if (!allVideo && !allAudioOnly) {
      throw new Error("Reencode mode requires either all video inputs or all audio-only inputs");
    }

    const args: string[] = [];
    for (const input of resolvedInputs) {
      args.push("-i", input);
    }

    const filters: string[] = [];
    const concatInputs: string[] = [];
    const hasAnyAudio = probes.some((probe) => probe.audioStreams.length > 0);

    if (allVideo) {
      const firstVideo = probes[0].videoStreams[0];
      const width = Math.max(2, Math.floor(firstVideo.width / 2) * 2);
      const height = Math.max(2, Math.floor(firstVideo.height / 2) * 2);

      probes.forEach((probe, index) => {
        filters.push(
          `[${index}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v${index}]`
        );
        concatInputs.push(`[v${index}]`);

        if (hasAnyAudio) {
          if (probe.audioStreams.length > 0) {
            filters.push(
              `[${index}:a:0]aformat=sample_rates=48000:channel_layouts=stereo,` +
              `aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS[a${index}]`
            );
          } else {
            const duration = Math.max(0.001, probe.format.durationSeconds);
            filters.push(
              `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${duration},` +
              `asetpts=PTS-STARTPTS[a${index}]`
            );
          }
          concatInputs.push(`[a${index}]`);
        }
      });

      filters.push(
        `${concatInputs.join("")}concat=n=${resolvedInputs.length}:v=1:a=${hasAnyAudio ? 1 : 0}` +
        `[outv]${hasAnyAudio ? "[outa]" : ""}`
      );
      args.push("-filter_complex", filters.join(";"), "-map", "[outv]");
      if (hasAnyAudio) args.push("-map", "[outa]");

      const hwInfo = await detectHwAccel();
      if (hwInfo.isAvailable) {
        args.push("-c:v", hwInfo.h264Encoder, "-b:v", "4M");
      } else {
        args.push("-c:v", "libx264", "-crf", "22", "-preset", "fast");
      }
      args.push("-pix_fmt", "yuv420p");
      if (hasAnyAudio) args.push("-c:a", "aac", "-b:a", "192k");
    } else {
      probes.forEach((_probe, index) => {
        filters.push(
          `[${index}:a:0]aformat=sample_rates=48000:channel_layouts=stereo,` +
          `aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS[a${index}]`
        );
        concatInputs.push(`[a${index}]`);
      });
      filters.push(`${concatInputs.join("")}concat=n=${resolvedInputs.length}:v=0:a=1[outa]`);
      args.push(
        "-filter_complex", filters.join(";"),
        "-map", "[outa]",
        "-c:a", "aac",
        "-b:a", "192k"
      );
    }

    args.push("-movflags", "+faststart", "-y", output);
    const result = await runFfmpeg(args, {
      signal: options?.signal,
      onProgress: options?.onProgress,
      expectedDurationSeconds: probes.reduce(
        (total, probe) => total + probe.format.durationSeconds,
        0
      ),
    });

    return {
      success: true,
      outputPath: output,
      totalInputs: resolvedInputs.length,
      mode,
      commandExecuted: result.command,
      durationSeconds: result.durationSeconds,
    };
  }

  const tmpManifest = path.join(os.tmpdir(), `mcp_concat_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
  const manifestContent = resolvedInputs
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");

  fs.writeFileSync(tmpManifest, manifestContent, "utf8");

  try {
    const args: string[] = ["-f", "concat", "-safe", "0", "-i", tmpManifest];

    args.push("-c", "copy");

    args.push("-y", output);

    const result = await runFfmpeg(args, {
      signal: options?.signal,
      onProgress: options?.onProgress,
    });

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
