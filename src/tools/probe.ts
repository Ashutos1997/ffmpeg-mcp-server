import { ensureFileExists, runCommand } from "../utils/exec.js";

export interface ProbeSummary {
  filePath: string;
  format: {
    formatName: string;
    durationSeconds: number;
    sizeBytes: number;
    sizeFormatted: string;
    bitrateKbps: number;
  };
  videoStreams: Array<{
    codec: string;
    resolution: string;
    width: number;
    height: number;
    fps: string;
    pixelFormat: string;
    aspectRatio?: string;
  }>;
  audioStreams: Array<{
    codec: string;
    sampleRateHz: number;
    channels: number;
    channelLayout?: string;
    bitrateKbps?: number;
  }>;
  subtitleStreams: Array<{
    codec: string;
    language?: string;
  }>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function probeMedia(inputPath: string): Promise<ProbeSummary> {
  const resolvedPath = await ensureFileExists(inputPath);

  const args = [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    resolvedPath,
  ];

  const { stdout } = await runCommand("ffprobe", args);
  const data = JSON.parse(stdout);

  const format = data.format || {};
  const streams: any[] = data.streams || [];

  const size = Number(format.size) || 0;
  const duration = Number(format.duration) || 0;
  const bitRate = Number(format.bit_rate) || 0;

  const videoStreams = streams
    .filter((s) => s.codec_type === "video")
    .map((s) => ({
      codec: s.codec_name,
      resolution: `${s.width}x${s.height}`,
      width: s.width,
      height: s.height,
      fps: s.avg_frame_rate || s.r_frame_rate || "unknown",
      pixelFormat: s.pix_fmt,
      aspectRatio: s.display_aspect_ratio,
    }));

  const audioStreams = streams
    .filter((s) => s.codec_type === "audio")
    .map((s) => ({
      codec: s.codec_name,
      sampleRateHz: Number(s.sample_rate) || 0,
      channels: Number(s.channels) || 0,
      channelLayout: s.channel_layout,
      bitrateKbps: s.bit_rate ? Math.round(Number(s.bit_rate) / 1000) : undefined,
    }));

  const subtitleStreams = streams
    .filter((s) => s.codec_type === "subtitle")
    .map((s) => ({
      codec: s.codec_name,
      language: s.tags?.language,
    }));

  return {
    filePath: resolvedPath,
    format: {
      formatName: format.format_name || "unknown",
      durationSeconds: Math.round(duration * 100) / 100,
      sizeBytes: size,
      sizeFormatted: formatBytes(size),
      bitrateKbps: Math.round(bitRate / 1000),
    },
    videoStreams,
    audioStreams,
    subtitleStreams,
  };
}
