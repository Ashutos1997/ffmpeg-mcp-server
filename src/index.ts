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
import { reformatAspectRatio, reformatAspectSchema } from "./tools/reformat.js";
import { trimSilence, trimSilenceSchema } from "./tools/silence.js";

const server = new McpServer({
  name: "ffmpeg-mcp-server",
  version: "0.3.2",
});

// Tool 1: Probe Media
server.tool(
  "media_probe",
  "Inspect audio and video files with ffprobe. Returns container metadata, stream details, codecs, resolution, bitrate, and duration as JSON.",
  {
    inputPath: z.string().describe("Path to the media file to inspect (e.g. './video.mp4')"),
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
  "Convert video and audio files between formats. Includes presets for web MP4 (H.264/AAC), WebM (VP9/Opus), and animated GIF. Supports Apple Silicon hardware encoding.",
  {
    inputPath: z.string().describe("Path to the source media file to convert"),
    outputPath: z.string().describe("Destination path for the converted file (e.g. ./output.mp4, ./output.webm, ./animation.gif)"),
    preset: z
      .enum(["web_mp4", "webm", "gif", "auto"])
      .optional()
      .describe("Encoding preset: 'web_mp4' for browser playback, 'webm' for WebM video, 'gif' for animated GIF, or 'auto'. Default: 'auto'."),
    crf: z
      .number()
      .min(0)
      .max(51)
      .optional()
      .describe("Quality factor from 0 to 51. Lower numbers mean higher quality. Default: 23 for MP4, 30 for WebM."),
    resolution: z
      .string()
      .optional()
      .describe("Target size formatted as 'WIDTHxHEIGHT', such as '1920x1080' or '1280x720'"),
    fps: z
      .number()
      .positive()
      .optional()
      .describe("Target frame rate in frames per second, such as 30, 60, or 15"),
    hardwareAcceleration: z
      .boolean()
      .optional()
      .describe("Use Apple Silicon VideoToolbox encoding when available. Default: true."),
  },
  async (args) => {
    try {
      const result = await convertMedia(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully converted media:\nOutput: ${result.outputPath}\nHardware Accelerated: ${result.hardwareAccelerated}\nCommand: ${result.commandExecuted}`,
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
  "Cut a segment from a video or audio file. Uses stream copy without re-encoding by default, or re-encodes when accurate cuts are needed.",
  {
    inputPath: z.string().describe("Path to the source media file to cut."),
    outputPath: z.string().describe("Destination path for the trimmed output file (e.g. './clip.mp4')."),
    startTime: z.string().describe("Start timestamp formatted as 'HH:MM:SS' (e.g. '00:01:30') or seconds (e.g. '90')."),
    endTime: z.string().optional().describe("Optional end timestamp formatted as 'HH:MM:SS' or seconds. Do not combine with duration."),
    duration: z.string().optional().describe("Optional duration in seconds from startTime (e.g. '30'). If neither endTime nor duration is set, trims to end of file."),
    accurateReencode: z
      .boolean()
      .optional()
      .describe("Re-encode video for cuts between keyframes. Default: false (uses fast stream copy)."),
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
  "Extract an audio track from a video file into a standalone audio file. Supports the 'whisper_wav' preset (16kHz mono WAV) for speech recognition models, plus MP3, AAC, FLAC, and stream copy.",
  {
    inputPath: z.string().describe("Path to the source video or audio file."),
    outputPath: z.string().describe("Destination path for the output audio file (e.g. './extracted.wav' or './audio.mp3')."),
    format: z
      .enum(["whisper_wav", "mp3", "aac", "flac", "copy"])
      .optional()
      .describe("Audio format: 'whisper_wav' (16kHz mono WAV for Whisper), 'mp3', 'aac', 'flac', or 'copy' (extract without re-encoding)."),
    bitrate: z.string().optional().describe("Target audio bitrate for MP3 or AAC (e.g. '128k', '192k', '320k')."),
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
  "Capture a still image from a video. Returns the saved image path and inlined base64 image data so vision models can inspect the frame.",
  {
    inputPath: z.string().describe("Path to the source video file."),
    outputPath: z.string().describe("Destination image path ending in .png or .jpg (e.g. './thumb.png')."),
    timestamp: z
      .string()
      .optional()
      .describe("Timestamp to capture, such as '00:00:05', '10', or 'midpoint' for the middle frame. Default: '00:00:01'."),
    resolution: z.string().optional().describe("Optional scaled size formatted as 'WIDTHxHEIGHT', such as '1280x720'. Defaults to source resolution."),
    includeBase64: z.boolean().optional().describe("Return base64 image data in response for vision models. Default: true."),
  },
  async (args) => {
    try {
      const result = await extractThumbnail(args);
      const content: any[] = [];
      if (result.base64 && result.mimeType) {
        content.push({
          type: "image",
          data: result.base64,
          mimeType: result.mimeType,
        });
      }
      content.push({
        type: "text",
        text: `Successfully extracted thumbnail:\nOutput: ${result.outputPath}\nTimestamp: ${result.timestampUsed}\nCommand: ${result.commandExecuted}`,
      });
      return { content };
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
  "Compress video files to fit upload limits (such as GitHub PRs under 10MB or Discord under 25MB) using target file sizes or CRF quality levels. Does not modify the original file.",
  compressMediaSchema.shape,
  async (args) => {
    try {
      const result = await compressMedia(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully compressed video:\nOutput: ${result.outputPath}\nOriginal Size: ${(result.originalSizeBytes / (1024 * 1024)).toFixed(2)} MB\nCompressed Size: ${(result.compressedSizeBytes / (1024 * 1024)).toFixed(2)} MB (${result.compressionRatio} reduction)\nEncoder: ${result.encoderUsed} (Hardware Accelerated: ${result.hardwareAccelerated})\nCommand: ${result.commandExecuted}`,
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
  "Join multiple video or audio files in order into a single file. Uses stream copy for matching files or re-encodes when formats differ.",
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
  "Generate a PNG waveform image from an audio or video file. Returns the file path and inlined base64 image data.",
  generateWaveformSchema.shape,
  async (args) => {
    try {
      const result = await generateWaveform(args);
      const content: any[] = [];
      if (result.base64) {
        content.push({
          type: "image",
          data: result.base64,
          mimeType: "image/png",
        });
      }
      content.push({
        type: "text",
        text: `Successfully generated waveform:\nOutput: ${result.outputPath}\nDimensions: ${result.resolution}\nColor: ${result.color}\nCommand: ${result.commandExecuted}`,
      });
      return { content };
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
  "Embed an SRT or VTT subtitle track into a video file without re-encoding the video stream.",
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
  "Change video and audio playback speed (such as 2x for fast forward or 0.5x for slow motion) with pitch correction.",
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

// Tool 11: Reformat Aspect Ratio
server.tool(
  "reformat_aspect_ratio",
  "Change video aspect ratio to 9:16 vertical, 1:1 square, or 4:5 portrait. Adds blurred video borders, solid padding, or center crops.",
  reformatAspectSchema.shape,
  async (args) => {
    try {
      const result = await reformatAspectRatio(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully reformatted video aspect ratio:\nOutput: ${result.outputPath}\nTarget Ratio: ${result.targetRatio} (${result.resolution})\nMode: ${result.mode}\nEncoder: ${result.encoderUsed} (Hardware Accelerated: ${result.hardwareAccelerated})\nCommand: ${result.commandExecuted}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error reformatting aspect ratio: ${err.message}` }],
      };
    }
  }
);

// Tool 12: Trim Silence
server.tool(
  "trim_silence",
  "Detect and remove silent pauses from audio or video files. Returns the duration and seconds saved.",
  trimSilenceSchema.shape,
  async (args) => {
    try {
      const result = await trimSilence(args);
      return {
        content: [
          {
            type: "text",
            text: `Successfully trimmed silence:\nOutput: ${result.outputPath}\nMode: ${result.mode}\nOriginal Duration: ${result.originalDurationSeconds}s\nNew Duration: ${result.newDurationSeconds}s (Saved ${result.timeSavedSeconds}s of dead air)\nCommand: ${result.commandExecuted}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error trimming silence: ${err.message}` }],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FFmpeg MCP Server running on stdio (12 tools active)");
}

main().catch((err) => {
  console.error("Fatal error starting FFmpeg MCP server:", err);
  process.exit(1);
});
