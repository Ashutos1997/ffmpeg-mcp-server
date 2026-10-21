import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { probeMedia } from "./dist/tools/probe.js";
import { convertMedia } from "./dist/tools/convert.js";
import { trimMedia } from "./dist/tools/trim.js";
import { extractAudio } from "./dist/tools/audio.js";
import { extractThumbnail } from "./dist/tools/thumbnail.js";

const execAsync = promisify(execFile);

const testFiles = [
  "./test_input.mp4",
  "./test_output.webm",
  "./test_output.gif",
  "./test_trimmed.mp4",
  "./test_audio.wav",
  "./test_thumb.png"
];

function cleanup() {
  for (const f of testFiles) {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
}

async function runTests() {
  cleanup();

  console.log("Generating synthetic test_input.mp4 for test suite...");
  await execAsync("ffmpeg", [
    "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=1000:duration=3",
    "-c:v", "libx264", "-c:a", "aac",
    "-pix_fmt", "yuv420p",
    "-y", "./test_input.mp4"
  ]);

  console.log("=== Testing 1: media_probe ===");
  const probe = await probeMedia("./test_input.mp4");
  console.log("Format duration:", probe.format.durationSeconds);
  console.log("Video Stream:", probe.videoStreams[0]?.codec, probe.videoStreams[0]?.resolution);

  console.log("\n=== Testing 2: media_convert (WebM) ===");
  const webm = await convertMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_output.webm",
    preset: "webm",
  });
  console.log(webm.outputPath);

  console.log("\n=== Testing 3: media_convert (GIF) ===");
  const gif = await convertMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_output.gif",
    preset: "gif",
    fps: 10,
  });
  console.log(gif.outputPath);

  console.log("\n=== Testing 4: trim_media ===");
  const trim = await trimMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_trimmed.mp4",
    startTime: "00:00:01",
    duration: "1",
  });
  console.log(trim.outputPath);

  console.log("\n=== Testing 5: extract_audio (Whisper 16kHz WAV) ===");
  const audio = await extractAudio({
    inputPath: "./test_input.mp4",
    outputPath: "./test_audio.wav",
    format: "whisper_wav",
  });
  console.log(audio.outputPath);

  console.log("\n=== Testing 6: extract_thumbnail (Midpoint) ===");
  const thumb = await extractThumbnail({
    inputPath: "./test_input.mp4",
    outputPath: "./test_thumb.png",
    timestamp: "midpoint",
  });
  console.log(thumb.outputPath);

  console.log("\n🎉 ALL 6 TOOLS EXECUTED SUCCESSFULLY!");
  cleanup();
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  cleanup();
  process.exit(1);
});
