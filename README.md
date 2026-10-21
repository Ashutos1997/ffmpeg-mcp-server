# ffmpeg-mcp-server

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
      "args": ["/Users/ashj/Desktop/Projects/Test Folder/dist/index.js"]
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
      "args": ["/ABSOLUTE/PATH/TO/Test Folder/dist/index.js"]
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
      "args": ["-y", "ffmpeg-mcp-server"]
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
