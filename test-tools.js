import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { probeMedia } from "./dist/tools/probe.js";
import { convertMedia } from "./dist/tools/convert.js";
import { trimMedia } from "./dist/tools/trim.js";
import { extractAudio } from "./dist/tools/audio.js";
import { extractThumbnail } from "./dist/tools/thumbnail.js";
import { compressMedia } from "./dist/tools/compress.js";
import { concatMedia } from "./dist/tools/concat.js";
import { generateWaveform } from "./dist/tools/waveform.js";
import { addSubtitles } from "./dist/tools/subtitles.js";
import { changeSpeed } from "./dist/tools/speed.js";
import { reformatAspectRatio } from "./dist/tools/reformat.js";
import { trimSilence } from "./dist/tools/silence.js";
import { createSplitScreen } from "./dist/tools/split.js";

const execAsync = promisify(execFile);

const testFiles = [
  "./test_input.mp4",
  "./test_input2.mp4",
  "./test_output.webm",
  "./test_output.gif",
  "./test_trimmed.mp4",
  "./test_audio.wav",
  "./test_thumb.png",
  "./test_compressed.mp4",
  "./test_concatenated.mp4",
  "./test_waveform.png",
  "./test_subtitled.mp4",
  "./test_speed.mp4",
  "./test_dummy.srt",
  "./test_reformatted.mp4",
  "./test_silence_cut.mp4",
  "./test_split_screen.mp4"
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

  console.log("Generating synthetic test_input.mp4 (3s)...");
  await execAsync("ffmpeg", [
    "-f", "lavfi", "-i", "testsrc=duration=3:size=640x360:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=1000:duration=3",
    "-c:v", "libx264", "-c:a", "aac",
    "-pix_fmt", "yuv420p",
    "-y", "./test_input.mp4"
  ]);

  // Create second clip
  await execAsync("ffmpeg", [
    "-f", "lavfi", "-i", "testsrc=duration=2:size=640x360:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=800:duration=2",
    "-c:v", "libx264", "-c:a", "aac",
    "-pix_fmt", "yuv420p",
    "-y", "./test_input2.mp4"
  ]);

  // Create dummy SRT for subtitles test
  const dummySrt = "1\n00:00:00,500 --> 00:00:02,500\nHello from FFmpeg MCP Server!\n";
  fs.writeFileSync("./test_dummy.srt", dummySrt, "utf8");

  console.log("=== Testing 1: media_probe ===");
  const probe = await probeMedia("./test_input.mp4");
  console.log("✓ Duration:", probe.format.durationSeconds, "s");

  console.log("\n=== Testing 2: media_convert (Hardware Accel / WebM) ===");
  const conv = await convertMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_output.webm",
    preset: "webm",
  });
  console.log("✓ Converted:", conv.outputPath, "HwAccel:", conv.hardwareAccelerated);

  console.log("\n=== Testing 3: media_convert (GIF) ===");
  const gif = await convertMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_output.gif",
    preset: "gif",
    fps: 10,
  });
  console.log("✓ GIF:", gif.outputPath);

  console.log("\n=== Testing 4: trim_media ===");
  const trim = await trimMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_trimmed.mp4",
    startTime: "00:00:01",
    duration: "1",
  });
  console.log("✓ Trimmed:", trim.outputPath);

  console.log("\n=== Testing 5: extract_audio (Whisper 16kHz WAV) ===");
  const audio = await extractAudio({
    inputPath: "./test_input.mp4",
    outputPath: "./test_audio.wav",
    format: "whisper_wav",
  });
  console.log("✓ Audio:", audio.outputPath);

  console.log("\n=== Testing 6: extract_thumbnail (Multimodal Base64) ===");
  const thumb = await extractThumbnail({
    inputPath: "./test_input.mp4",
    outputPath: "./test_thumb.png",
    timestamp: "midpoint",
  });
  console.log("✓ Thumbnail:", thumb.outputPath, "Base64 Length:", thumb.base64 ? thumb.base64.length : "none");

  console.log("\n=== Testing 7: compress_video (Hardware Accelerated) ===");
  const comp = await compressMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_compressed.mp4",
    preset: "github_pr",
  });
  console.log("✓ Compressed:", comp.outputPath, "Encoder:", comp.encoderUsed, "HwAccel:", comp.hardwareAccelerated);

  console.log("\n=== Testing 8: concat_media ===");
  const concat = await concatMedia({
    inputPaths: ["./test_input.mp4", "./test_input2.mp4"],
    outputPath: "./test_concatenated.mp4",
    mode: "lossless",
  });
  console.log("✓ Concatenated:", concat.outputPath, `(${concat.totalInputs} clips)`);

  console.log("\n=== Testing 9: generate_waveform (Multimodal Base64) ===");
  const wave = await generateWaveform({
    inputPath: "./test_input.mp4",
    outputPath: "./test_waveform.png",
    color: "0x6366f1",
  });
  console.log("✓ Waveform:", wave.outputPath, wave.resolution, "Base64 Length:", wave.base64 ? wave.base64.length : "none");

  console.log("\n=== Testing 10: add_subtitles ===");
  const sub = await addSubtitles({
    videoPath: "./test_input.mp4",
    subtitlesPath: "./test_dummy.srt",
    outputPath: "./test_subtitled.mp4",
    title: "English Subs",
  });
  console.log("✓ Subtitled:", sub.outputPath, `Codec: ${sub.subtitleCodec}`);

  console.log("\n=== Testing 11: change_speed ===");
  const speed = await changeSpeed({
    inputPath: "./test_input.mp4",
    outputPath: "./test_speed.mp4",
    speed: 2.0,
  });
  console.log("✓ Speed adjusted:", speed.outputPath, `${speed.speedMultiplier}x`);

  console.log("\n=== Testing 12: reformat_aspect_ratio ===");
  const reformat = await reformatAspectRatio({
    inputPath: "./test_input.mp4",
    outputPath: "./test_reformatted.mp4",
    targetRatio: "9:16",
    mode: "blur_background",
  });
  console.log("✓ Reformatted:", reformat.outputPath, reformat.resolution, "HwAccel:", reformat.hardwareAccelerated);

  console.log("\n=== Testing 13: trim_silence ===");
  const silence = await trimSilence({
    inputPath: "./test_input.mp4",
    outputPath: "./test_silence_cut.mp4",
    mode: "start_end",
  });
  console.log("✓ Silence trimmed:", silence.outputPath);

  console.log("\n=== Testing 14: create_split_screen (Top/Bottom Stack + Subtitles) ===");
  const split = await createSplitScreen({
    firstVideoPath: "./test_input.mp4",
    secondVideoPath: "./test_input2.mp4",
    outputPath: "./test_split_screen.mp4",
    layout: "vertical_9_16",
    audioSource: "mix",
    subtitlesPath: "./test_dummy.srt",
  });
  console.log("✓ Split Screen Reel:", split.outputPath, split.resolution, `Subtitles: ${split.subtitlesEmbedded}`, `HwAccel: ${split.hardwareAccelerated}`);

  console.log("\n🎉 ALL 14 TEST SUITES (13 TOOLS + INTEGRATIONS) PASSED FLAWLESSLY!");
  cleanup();
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  cleanup();
  process.exit(1);
});
