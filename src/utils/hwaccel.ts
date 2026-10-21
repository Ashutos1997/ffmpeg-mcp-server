import os from "node:os";
import { runCommand } from "./exec.js";

export interface HwAccelInfo {
  isAvailable: boolean;
  h264Encoder: string;
  hevcEncoder: string;
  hardwareType: "videotoolbox" | "none";
}

let cachedInfo: HwAccelInfo | null = null;

/**
 * Detects if hardware-accelerated video encoders (Apple Silicon VideoToolbox) are available.
 */
export async function detectHwAccel(): Promise<HwAccelInfo> {
  if (cachedInfo) {
    return cachedInfo;
  }

  const isDarwin = os.platform() === "darwin";
  if (!isDarwin) {
    cachedInfo = {
      isAvailable: false,
      h264Encoder: "libx264",
      hevcEncoder: "libx265",
      hardwareType: "none",
    };
    return cachedInfo;
  }

  try {
    const res = await runCommand("ffmpeg", ["-encoders"]);
    const hasVtH264 = res.stdout.includes("h264_videotoolbox") || res.stderr.includes("h264_videotoolbox");
    const hasVtHevc = res.stdout.includes("hevc_videotoolbox") || res.stderr.includes("hevc_videotoolbox");

    if (hasVtH264) {
      cachedInfo = {
        isAvailable: true,
        h264Encoder: "h264_videotoolbox",
        hevcEncoder: hasVtHevc ? "hevc_videotoolbox" : "libx265",
        hardwareType: "videotoolbox",
      };
      return cachedInfo;
    }
  } catch {
    // Fallback if ffprobe/ffmpeg check fails
  }

  cachedInfo = {
    isAvailable: false,
    h264Encoder: "libx264",
    hevcEncoder: "libx265",
    hardwareType: "none",
  };
  return cachedInfo;
}
