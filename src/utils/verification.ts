import fs from "node:fs/promises";
import { probeMedia } from "../tools/probe.js";

export interface VerifiedMediaOutput {
  verified: boolean;
  outputPath: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  durationSeconds: number;
  formatName: string;
  video?: {
    codec: string;
    width: number;
    height: number;
    resolution: string;
    fps: string;
    pixelFormat: string;
  };
  audio?: {
    codec: string;
    sampleRateHz: number;
    channels: number;
    bitrateKbps?: number;
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Automatically probes a generated output file to verify its properties
 * (duration, size, codecs, resolution) so calling AI agents receive confirmed results.
 */
export async function verifyMediaOutput(
  outputPath: string,
  options?: { signal?: AbortSignal }
): Promise<VerifiedMediaOutput> {
  const stat = await fs.stat(outputPath);
  const probe = await probeMedia(outputPath, { signal: options?.signal });

  let video: VerifiedMediaOutput["video"];
  if (probe.videoStreams.length > 0) {
    const v = probe.videoStreams[0];
    video = {
      codec: v.codec,
      width: v.width,
      height: v.height,
      resolution: `${v.width}x${v.height}`,
      fps: v.fps,
      pixelFormat: v.pixelFormat,
    };
  }

  let audio: VerifiedMediaOutput["audio"];
  if (probe.audioStreams.length > 0) {
    const a = probe.audioStreams[0];
    audio = {
      codec: a.codec,
      sampleRateHz: a.sampleRateHz,
      channels: a.channels,
      bitrateKbps: a.bitrateKbps,
    };
  }

  return {
    verified: true,
    outputPath,
    fileSizeBytes: stat.size,
    fileSizeFormatted: formatFileSize(stat.size),
    durationSeconds: probe.format.durationSeconds,
    formatName: probe.format.formatName,
    video,
    audio,
  };
}
