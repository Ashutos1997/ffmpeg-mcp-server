# ffmpeg-mcp-server

[![CI](https://github.com/Ashutos1997/ffmpeg-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/Ashutos1997/ffmpeg-mcp-server/actions) [![Release](https://img.shields.io/github/v/release/Ashutos1997/ffmpeg-mcp-server?color=blue)](https://github.com/Ashutos1997/ffmpeg-mcp-server/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE) [![Glama](https://glama.ai/mcp/servers/@Ashutos1997/ffmpeg-mcp-server/badge)](https://glama.ai/mcp/servers/@Ashutos1997/ffmpeg-mcp-server)

A deterministic, high-performance **Model Context Protocol (MCP)** server that gives AI coding agents (Claude Desktop, Cursor, Antigravity) 12 structured tools to inspect, convert, compress, reformat, and process video and audio using local `ffmpeg` and `ffprobe`.

Features **Apple Silicon Hardware Acceleration** (`videotoolbox`) and **Multimodal Inlined Vision** (so AI vision models can visually inspect thumbnails and waveforms directly).

---

## Why This Exists

When AI agents are asked to process media, they frequently hallucinate invalid FFmpeg flags, syntax errors, or incompatible pixel formats. 

**`ffmpeg-mcp-server`** solves this by providing strongly-typed, schema-validated tools using Zod. The AI simply passes clean parameters (e.g., `{ inputPath: "video.mov", targetRatio: "9:16", mode: "blur_background" }`), and the server generates and executes the exact, optimal FFmpeg command locally on your machine.

---

## Key Highlights

* ⚡ **Apple Silicon Hardware Acceleration:** Automatically detects and utilizes `h264_videotoolbox` / `hevc_videotoolbox` on macOS for 5x–10x faster encoding with minimal CPU load.
* 👁️ **Multimodal Vision Feedback:** Tools like `extract_thumbnail` and `generate_waveform` return inlined base64 image data directly in the MCP response so vision-enabled models can inspect the visual results.
* 📱 **Social Aspect Ratio Reformatting:** Turn horizontal desktop screen recordings into 9:16 vertical reels (Shorts, TikTok, Reels) with aesthetic blurred background padding.
* ✂️ **Dead Air & Silence Trimmer:** Instantly detect and trim silence from screencasts, podcasts, and voiceovers.

---

## Included Tools (12 Total)

| Tool | Description | Key Parameters |
| :--- | :--- | :--- |
| **`media_probe`** | Inspects any audio/video container using `ffprobe`. Returns clean JSON with codecs, resolution, duration, bitrate, and streams. | `inputPath` |
| **`media_convert`** | Converts video/audio with rock-solid presets: `web_mp4` (universal H.264/yuv420p/faststart), `webm` (VP9/Opus), `gif` (2-pass palette generation), or custom CRF/resolution. Supports hardware acceleration. | `inputPath`, `outputPath`, `preset`, `crf`, `resolution`, `fps`, `hardwareAcceleration` |
| **`trim_media`** | Trims media clips. Uses instantaneous lossless stream copy (`-c copy`) by default, or frame-accurate re-encoding. | `inputPath`, `outputPath`, `startTime`, `endTime`, `duration`, `accurateReencode` |
| **`extract_audio`** | Rips audio tracks from video. Includes `whisper_wav` preset (16kHz mono PCM) optimized for speech-to-text models like Whisper, plus `mp3`, `aac`, and `flac`. | `inputPath`, `outputPath`, `format`, `bitrate` |
| **`extract_thumbnail`** | Grabs a still frame (PNG/JPG) at a timestamp or exact `midpoint`. Inlines base64 image data for AI vision inspection. | `inputPath`, `outputPath`, `timestamp`, `resolution`, `includeBase64` |
| **`compress_video`** | Smart target-size or CRF compressor with Apple Silicon acceleration. Shrinks recordings to fit GitHub PR limits (10MB), Discord (25MB), or email attachments. | `inputPath`, `outputPath`, `targetSizeMB`, `preset`, `crf`, `maxWidth`, `hardwareAcceleration` |
| **`reformat_aspect_ratio`** | Transforms videos into 9:16 vertical reels, 1:1 square, or 4:5 portrait with aesthetic blurred background padding, solid padding, or center crop. | `inputPath`, `outputPath`, `targetRatio`, `mode`, `blurAmount`, `padColor` |
| **`trim_silence`** | Automatically detects and removes dead air or silent pauses from audio recordings, screencasts, and podcasts. | `inputPath`, `outputPath`, `mode`, `thresholdDb`, `minDurationSeconds` |
| **`concat_media`** | Concatenates multiple video/audio clips sequentially. Supports instantaneous lossless stream copy or normalized re-encoding. | `inputPaths`, `outputPath`, `mode` |
| **`generate_waveform`** | Generates a crisp visual PNG audio waveform graphic with custom dimensions and hex colors. Inlines image data for AI vision. | `inputPath`, `outputPath`, `width`, `height`, `color`, `scale`, `includeBase64` |
| **`add_subtitles`** | Embeds subtitles from `.srt` or `.vtt` directly into the video container (`mov_text` for MP4, `srt` for MKV) losslessly. | `videoPath`, `subtitlesPath`, `outputPath`, `language`, `title` |
| **`change_speed`** | Adjusts playback speed (e.g. 2x, 4x timelapse for product demos, 0.5x for slow-mo) with automatic audio pitch normalization. | `inputPath`, `outputPath`, `speed`, `muteAudio` |

---

## Requirements

* **Node.js** >= 18.0.0
* **FFmpeg & FFprobe** installed locally on your system:
  * **macOS:** `brew install ffmpeg`
  * **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install ffmpeg`
  * **Windows:** `winget install Gyan.FFmpeg` or `choco install ffmpeg`

---

## Adding to Antigravity

Add the following to your `~/.gemini/config/mcp_config.json`:

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

## Adding to Claude Desktop

Add the following to your `claude_desktop_config.json`:

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

## Local Development & Testing

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build TypeScript:**
   ```bash
   npm run build
   ```

3. **Run Test Suite:**
   ```bash
   node test-tools.js
   ```

---

## License

MIT © [Ashutos1997](https://github.com/Ashutos1997)
