import os from "node:os";
import { z } from "zod";
import { runCommand } from "../utils/exec.js";
import { detectHwAccel, hasFilter, HwAccelInfo } from "../utils/hwaccel.js";

export const ffmpegDoctorSchema = z.object({
  checkFilters: z.boolean().optional().default(true).describe("Check availability of specialized filters (libass, loudnorm, boxblur, etc.)"),
});

export type FfmpegDoctorParams = z.infer<typeof ffmpegDoctorSchema>;

export interface DoctorReport {
  healthy: boolean;
  system: {
    platform: string;
    arch: string;
    cpus: number;
    totalMemoryGB: number;
  };
  binaries: {
    ffmpeg: {
      found: boolean;
      version?: string;
      error?: string;
    };
    ffprobe: {
      found: boolean;
      version?: string;
      error?: string;
    };
  };
  hardwareAcceleration: {
    available: boolean;
    activeType: string;
    detectedTypes: string[];
    h264Encoder: string;
    hevcEncoder: string;
  };
  codecs: {
    h264: boolean;
    hevc: boolean;
    vp9: boolean;
    mp3: boolean;
    aac: boolean;
    flac: boolean;
  };
  criticalFilters: {
    subtitlesLibass: boolean;
    loudnorm: boolean;
    silencedetect: boolean;
    boxblur: boolean;
    showwavespic: boolean;
  };
  recommendations: string[];
}

export async function runFfmpegDoctor(
  params?: FfmpegDoctorParams,
  options?: { signal?: AbortSignal }
): Promise<DoctorReport> {
  const recommendations: string[] = [];
  const systemInfo = {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemoryGB: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
  };

  // 1. Inspect ffmpeg
  let ffmpegFound = false;
  let ffmpegVersion: string | undefined;
  let ffmpegError: string | undefined;
  try {
    const res = await runCommand("ffmpeg", ["-version"], { signal: options?.signal });
    ffmpegFound = true;
    const match = res.stdout.match(/ffmpeg version ([^\s]+)/i);
    ffmpegVersion = match ? match[1] : res.stdout.split("\n")[0];
  } catch (err: any) {
    ffmpegFound = false;
    ffmpegError = err.message || "Failed to execute ffmpeg binary";
    recommendations.push("FFmpeg binary not found in system PATH. Install FFmpeg via 'brew install ffmpeg' (macOS), 'apt install ffmpeg' (Linux), or 'winget install Gyan.FFmpeg' (Windows).");
  }

  // 2. Inspect ffprobe
  let ffprobeFound = false;
  let ffprobeVersion: string | undefined;
  let ffprobeError: string | undefined;
  try {
    const res = await runCommand("ffprobe", ["-version"], { signal: options?.signal });
    ffprobeFound = true;
    const match = res.stdout.match(/ffprobe version ([^\s]+)/i);
    ffprobeVersion = match ? match[1] : res.stdout.split("\n")[0];
  } catch (err: any) {
    ffprobeFound = false;
    ffprobeError = err.message || "Failed to execute ffprobe binary";
    recommendations.push("FFprobe binary not found in system PATH. Ensure ffprobe is installed alongside ffmpeg.");
  }

  // 3. Hardware acceleration
  const hwInfo: HwAccelInfo = await detectHwAccel();
  if (!hwInfo.isAvailable) {
    recommendations.push("No GPU hardware video encoder detected. Video encoding will use CPU software fallback (libx264).");
  }

  // 4. Codecs
  let h264 = false;
  let hevc = false;
  let vp9 = false;
  let mp3 = false;
  let aac = false;
  let flac = false;

  try {
    const encRes = await runCommand("ffmpeg", ["-encoders"], { signal: options?.signal });
    const text = `${encRes.stdout}\n${encRes.stderr}`;
    h264 = text.includes("libx264") || text.includes("h264_");
    hevc = text.includes("libx265") || text.includes("hevc_");
    vp9 = text.includes("libvpx-vp9");
    mp3 = text.includes("libmp3lame");
    aac = text.includes(" aac ") || text.includes(" aac\n");
    flac = text.includes(" flac ") || text.includes(" flac\n");
  } catch {}

  // 5. Critical Filters
  let subtitlesLibass = false;
  let loudnorm = false;
  let silencedetect = false;
  let boxblur = false;
  let showwavespic = false;

  if (params?.checkFilters ?? true) {
    [subtitlesLibass, loudnorm, silencedetect, boxblur, showwavespic] = await Promise.all([
      hasFilter("subtitles"),
      hasFilter("loudnorm"),
      hasFilter("silencedetect"),
      hasFilter("boxblur"),
      hasFilter("showwavespic"),
    ]);

    if (!subtitlesLibass) {
      recommendations.push("FFmpeg was compiled without '--enable-libass'. The 'burn_subtitles' tool will fail, though 'add_subtitles' (soft subtitles) is fully operational.");
    }
    if (!loudnorm) {
      recommendations.push("The 'loudnorm' filter is missing. EBU R128 audio normalization will not be available.");
    }
  }

  const healthy = ffmpegFound && ffprobeFound;
  if (healthy && recommendations.length === 0) {
    recommendations.push("Environment is fully healthy and optimized for media processing.");
  }

  return {
    healthy,
    system: systemInfo,
    binaries: {
      ffmpeg: {
        found: ffmpegFound,
        version: ffmpegVersion,
        error: ffmpegError,
      },
      ffprobe: {
        found: ffprobeFound,
        version: ffprobeVersion,
        error: ffprobeError,
      },
    },
    hardwareAcceleration: {
      available: hwInfo.isAvailable,
      activeType: hwInfo.hardwareType,
      detectedTypes: hwInfo.availableTypes,
      h264Encoder: hwInfo.h264Encoder,
      hevcEncoder: hwInfo.hevcEncoder,
    },
    codecs: {
      h264,
      hevc,
      vp9,
      mp3,
      aac,
      flac,
    },
    criticalFilters: {
      subtitlesLibass,
      loudnorm,
      silencedetect,
      boxblur,
      showwavespic,
    },
    recommendations,
  };
}
