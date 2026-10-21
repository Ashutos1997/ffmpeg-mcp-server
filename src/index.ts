#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { probeMedia } from "./tools/probe.js";
import { convertMedia } from "./tools/convert.js";
import { trimMedia } from "./tools/trim.js";
import { extractAudio } from "./tools/audio.js";
import { extractThumbnail } from "./tools/thumbnail.js";
import { compressMedia, compressMediaSchema } from "./tools/compress.js";
import { concatMedia, concatMediaSchema } from "./tools/concat.js";
import { generateWaveform, generateWaveformSchema } from "./tools/waveform.js";
import { addSubtitles, addSubtitlesSchema } from "./tools/subtitles.js";
import { changeSpeed, changeSpeedSchema } from "./tools/speed.js";

const server = new McpServer({
  name: "ffmpeg-mcp-server",
  version: "0.2.0",
});

// Tool 1: Probe Media
server.tool(
  "media_probe",
  "Inspect audio, video, or container files with ffprobe. Returns clean structured JSON with codecs, resolution, duration, bitrate, and streams.",
  {
    inputPath: z.string().describe("Absolute or relative path to the media file to inspect"),
  },
  async ({ inputPath }) => {
    try {
      const result = await probeMedia(inputPath);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error probing media: ${err.message}` }],
      };
    }
  }
);

// Tool 2: Convert Media
server.tool(
  "media_convert",
  "Convert video and audio files using rock-solid presets like web-safe MP4 (H.264/AAC), WebM (VP9/Opus), or high-quality palette-based GIF.",
  {
    inputPath: z.string().describe("Path to the input media file"),
    outputPath: z.string().describe("Destination file path (e.g. ./output.mp4)"),
    preset: z
      .enum(["web_mp4", "webm", "gif", "auto"])
      .optional()
      .describe("Encoding preset. 'web_mp4' ensures universal browser playback (H.264/yuv420p/faststart). 'gif' uses 2-pass palette generation."),
    crf: z
      .number()
      .min(0)
      .max(51)
      .optional()
      .describe("Constant Rate Factor quality (0-51). Lower is higher quality. Default: 23 for H.264, 30 for VP9."),
    resolution: z
      .string()
      .optional()
      .describe("Target resolution, e.g. '1920x1080', '1280x720', '640x360'"),
    fps: z
      .number()
      .positive()
      .optional()
      .describe("Target frame rate, e.g. 30, 60, or 15 (great for GIFs)"),
  },
  async (args) => {
    try {
      const result = await convertMedia(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully converted media:\nOutput: ${result.outputPath}\nCommand: ${result.commandExecuted}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error converting media: ${err.message}` }],
      };
    }
  }
);

// Tool 3: Trim Media
server.tool(
  "trim_media",
  "Trim or cut video and audio clips. Supports fast lossless stream copy (-c copy) or frame-accurate re-encoding.",
  {
    inputPath: z.string().describe("Path to the input media file"),
    outputPath: z.string().describe("Destination file path for the trimmed clip"),
    startTime: z.string().describe("Start time timestamp, e.g. '00:01:30' or '90' (in seconds)"),
    endTime: z.string().optional().describe("End time timestamp, e.g. '00:02:15' or '135'"),
    duration: z.string().optional().describe("Duration to cut from startTime, e.g. '30' (seconds)"),
    accurateReencode: z
      .boolean()
      .optional()
      .describe("If true, re-encodes video for frame-accurate cuts. If false (default), uses instantaneous lossless stream copy."),
  },
  async (args) => {
    try {
      const result = await trimMedia(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully trimmed media:\nOutput: ${result.outputPath}\nCommand: ${result.commandExecuted}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error trimming media: ${err.message}` }],
      };
    }
  }
);

// Tool 4: Extract Audio
server.tool(
  "extract_audio",
  "Extract audio tracks from video files. Includes 'whisper_wav' preset for 16kHz mono PCM optimized for speech-to-text models like Whisper.",
  {
    inputPath: z.string().describe("Path to the input video file"),
    outputPath: z.string().describe("Destination audio file path (e.g. ./audio.mp3, ./audio.wav)"),
    format: z
      .enum(["whisper_wav", "mp3", "aac", "flac", "copy"])
      .optional()
      .describe("Audio format preset. 'whisper_wav' generates 16kHz mono PCM. 'copy' extracts audio without re-encoding."),
    bitrate: z.string().optional().describe("Audio bitrate, e.g. '192k', '320k' (for mp3/aac)"),
  },
  async (args) => {
    try {
      const result = await extractAudio(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully extracted audio:\nOutput: ${result.outputPath}\nCommand: ${result.commandExecuted}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error extracting audio: ${err.message}` }],
      };
    }
  }
);

// Tool 5: Extract Thumbnail
server.tool(
  "extract_thumbnail",
  "Extract a high-quality still frame or thumbnail image (PNG or JPG) at a specific timestamp or at the exact midpoint of a video.",
  {
    inputPath: z.string().describe("Path to the input video file"),
    outputPath: z.string().describe("Destination image file path (e.g. ./thumb.png or ./thumb.jpg)"),
    timestamp: z
      .string()
      .optional()
      .describe("Timestamp to capture, e.g. '00:00:05', '10' (seconds), or 'midpoint' (calculates exact middle of video). Default: '00:00:01'."),
    resolution: z.string().optional().describe("Optional scaled resolution, e.g. '1280x720' or '640x360'"),
  },
  async (args) => {
    try {
      const result = await extractThumbnail(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully extracted thumbnail:\nOutput: ${result.outputPath}\nTimestamp: ${result.timestampUsed}\nCommand: ${result.commandExecuted}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error extracting thumbnail: ${err.message}` }],
      };
    }
  }
);

// Tool 6: Compress Video
server.tool(
  "compress_video",
  "Smart target-size or CRF video compressor. Shrinks recordings to fit GitHub PR limits (10MB), Discord (25MB), or email attachments with optimal quality.",
  compressMediaSchema.shape,
  async (args) => {
    try {
      const result = await compressMedia(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully compressed video:\nOutput: ${result.outputPath}\nOriginal Size: ${(result.originalSizeBytes / (1024 * 1024)).toFixed(2)} MB\nCompressed Size: ${(result.compressedSizeBytes / (1024 * 1024)).toFixed(2)} MB (${result.compressionRatio} reduction)\nCommand: ${result.commandExecuted}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error compressing video: ${err.message}` }],
      };
    }
  }
);

// Tool 7: Concat Media
server.tool(
  "concat_media",
  "Concatenate or join multiple video or audio files sequentially. Supports ultra-fast lossless joining or normalized re-encoding.",
  concatMediaSchema.shape,
  async (args) => {
    try {
      const result = await concatMedia(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully concatenated ${result.totalInputs} clips:\nOutput: ${result.outputPath}\nMode: ${result.mode}\nCommand: ${result.commandExecuted}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error concatenating media: ${err.message}` }],
      };
    }
  }
);

// Tool 8: Generate Waveform
server.tool(
  "generate_waveform",
  "Generate a crisp visual audio waveform image (PNG) from any audio or video file. Ideal for UI previews and audio cards.",
  generateWaveformSchema.shape,
  async (args) => {
    try {
      const result = await generateWaveform(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully generated waveform:\nOutput: ${result.outputPath}\nDimensions: ${result.resolution}\nColor: ${result.color}\nCommand: ${result.commandExecuted}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error generating waveform: ${err.message}` }],
      };
    }
  }
);

// Tool 9: Add Subtitles
server.tool(
  "add_subtitles",
  "Embed subtitles from .srt or .vtt files directly into the video container (mov_text for MP4/MOV, srt for MKV) with instantaneous lossless stream copy.",
  addSubtitlesSchema.shape,
  async (args) => {
    try {
      const result = await addSubtitles(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully added subtitle track:\nOutput: ${result.outputPath}\nSubtitles Source: ${result.subtitlesApplied}\nCodec: ${result.subtitleCodec}\nCommand: ${result.commandExecuted}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error adding subtitles: ${err.message}` }],
      };
    }
  }
);

// Tool 10: Change Speed
server.tool(
  "change_speed",
  "Adjust media playback speed (e.g. 2.0x, 4.0x for timelapses/demo fast-forward, 0.5x for slow motion) with audio pitch normalization.",
  changeSpeedSchema.shape,
  async (args) => {
    try {
      const result = await changeSpeed(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully adjusted playback speed:\nOutput: ${result.outputPath}\nMultiplier: ${result.speedMultiplier}x\nCommand: ${result.commandExecuted}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error changing playback speed: ${err.message}` }],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FFmpeg MCP Server running on stdio (10 tools active)");
}

main().catch((err) => {
  console.error("Fatal error starting FFmpeg MCP server:", err);
  process.exit(1);
});
