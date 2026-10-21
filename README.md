# ffmpeg-mcp-server

[![CI](https://github.com/Ashutos1997/ffmpeg-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/Ashutos1997/ffmpeg-mcp-server/actions) [![Release](https://img.shields.io/github/v/release/Ashutos1997/ffmpeg-mcp-server?color=blue)](https://github.com/Ashutos1997/ffmpeg-mcp-server/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE) [![MCP Standard](https://img.shields.io/badge/MCP-Standard-purple.svg)](https://modelcontextprotocol.io)

A deterministic, rock-solid **Model Context Protocol (MCP)** server that gives AI coding agents (Claude Desktop, Cursor, Antigravity) structured tools to inspect, convert, trim, and process video and audio using local `ffmpeg` and `ffprobe`.

---

## Why This Exists

When AI agents are asked to process media, they frequently hallucinate invalid FFmpeg flags, syntax errors, or incompatible pixel formats. 

**`ffmpeg-mcp-server`** solves this by providing strongly-typed, schema-validated tools using Zod. The AI simply passes clean parameters (e.g., `{ inputPath: "video.mov", preset: "web_mp4" }`), and the server generates and executes the exact, optimal FFmpeg command locally on your machine.

---

## Included Tools

| Tool | Description | Key Parameters |
| :--- | :--- | :--- |
| **`media_probe`** | Inspects any audio/video container using `ffprobe`. Returns clean JSON with codecs, resolution, duration, bitrate, and streams. | `inputPath` |
| **`media_convert`** | Converts video/audio with rock-solid presets: `web_mp4` (universal H.264/yuv420p/faststart), `webm` (VP9/Opus), `gif` (2-pass palette generation), or custom CRF/resolution. | `inputPath`, `outputPath`, `preset`, `crf`, `resolution`, `fps` |
| **`trim_media`** | Trims media clips. Uses instantaneous lossless stream copy (`-c copy`) by default, or frame-accurate re-encoding. | `inputPath`, `outputPath`, `startTime`, `endTime`, `duration`, `accurateReencode` |
| **`extract_audio`** | Rips audio tracks from video. Includes `whisper_wav` preset (16kHz mono PCM) optimized for speech-to-text models like Whisper, plus `mp3`, `aac`, and `flac`. | `inputPath`, `outputPath`, `format`, `bitrate` |
| **`extract_thumbnail`** | Grabs a still image (PNG/JPG) at a specific timestamp, scaled resolution, or automatically calculates the exact `midpoint` of the video. | `inputPath`, `outputPath`, `timestamp`, `resolution` |
| **`compress_video`** | Smart target-size or CRF compressor. Shrinks recordings to fit GitHub PR limits (10MB), Discord (25MB), or email attachments. | `inputPath`, `outputPath`, `targetSizeMB`, `preset`, `crf`, `maxWidth` |
| **`concat_media`** | Concatenates multiple video/audio clips sequentially. Supports instantaneous lossless stream copy or normalized re-encoding. | `inputPaths`, `outputPath`, `mode` |
| **`generate_waveform`** | Generates a crisp visual PNG audio waveform graphic with custom dimensions and hex colors. Perfect for audio cards/UI. | `inputPath`, `outputPath`, `width`, `height`, `color`, `scale` |
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

Or, if published / linked via npm:
```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "npx",
      "args": ["-y", "@ashutos1997/ffmpeg-mcp-server"]
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

3. **Run the automated test suite:**
   ```bash
   node test-tools.js
   ```

---

## License

MIT
