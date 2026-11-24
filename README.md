# ffmpeg-mcp-server

[English](README.md) | [한국어](README.ko.md)

[![CI](https://github.com/Ashutos1997/ffmpeg-mcp-server/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Ashutos1997/ffmpeg-mcp-server/actions) [![Release](https://img.shields.io/github/v/release/Ashutos1997/ffmpeg-mcp-server?color=blue&label=release)](https://github.com/Ashutos1997/ffmpeg-mcp-server/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE) [![npm version](https://img.shields.io/npm/v/@ash_j1997/ffmpeg-mcp-server.svg)](https://www.npmjs.com/package/@ash_j1997/ffmpeg-mcp-server) [![npm downloads](https://img.shields.io/npm/dw/@ash_j1997/ffmpeg-mcp-server.svg)](https://www.npmjs.com/package/@ash_j1997/ffmpeg-mcp-server) [![npm total downloads](https://img.shields.io/npm/dt/@ash_j1997/ffmpeg-mcp-server.svg)](https://www.npmjs.com/package/@ash_j1997/ffmpeg-mcp-server) [![Ashutos1997/ffmpeg-mcp-server MCP server](https://glama.ai/mcp/servers/Ashutos1997/ffmpeg-mcp-server/badges/score.svg)](https://glama.ai/mcp/servers/Ashutos1997/ffmpeg-mcp-server) [![FFmpeg MCP server](https://mcprush.com/badge/ashutos1997-ffmpeg-mcp/card.svg)](https://mcprush.com/to/ashutos1997-ffmpeg-mcp?ref=badge)

A Model Context Protocol (MCP) server that gives AI tools access to FFmpeg and FFprobe to process video and audio locally.

Supports cross-platform GPU hardware encoding (Apple Silicon, NVIDIA NVENC, Intel QuickSync, AMD AMF), live progress updates via MCP progress tokens, instant cancellation via `AbortSignal`, post-flight self-verification, plan-before-encode (`dryRun`), and inlines image previews directly for multimodal vision models.

---

## ⚡ 1-Command Automated Client Setup

Run one command in your terminal to automatically detect and configure Claude Desktop, Cursor, Antigravity, and Claude Code:

```bash
npx @ash_j1997/ffmpeg-mcp-server setup
```

The setup wizard auto-locates your AI clients' configuration files, safely injects the `@ash_j1997/ffmpeg-mcp-server` entry while preserving existing servers, and readies 20 studio tools immediately.

---

## Why This Exists

When AI agents process media, they often hallucinate invalid flags, syntax errors, or incompatible pixel formats.

This server provides **20 typed tools** using Zod schemas. The AI passes parameters (such as `{ inputPath: "video.mov", preset: "instagram_reel" }`), and the server runs the valid FFmpeg command locally with proper error handling, hardware acceleration, and progress notifications.

---

## Quick Start (Manual Configuration)

Add directly to your client configuration:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "npx",
      "args": ["-y", "@ash_j1997/ffmpeg-mcp-server"]
    }
  }
}
```

* **Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
* **Cursor / Windsurf:** Add as a stdio server with command `npx` and args `["-y", "@ash_j1997/ffmpeg-mcp-server"]`
* **Antigravity:** `~/.gemini/config/mcp_config.json`

---

## Key Features

* **Universal Hardware Acceleration:** Automatically detects and leverages hardware encoders across macOS (VideoToolbox), Linux/Windows GPUs (NVIDIA NVENC, Intel QuickSync, AMD AMF, and VA-API) for 5x–20x faster exports with low CPU usage.
* **Post-Flight Self-Verification:** Every key editing tool (`media_convert`, `trim_media`, `compress_video`, `reformat_aspect_ratio`, `concat_media`, `normalize_audio`, `extract_audio`) automatically probes the generated output file and returns confirmed dimensions, duration, format, and file size to the calling agent.
* **Plan-Before-Encode (`dryRun`):** Heavy tools accept `dryRun: true` allowing AI agents to inspect the constructed FFmpeg command, filtergraph, and parameters without modifying disk files.
* **Real-time Progress Reporting:** Emits live percentage updates via standard MCP progress tokens (`notifications/progress`), enabling progress bars in modern AI clients.
* **Instant Cancellation:** Listens to client `AbortSignal` events to immediately terminate child FFmpeg processes when a generation is stopped.
* **Multimodal Vision Previews:** Inlines base64 image data for thumbnails, audio waveforms, and multi-frame contact sheets so vision models (Claude 3.7, GPT-4o, Gemini) can "see" media content.
* **Social Formats & Automation:** Reformats landscape video to 9:16 vertical video with blurred backgrounds, burns customizable hardcoded subtitles, creates top/bottom split-screen reels, and provides dedicated presets for Instagram Reels and YouTube Shorts.
* **Audio Engineering:** Normalizes loudness to broadcast/streaming standards (EBU R128 / -16 LUFS), cleans vocal audio with 80Hz rumble removal, and trims dead air while preserving lip-sync.
* **Scene Intelligence & Multiplexing:** Detects visual scene changes and cut points for smart editing workflows, and combines or replaces video/audio tracks with zero-loss stream copy.
* **Smart Input Guards & Validation:** Pre-probes streams and duration limits before execution — safeguarding `trim_media`, `extract_audio`, `generate_waveform`, and `extract_thumbnail` from cryptic errors on silent or out-of-bounds media.

---

## Included Tools (20 Total)

| Tool | Description | Key Parameters |
| :--- | :--- | :--- |
| **`ffmpeg_doctor`** *(New)* | Diagnostic tool checking FFmpeg & FFprobe binaries, GPU acceleration, codecs, and compiled filters (`libass`, `loudnorm`) with automated fix recommendations. | `checkFilters` |
| **`media_probe`** | Inspects media files with ffprobe. Returns metadata, streams, codecs, resolution, and duration as JSON. | `inputPath` |
| **`media_convert`** | Converts video and audio formats. Includes presets for web MP4, WebM, animated GIF, Instagram Reels (9:16), and YouTube Shorts with GPU acceleration and `dryRun`. | `inputPath`, `outputPath`, `preset`, `crf`, `resolution`, `fps`, `hardwareAcceleration`, `dryRun` |
| **`trim_media`** | Cuts a segment from a video or audio file using stream copy or re-encoding with `dryRun` support. | `inputPath`, `outputPath`, `startTime`, `endTime`, `duration`, `accurateReencode`, `dryRun` |
| **`extract_audio`** | Rips audio tracks from video. Includes a 16kHz mono WAV preset for Whisper speech recognition with automatic verification. | `inputPath`, `outputPath`, `format`, `bitrate` |
| **`extract_thumbnail`** | Captures a still image at a timestamp or midpoint. Returns base64 image data for vision models. | `inputPath`, `outputPath`, `timestamp`, `resolution`, `includeBase64` |
| **`compress_video`** | Compresses video to fit target sizes (such as GitHub PRs under 10MB or Discord under 25MB) with `dryRun` support. | `inputPath`, `outputPath`, `targetSizeMB`, `preset`, `crf`, `maxWidth`, `hardwareAcceleration`, `dryRun` |
| **`reformat_aspect_ratio`** | Changes video ratio to 9:16 vertical, 1:1 square, or 4:5 portrait with blurred borders or center crop. | `inputPath`, `outputPath`, `targetRatio`, `mode`, `blurAmount`, `padColor`, `hardwareAcceleration`, `dryRun` |
| **`create_split_screen`** | Stacks two videos top-and-bottom (9:16 Reels/TikTok) or side-by-side with audio mixing and subtitles. | `firstVideoPath`, `secondVideoPath`, `outputPath`, `layout`, `audioSource`, `subtitlesPath` |
| **`trim_silence`** | Detects and removes silent pauses from recordings while preserving video & audio lip-sync. | `inputPath`, `outputPath`, `mode`, `thresholdDb`, `minDurationSeconds` |
| **`concat_media`** | Joins multiple media files in order. Automatically probes inputs to select stream copy or re-encoding. | `inputPaths`, `outputPath`, `mode`, `dryRun` |
| **`generate_waveform`** | Generates a PNG waveform image. Returns base64 image data for vision models. | `inputPath`, `outputPath`, `width`, `height`, `color`, `scale`, `includeBase64` |
| **`add_subtitles`** | Embeds SRT or VTT subtitle tracks into MP4/MKV video files without re-encoding video. | `videoPath`, `subtitlesPath`, `outputPath`, `language`, `title` |
| **`burn_subtitles`** | Hardcodes subtitles directly onto video frames with customizable font size, colors, and margins. | `videoPath`, `subtitlesPath`, `outputPath`, `fontSize`, `fontColor`, `outlineColor`, `marginV` |
| **`extract_keyframes`** | Extracts multiple representative frames across the video and generates a contact sheet grid for vision AI. | `inputPath`, `outputPath`, `count`, `layout`, `includeBase64` |
| **`normalize_audio`** | Normalizes audio loudness using EBU R128 (default -16 LUFS) with optional speech clarity high-pass filter. | `inputPath`, `outputPath`, `targetLufs`, `targetPeakDb`, `voiceClarity` |
| **`add_overlay`** | Places a watermark image or logo PNG over video with customizable corner position, scale, and opacity. | `videoPath`, `overlayPath`, `outputPath`, `position`, `padding`, `scaleWidth`, `opacity` |
| **`change_speed`** | Adjusts playback speed (such as 2x fast forward or 0.5x slow motion) with pitch correction. | `inputPath`, `outputPath`, `speed`, `muteAudio` |
| **`mux_media`** | Combines or replaces video and audio streams with optional audio offset delay and zero-loss stream copy. | `videoPath`, `audioPath`, `outputPath`, `mode`, `audioOffsetSeconds`, `streamCopyVideo`, `shortest` |
| **`detect_scenes`** | Detects video cut points and scene transitions with adjustable sensitivity. Returns timestamps, scene durations, and an optional contact sheet. | `inputPath`, `threshold`, `minDurationSeconds`, `outputPath`, `includeBase64` |

---

## MCP Resources & Prompts

### Resources
* **`media://capabilities`**: Inspects local FFmpeg installation, active version, detected hardware accelerators (VideoToolbox, NVENC, QSV, AMF, VAAPI), and supported video encoders.
* **`media://presets`**: Standard reference table of social aspect ratios, platform upload file size limits, and broadcast audio loudness targets.

### Prompts
* **`social_clip_generator`**: Interactive workflow that turns raw landscape video into vertical shorts with blurred background padding, trimmed silence, and hardcoded captions.
* **`whisper_audio_prep`**: Standard pipeline for extracting 16kHz mono WAV audio and normalizing loudness for speech-to-text models.

---

## Requirements

* **Node.js** >= 18.0.0
* **FFmpeg & FFprobe** installed locally:
  * **macOS:** `brew install ffmpeg`
  * **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install ffmpeg libass-dev`
  * **Windows:** `winget install Gyan.FFmpeg` or `choco install ffmpeg`

---

## Local Development & Testing

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run build and automated test suite:**
   ```bash
   npm test
   ```

---

## Acknowledgements & Community

- Special thanks to [@rajarshidattapy](https://github.com/rajarshidattapy) for suggesting stream multiplexing (`mux_media`) and scene transition detection (`detect_scenes`) to expand the server beyond format conversion.
- Special thanks to Reddit user [u/QuanTradin](https://www.reddit.com/user/QuanTradin/) for inspiring smart input guards (pre-flight stream validation & sample rate checking) and auto-probing in `concat_media` to prevent corrupted outputs and catch bugs before execution.

---

## License

MIT © [Ashutos1997](https://github.com/Ashutos1997)
