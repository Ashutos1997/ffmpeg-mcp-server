import os from "node:os";
import { runCommand } from "./exec.js";

export type HardwareType = "videotoolbox" | "nvenc" | "qsv" | "amf" | "vaapi" | "none";

export interface HwAccelInfo {
  isAvailable: boolean;
  h264Encoder: string;
  hevcEncoder: string;
  hardwareType: HardwareType;
  availableTypes: HardwareType[];
  encoders: {
    h264: string[];
    hevc: string[];
  };
}

let cachedInfo: HwAccelInfo | null = null;

async function canEncodeWith(encoder: string): Promise<boolean> {
  try {
    await runCommand("ffmpeg", [
      "-v", "quiet",
      "-f", "lavfi",
      "-i", "color=c=black:s=16x16:d=0.04",
      "-c:v", encoder,
      "-f", "null",
      "-"
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects available hardware-accelerated video encoders across macOS, Linux, and Windows.
 * Supports Apple Silicon (VideoToolbox), NVIDIA (NVENC), Intel (QuickSync), AMD (AMF), and Linux (VAAPI).
 */
export async function detectHwAccel(): Promise<HwAccelInfo> {
  if (cachedInfo) {
    return cachedInfo;
  }

  const detectedH264: string[] = [];
  const detectedHevc: string[] = [];
  const detectedTypes: HardwareType[] = [];

  try {
    const res = await runCommand("ffmpeg", ["-encoders"]);
    const text = `${res.stdout}\n${res.stderr}`;

    const check = (enc: string) => text.includes(` ${enc} `) || text.includes(` ${enc}\n`);

    if (check("h264_videotoolbox")) {
      detectedH264.push("h264_videotoolbox");
      if (!detectedTypes.includes("videotoolbox")) detectedTypes.push("videotoolbox");
    }
    if (check("hevc_videotoolbox")) {
      detectedHevc.push("hevc_videotoolbox");
      if (!detectedTypes.includes("videotoolbox")) detectedTypes.push("videotoolbox");
    }

    if (check("h264_nvenc")) {
      detectedH264.push("h264_nvenc");
      if (!detectedTypes.includes("nvenc")) detectedTypes.push("nvenc");
    }
    if (check("hevc_nvenc")) {
      detectedHevc.push("hevc_nvenc");
      if (!detectedTypes.includes("nvenc")) detectedTypes.push("nvenc");
    }

    if (check("h264_qsv")) {
      detectedH264.push("h264_qsv");
      if (!detectedTypes.includes("qsv")) detectedTypes.push("qsv");
    }
    if (check("hevc_qsv")) {
      detectedHevc.push("hevc_qsv");
      if (!detectedTypes.includes("qsv")) detectedTypes.push("qsv");
    }

    if (check("h264_amf")) {
      detectedH264.push("h264_amf");
      if (!detectedTypes.includes("amf")) detectedTypes.push("amf");
    }
    if (check("hevc_amf")) {
      detectedHevc.push("hevc_amf");
      if (!detectedTypes.includes("amf")) detectedTypes.push("amf");
    }

    if (check("h264_vaapi")) {
      detectedH264.push("h264_vaapi");
      if (!detectedTypes.includes("vaapi")) detectedTypes.push("vaapi");
    }
    if (check("hevc_vaapi")) {
      detectedHevc.push("hevc_vaapi");
      if (!detectedTypes.includes("vaapi")) detectedTypes.push("vaapi");
    }
  } catch {
    // If probing fails, fall back to software
  }

  const isDarwin = os.platform() === "darwin";

  let chosenType: HardwareType = "none";
  let h264Encoder = "libx264";
  let hevcEncoder = "libx265";

  const candidates: Array<{ type: HardwareType; h264: string; hevc: string }> = [];

  if (isDarwin && detectedTypes.includes("videotoolbox")) {
    candidates.push({
      type: "videotoolbox",
      h264: "h264_videotoolbox",
      hevc: detectedHevc.includes("hevc_videotoolbox") ? "hevc_videotoolbox" : "libx265",
    });
  }
  if (detectedTypes.includes("nvenc")) {
    candidates.push({
      type: "nvenc",
      h264: "h264_nvenc",
      hevc: detectedHevc.includes("hevc_nvenc") ? "hevc_nvenc" : "libx265",
    });
  }
  if (detectedTypes.includes("qsv")) {
    candidates.push({
      type: "qsv",
      h264: "h264_qsv",
      hevc: detectedHevc.includes("hevc_qsv") ? "hevc_qsv" : "libx265",
    });
  }
  if (detectedTypes.includes("amf")) {
    candidates.push({
      type: "amf",
      h264: "h264_amf",
      hevc: detectedHevc.includes("hevc_amf") ? "hevc_amf" : "libx265",
    });
  }
  if (detectedTypes.includes("vaapi")) {
    candidates.push({
      type: "vaapi",
      h264: "h264_vaapi",
      hevc: detectedHevc.includes("hevc_vaapi") ? "hevc_vaapi" : "libx265",
    });
  }

  // Verify that the driver/device actually initializes (e.g. NVENC compiled in ffmpeg on runner without GPU)
  for (const candidate of candidates) {
    if (await canEncodeWith(candidate.h264)) {
      chosenType = candidate.type;
      h264Encoder = candidate.h264;
      hevcEncoder = candidate.hevc;
      break;
    }
  }

  cachedInfo = {
    isAvailable: chosenType !== "none",
    h264Encoder,
    hevcEncoder,
    hardwareType: chosenType,
    availableTypes: detectedTypes,
    encoders: {
      h264: detectedH264,
      hevc: detectedHevc,
    },
  };

  return cachedInfo;
}

/**
 * Helper to generate video encoder command line arguments for either hardware or software encoding.
 */
export function getVideoEncoderArgs(
  hwInfo: HwAccelInfo,
  options?: {
    useHardware?: boolean;
    bitrate?: string;
    crf?: number;
    preset?: string;
  }
): { args: string[]; encoder: string; isHardware: boolean } {
  const useHw = options?.useHardware !== false && hwInfo.isAvailable;

  if (useHw) {
    return {
      encoder: hwInfo.h264Encoder,
      isHardware: true,
      args: ["-c:v", hwInfo.h264Encoder, "-b:v", options?.bitrate || "4M"],
    };
  }

  return {
    encoder: "libx264",
    isHardware: false,
    args: [
      "-c:v",
      "libx264",
      "-crf",
      String(options?.crf ?? 22),
      "-preset",
      options?.preset || "medium",
    ],
  };
}

/**
 * Check if a specific FFmpeg filter is supported by the local FFmpeg build.
 */
let cachedFilters: Set<string> | null = null;
export async function hasFilter(filterName: string): Promise<boolean> {
  if (!cachedFilters) {
    try {
      const res = await runCommand("ffmpeg", ["-filters"]);
      const lines = `${res.stdout}\n${res.stderr}`.split(/\r?\n/);
      cachedFilters = new Set();
      for (const line of lines) {
        const match = line.match(/^\s*[TSC.]{2}\s+([a-zA-Z0-9_]+)/);
        if (match) {
          cachedFilters.add(match[1]);
        }
      }
    } catch {
      return false;
    }
  }
  return cachedFilters.has(filterName);
}
