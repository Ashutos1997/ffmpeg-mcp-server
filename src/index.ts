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
  version: "0.3.1",
});

// Tool 1: Probe Media
server.tool(
  "media_probe",
  "Inspect audio, video, or container files using ffprobe. Use this tool whenever you need metadata, duration, streams, codecs, resolution, or bitrate of a media file before processing. Returns clean structured JSON.",
  {
    inputPath: z.string().describe("Absolute or relative path to the media file to inspect (e.g. './video.mp4')"),
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
  "Convert video and audio files using rock-solid presets like web-safe MP4 (H.264/AAC), WebM (VP9/Opus), or high-quality palette-based GIF. Use this tool when you need reliable format conversion for browser playback, streaming, or animations. Supports Apple Silicon hardware acceleration.",
  {
    inputPath: z.string().describe("Path to the input media file to convert"),
    outputPath: z.string().describe("Destination file path (e.g. ./output.mp4, ./output.webm, ./animation.gif)"),
    preset: z
      .enum(["web_mp4", "webm", "gif", "auto"])
      .optional()
      .describe("Encoding preset: 'web_mp4' ensures universal browser playback (H.264/yuv420p/faststart), 'webm' uses VP9/Opus for modern web, 'gif' generates a high-quality 2-pass palette GIF, 'auto' infers from extension. Default: 'auto'."),
    crf: z
      .number()
      .min(0)
      .max(51)
      .optional()
      .describe("Constant Rate Factor quality (0-51). Lower is higher quality. Default: 23 for H.264, 30 for VP9."),
    resolution: z
      .string()
      .optional()
      .describe("Target resolution formatted as 'WIDTHxHEIGHT', e.g. '1920x1080', '1280x720', '640x360'"),
    fps: z
      .number()
      .positive()
      .optional()
      .describe("Target frame rate in frames per second, e.g. 30, 60, or 15 (ideal for GIFs)"),
    hardwareAcceleration: z
      .boolean()
      .optional()
      .describe("Whether to use Apple Silicon VideoToolbox hardware encoding if available. Defaults to true."),
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
  "Cut or extract a specific time segment from a video or audio file. Use this tool when extracting highlights, clipping demos, or removing unwanted sections from media. By default uses instantaneous lossless stream copy (-c copy) without re-encoding. Set accurateReencode to true when cutting precisely between keyframes.",
  {
    inputPath: z.string().describe("Path to the source media file to trim."),
    outputPath: z.string().describe("Destination path for the trimmed output media file (e.g. './clip.mp4')."),
    startTime: z.string().describe("Start timestamp where the cut begins. Formatted as timecode 'HH:MM:SS' (e.g. '00:01:30') or total seconds (e.g. '90')."),
    endTime: z.string().optional().describe("Optional end timestamp where the cut stops (e.g. '00:02:15' or '135'). Mutually exclusive with duration; if both are provided, duration takes precedence."),
    duration: z.string().optional().describe("Optional length of the cut in seconds from startTime (e.g. '30' for a 30-second clip). If neither endTime nor duration is specified, trims from startTime to the end of the file."),
    accurateReencode: z
      .boolean()
      .optional()
      .describe("Set to true for frame-accurate cuts at exact millisecond boundaries by re-encoding. Default is false (instantaneous lossless stream copy)."),
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
  "Extract audio tracks from video or audio files and save them to a standalone audio file. Use this tool when you need speech audio for transcription (e.g. Whisper STT), background audio extraction, or format conversion. Includes the 'whisper_wav' preset (16kHz mono 16-bit PCM WAV) specifically required by speech-to-text models, plus MP3, AAC, FLAC, and lossless stream copy. Outputs a new audio file.",
  {
    inputPath: z.string().describe("Path to the source video or audio file containing audio streams."),
    outputPath: z.string().describe("Destination path for the extracted audio file (e.g. './extracted_audio.wav' or './podcast.mp3')."),
    format: z
      .enum(["whisper_wav", "mp3", "aac", "flac", "copy"])
      .optional()
      .describe("Audio format preset: 'whisper_wav' (16kHz mono PCM WAV required for Whisper and speech recognition), 'mp3' (standard MP3), 'aac' (high-efficiency AAC), 'flac' (lossless FLAC), or 'copy' (extracts audio stream without re-encoding). Default is inferred from outputPath or 'mp3'."),
    bitrate: z.string().optional().describe("Target audio bitrate for lossy formats like mp3 or aac (e.g. '128k', '192k', '320k'). Ignored for PCM/FLAC and stream copy."),
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

// Tool 5: Extract Thumbnail (Multimodal Vision Supported)
server.tool(
  "extract_thumbnail",
  "Extract a high-resolution still frame or thumbnail image (PNG or JPEG) from any video file. Use this tool to generate video previews, poster images, or capture specific frames for visual inspection. Returns both the saved image file path and inlined base64 image data directly in the tool response so AI vision models can immediately see and verify the image.",
  {
    inputPath: z.string().describe("Path to the source video file."),
    outputPath: z.string().describe("Destination image path with .png or .jpg/.jpeg extension (e.g. './previews/thumb.png')."),
    timestamp: z
      .string()
      .optional()
      .describe("Exact timestamp to capture. Accepts timecode strings (e.g. '00:01:23', '00:00:05.500'), integer seconds (e.g. '15'), or 'midpoint' to automatically calculate and capture the exact middle frame of the video. Default: '00:00:01'."),
    resolution: z.string().optional().describe("Optional target image dimensions formatted as 'WIDTHxHEIGHT' (e.g. '1280x720', '640x360') to downscale the thumbnail. If omitted, retains original video resolution."),
    includeBase64: z.boolean().optional().describe("Whether to return inlined base64 image payload in the tool response for multimodal vision inspection. Default: true."),
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
  "Compress video files to reduce size while preserving visual quality using smart target-size calculation or Constant Rate Factor (CRF). Use this tool when users need to fit videos into specific file size limits (e.g. GitHub PRs under 10MB, Discord under 25MB, or email attachments). Calculates video bitrates dynamically from media duration and uses Apple Silicon hardware acceleration (VideoToolbox) on macOS. Generates a new compressed file without modifying the original.",
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
  "Concatenate or join multiple video or audio files sequentially into a single file. Use this tool when combining clips, assembling multi-part recordings, or stitching audio tracks. Supports ultra-fast lossless joining for identical formats or normalized re-encoding.",
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

// Tool 8: Generate Waveform (Multimodal Vision Supported)
server.tool(
  "generate_waveform",
  "Generate a crisp visual audio waveform image (PNG) from any audio or video file. Use this tool to create visual audio cards, UI waveform previews, or inspect audio amplitude. Returns inlined base64 image data so AI vision models can visually inspect the waveform directly.",
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
  "Embed subtitles from .srt or .vtt files directly into the video container (mov_text for MP4/MOV, srt for MKV) using instantaneous lossless stream copy. Use this tool to add captions or multi-language subtitle tracks without re-encoding video.",
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
  "Adjust media playback speed (e.g. 2.0x, 4.0x for timelapses/demo fast-forward, 0.5x for slow motion) with automatic audio pitch normalization. Use this tool when creating product demo timelapses, accelerating long videos, or analyzing slow-motion footage.",
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
  "Transform horizontal videos into 9:16 vertical reels (Shorts, TikTok, Reels), 1:1 square, or 4:5 portrait with aesthetic blurred background padding or smart center crop. Use this tool when re-purposing landscape screencasts or demos for mobile and social media platforms.",
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

// Tool 12: Trim Silence / Dead Air
server.tool(
  "trim_silence",
  "Automatically detect and remove dead air, silent pauses, and room noise from audio recordings, screencasts, voiceovers, or podcasts. Use this tool to tighten spoken recordings, eliminate long thinking pauses, or clean up head and tail silence. Probes the output file and returns the exact number of seconds saved.",
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
  console.error("FFmpeg MCP Server running on stdio (12 tools active, Hardware Acceleration & Multimodal Vision enabled)");
}

main().catch((err) => {
  console.error("Fatal error starting FFmpeg MCP server:", err);
  process.exit(1);
});
