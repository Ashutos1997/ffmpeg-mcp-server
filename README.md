# ffmpeg-mcp-server

[![CI](https://github.com/Ashutos1997/ffmpeg-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/Ashutos1997/ffmpeg-mcp-server/actions) [![Release](https://img.shields.io/github/v/release/Ashutos1997/ffmpeg-mcp-server?color=blue)](https://github.com/Ashutos1997/ffmpeg-mcp-server/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE) [![Glama](https://glama.ai/mcp/servers/@Ashutos1997/ffmpeg-mcp-server/badge)](https://glama.ai/mcp/servers/@Ashutos1997/ffmpeg-mcp-server)

A Model Context Protocol (MCP) server that gives AI tools access to FFmpeg and FFprobe to process video and audio locally.

Supports Apple Silicon hardware encoding and returns image previews directly to models with vision.

---

## Why This Exists

When AI agents process media, they often hallucinate invalid flags, syntax errors, or incompatible pixel formats.

This server provides 12 typed tools using Zod schemas. The AI passes parameters (such as `{ inputPath: "video.mov", preset: "web_mp4" }`), and the server runs the valid FFmpeg command locally.

---

## Key Features

* **Hardware Encoding:** Uses VideoToolbox on macOS for faster exports with low CPU usage.
* **Image Responses:** Returns base64 images so vision models can inspect thumbnails and waveforms.
* **Social Formats:** Reformats landscape video to 9:16 vertical video with blurred background padding.
* **Silence Removal:** Detects and trims pauses from speech recordings.

---

## Included Tools

| Tool | Description | Key Parameters |
| :--- | :--- | :--- |
| **`media_probe`** | Inspects media files with ffprobe. Returns metadata, streams, codecs, resolution, and duration as JSON. | `inputPath` |
| **`media_convert`** | Converts video and audio formats. Includes presets for web MP4, WebM, and animated GIF. | `inputPath`, `outputPath`, `preset`, `crf`, `resolution`, `fps`, `hardwareAcceleration` |
| **`trim_media`** | Cuts a segment from a video or audio file using stream copy or re-encoding. | `inputPath`, `outputPath`, `startTime`, `endTime`, `duration`, `accurateReencode` |
| **`extract_audio`** | Rips audio tracks from video. Includes a 16kHz mono WAV preset for Whisper speech recognition. | `inputPath`, `outputPath`, `format`, `bitrate` |
| **`extract_thumbnail`** | Captures a still image at a timestamp or midpoint. Returns base64 image data for vision models. | `inputPath`, `outputPath`, `timestamp`, `resolution`, `includeBase64` |
| **`compress_video`** | Compresses video to fit target sizes (such as GitHub PRs under 10MB or Discord under 25MB). | `inputPath`, `outputPath`, `targetSizeMB`, `preset`, `crf`, `maxWidth`, `hardwareAcceleration` |
| **`reformat_aspect_ratio`** | Changes video ratio to 9:16 vertical, 1:1 square, or 4:5 portrait with blurred borders or center crop. | `inputPath`, `outputPath`, `targetRatio`, `mode`, `blurAmount`, `padColor` |
| **`trim_silence`** | Detects and removes silent pauses from recordings. Reports duration and seconds saved. | `inputPath`, `outputPath`, `mode`, `thresholdDb`, `minDurationSeconds` |
| **`concat_media`** | Joins multiple video or audio files in order using stream copy or re-encoding. | `inputPaths`, `outputPath`, `mode` |
| **`generate_waveform`** | Generates a PNG waveform image. Returns base64 image data for vision models. | `inputPath`, `outputPath`, `width`, `height`, `color`, `scale`, `includeBase64` |
| **`add_subtitles`** | Embeds SRT or VTT subtitle tracks into video files without re-encoding video. | `videoPath`, `subtitlesPath`, `outputPath`, `language`, `title` |
| **`change_speed`** | Adjusts playback speed (such as 2x fast forward or 0.5x slow motion) with pitch correction. | `inputPath`, `outputPath`, `speed`, `muteAudio` |

---

## Requirements

* **Node.js** >= 18.0.0
* **FFmpeg & FFprobe** installed locally:
  * **macOS:** `brew install ffmpeg`
  * **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install ffmpeg`
  * **Windows:** `winget install Gyan.FFmpeg` or `choco install ffmpeg`

---

## Installation

### Antigravity

Add to `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "node",
      "args": ["/Users/ashj/Desktop/Projects/ffmpeg-mcp-server/dist/index.js"]
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "node",
      "args": ["/Users/ashj/Desktop/Projects/ffmpeg-mcp-server/dist/index.js"]
    }
  }
}
```

---

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build TypeScript:**
   ```bash
   npm run build
   ```

3. **Run tests:**
   ```bash
   node test-tools.js
   ```

---

## License

MIT © [Ashutos1997](https://github.com/Ashutos1997)
