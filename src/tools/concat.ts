import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { runFfmpeg, ensureFileExists, ensureOutputDir, FfmpegProgress } from "../utils/exec.js";
import { detectHwAccel } from "../utils/hwaccel.js";
import { verifyMediaOutput, VerifiedMediaOutput } from "../utils/verification.js";
import { probeMedia, ProbeSummary } from "./probe.js";

export const concatMediaSchema = z.object({
  inputPaths: z.array(z.string()).min(2).describe("List of media files to concatenate in sequential order"),
  outputPath: z.string().describe("Target output file path"),
  mode: z
    .enum(["auto", "lossless", "reencode"])
    .optional()
    .default("auto")
    .describe(
      "Concatenation mode. 'auto' (default) probes inputs to check codecs, resolutions, framerates, and audio sample rates, using fast stream copy if matching or falling back to re-encoding if they differ. 'lossless' forces stream copy. 'reencode' forces filtergraph normalization."
    ),
  dryRun: z
    .boolean()
    .optional()
    .describe("Plan-before-encode: returns planned FFmpeg command, parameters, and target output without writing files."),
});

export type ConcatMediaParams = z.infer<typeof concatMediaSchema>;

export interface ConcatMediaResult {
  success: boolean;
  outputPath: string;
  totalInputs: number;
  mode: string;
  strategyUsed: string;
  commandExecuted: string;
  durationSeconds: number;
  dryRun?: boolean;
  verified?: VerifiedMediaOutput;
}

function canUseLosslessConcat(probes: ProbeSummary[]): boolean {
  if (probes.length < 2) return true;
  const first = probes[0];

  for (let i = 1; i < probes.length; i++) {
    const current = probes[i];

    if (first.videoStreams.length !== current.videoStreams.length) return false;
    for (let v = 0; v < first.videoStreams.length; v++) {
      const fv = first.videoStreams[v];
      const cv = current.videoStreams[v];
      if (
        fv.codec !== cv.codec ||
        fv.width !== cv.width ||
        fv.height !== cv.height ||
        fv.fps !== cv.fps ||
        fv.pixelFormat !== cv.pixelFormat
      ) {
        return false;
      }
    }

    if (first.audioStreams.length !== current.audioStreams.length) return false;
    for (let a = 0; a < first.audioStreams.length; a++) {
      const fa = first.audioStreams[a];
      const ca = current.audioStreams[a];
      if (
        fa.codec !== ca.codec ||
        fa.sampleRateHz !== ca.sampleRateHz ||
        fa.channels !== ca.channels
      ) {
        return false;
      }
    }
  }

  return true;
}

export async function concatMedia(
  params: ConcatMediaParams,
  options?: { signal?: AbortSignal; onProgress?: (p: FfmpegProgress) => void }
): Promise<ConcatMediaResult> {
  const { inputPaths, outputPath, mode = "auto", dryRun } = params;

  const resolvedInputs: string[] = [];
  for (const p of inputPaths) {
    resolvedInputs.push(await ensureFileExists(p));
  }
  const output = await ensureOutputDir(outputPath);

  let effectiveMode: "lossless" | "reencode" = mode === "reencode" ? "reencode" : "lossless";
  let probes: ProbeSummary[] | null = null;

  if (mode === "auto") {
    probes = await Promise.all(
      resolvedInputs.map((input) => probeMedia(input, { signal: options?.signal }))
    );
    effectiveMode = canUseLosslessConcat(probes) ? "lossless" : "reencode";
  }

  if (effectiveMode === "reencode") {
    if (!probes) {
      probes = await Promise.all(
        resolvedInputs.map((input) => probeMedia(input, { signal: options?.signal }))
      );
    }
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

    let filterComplex = "";
    if (allVideo) {
      const targetWidth = probes[0].videoStreams[0].width;
      const targetHeight = probes[0].videoStreams[0].height;
      const targetFps = probes[0].videoStreams[0].fps || 30;

      for (let i = 0; i < resolvedInputs.length; i++) {
        const hasAudio = probes[i].audioStreams.length > 0;
        filterComplex += `[${i}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${targetFps}[v${i}];`;
        if (hasAudio) {
          filterComplex += `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${i}];`;
        } else {
          filterComplex += `anullsrc=r=48000:cl=stereo,atrim=duration=${probes[i].format.durationSeconds}[a${i}];`;
        }
      }

      for (let i = 0; i < resolvedInputs.length; i++) {
        filterComplex += `[v${i}][a${i}]`;
      }
      filterComplex += `concat=n=${resolvedInputs.length}:v=1:a=1[outv][outa]`;

      args.push("-filter_complex", filterComplex, "-map", "[outv]", "-map", "[outa]");

      const hwInfo = await detectHwAccel();
      if (hwInfo.isAvailable) {
        args.push("-c:v", hwInfo.h264Encoder, "-b:v", "4M", "-c:a", "aac", "-b:a", "192k");
      } else {
        args.push("-c:v", "libx264", "-crf", "22", "-preset", "fast", "-c:a", "aac", "-b:a", "192k");
      }
    } else {
      for (let i = 0; i < resolvedInputs.length; i++) {
        filterComplex += `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${i}];`;
      }
      for (let i = 0; i < resolvedInputs.length; i++) {
        filterComplex += `[a${i}]`;
      }
      filterComplex += `concat=n=${resolvedInputs.length}:v=0:a=1[outa]`;

      args.push("-filter_complex", filterComplex, "-map", "[outa]");
      args.push("-c:a", "aac", "-b:a", "192k");
    }

    args.push("-y", output);

    const totalEstDuration = probes.reduce(
      (total, probe) => total + probe.format.durationSeconds,
      0
    );

    if (dryRun) {
      return {
        success: true,
        outputPath: output,
        totalInputs: resolvedInputs.length,
        mode: effectiveMode,
        strategyUsed: effectiveMode,
        commandExecuted: `ffmpeg ${args.join(" ")}`,
        durationSeconds: totalEstDuration,
        dryRun: true,
      };
    }

    const result = await runFfmpeg(args, {
      signal: options?.signal,
      onProgress: options?.onProgress,
      expectedDurationSeconds: totalEstDuration,
    });

    const verified = await verifyMediaOutput(output, { signal: options?.signal });

    return {
      success: true,
      outputPath: output,
      totalInputs: resolvedInputs.length,
      mode: effectiveMode,
      strategyUsed: effectiveMode,
      commandExecuted: result.command,
      durationSeconds: result.durationSeconds,
      verified,
    };
  }

  const tmpManifest = path.join(os.tmpdir(), `mcp_concat_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
  const manifestContent = resolvedInputs
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");

  if (dryRun) {
    return {
      success: true,
      outputPath: output,
      totalInputs: resolvedInputs.length,
      mode: effectiveMode,
      strategyUsed: "lossless (demuxer concat)",
      commandExecuted: `ffmpeg -f concat -safe 0 -i <manifest: ${resolvedInputs.length} files> -c copy -y ${output}`,
      durationSeconds: 0,
      dryRun: true,
    };
  }

  fs.writeFileSync(tmpManifest, manifestContent, "utf8");

  try {
    const args: string[] = ["-f", "concat", "-safe", "0", "-i", tmpManifest];
    args.push("-c", "copy", "-y", output);

    const result = await runFfmpeg(args, {
      signal: options?.signal,
      onProgress: options?.onProgress,
    });

    const verified = await verifyMediaOutput(output, { signal: options?.signal });

    return {
      success: true,
      outputPath: output,
      totalInputs: resolvedInputs.length,
      mode: effectiveMode,
      strategyUsed: effectiveMode,
      commandExecuted: result.command,
      durationSeconds: result.durationSeconds,
      verified,
    };
  } finally {
    if (fs.existsSync(tmpManifest)) {
      try { fs.unlinkSync(tmpManifest); } catch {}
    }
  }
}
