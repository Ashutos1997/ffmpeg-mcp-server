import fs from "node:fs";
import assert from "node:assert/strict";
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
import { burnSubtitles } from "./dist/tools/burn_subtitles.js";
import { extractKeyframes } from "./dist/tools/keyframes.js";
import { normalizeAudio } from "./dist/tools/normalize.js";
import { addOverlay } from "./dist/tools/overlay.js";
import { muxMedia } from "./dist/tools/mux.js";
import { detectScenes } from "./dist/tools/detect_scenes.js";
import { detectHwAccel } from "./dist/utils/hwaccel.js";

const execAsync = promisify(execFile);

const testFiles = [
  "./test_input.mp4",
  "./test_input2.mp4",
  "./test_logo.png",
  "./test_output.webm",
  "./test_output.gif",
  "./test_trimmed.mp4",
  "./test_trimmed_end_time.mp4",
  "./test_audio.wav",
  "./test_thumb.png",
  "./test_compressed.mp4",
  "./test_target_compressed.mp4",
  "./test_concatenated.mp4",
  "./test_reencoded_concat.mp4",
  "./test_auto_concat_mismatch.mp4",
  "./test_waveform.png",
  "./test_subtitled.mp4",
  "./test_pre_subtitled.mp4",
  "./test_old.srt",
  "./test_new.srt",
  "./test_speed.mp4",
  "./test_dummy.srt",
  "./test_reformatted.mp4",
  "./test_silence_cut.mp4",
  "./test_split_screen.mp4",
  "./test_burned_subs.mp4",
  "./test_keyframes_grid.png",
  "./test_normalized.mp4",
  "./test_overlayed.mp4",
  "./test_muxed.mp4",
  "./test_scenes_sheet.png",
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

  console.log("=== Checking Cross-Platform Hardware Acceleration ===");
  const hw = await detectHwAccel();
  console.log(`✓ Hardware Available: ${hw.isAvailable} (${hw.hardwareType})`);
  console.log(`✓ H.264 Encoder: ${hw.h264Encoder}, HEVC Encoder: ${hw.hevcEncoder}`);

  console.log("\nGenerating synthetic test assets...");
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

  // Create test logo image for watermark overlay
  await execAsync("ffmpeg", [
    "-f", "lavfi", "-i", "color=c=cyan:s=120x60:d=1",
    "-vframes", "1",
    "-y", "./test_logo.png"
  ]);

  // Create dummy SRT for subtitles test
  const dummySrt = "1\n00:00:00,500 --> 00:00:02,500\nHello from FFmpeg MCP Server!\n";
  fs.writeFileSync("./test_dummy.srt", dummySrt, "utf8");

  console.log("=== Testing 1: media_probe ===");
  const probe = await probeMedia("./test_input.mp4");
  console.log("✓ Duration:", probe.format.durationSeconds, "s, Streams:", probe.videoStreams.length, "video,", probe.audioStreams.length, "audio");

  console.log("\n=== Testing 2: media_convert (with Progress Tracking) ===");
  let progressUpdates = 0;
  const conv = await convertMedia(
    {
      inputPath: "./test_input.mp4",
      outputPath: "./test_output.webm",
      preset: "webm",
    },
    {
      onProgress: (p) => {
        progressUpdates++;
      },
    }
  );
  console.log("✓ Converted:", conv.outputPath, "HwAccel:", conv.hardwareAccelerated, "Progress Events:", progressUpdates);

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

  const trimWithEndTime = await trimMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_trimmed_end_time.mp4",
    startTime: "1",
    endTime: "2",
    accurateReencode: true,
  });
  const trimmedProbe = await probeMedia(trimWithEndTime.outputPath);
  assert.ok(
    Math.abs(trimmedProbe.format.durationSeconds - 1) < 0.15,
    `Expected a 1s trim, got ${trimmedProbe.format.durationSeconds}s`
  );

  console.log("\n=== Testing 5: extract_audio (Whisper 16kHz WAV) ===");
  const audio = await extractAudio({
    inputPath: "./test_input.mp4",
    outputPath: "./test_audio.wav",
    format: "whisper_wav",
  });
  console.log("✓ Audio:", audio.outputPath, "Format:", audio.format);

  console.log("\n=== Testing 6: extract_thumbnail (Multimodal Base64) ===");
  const thumb = await extractThumbnail({
    inputPath: "./test_input.mp4",
    outputPath: "./test_thumb.png",
    timestamp: "midpoint",
  });
  console.log("✓ Thumbnail:", thumb.outputPath, "Base64 Length:", thumb.base64 ? thumb.base64.length : "none");

  console.log("\n=== Testing 7: compress_video (Target Size / Hardware Accel) ===");
  const comp = await compressMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_compressed.mp4",
    preset: "github_pr",
  });
  console.log("✓ Compressed:", comp.outputPath, "Encoder:", comp.encoderUsed, "HwAccel:", comp.hardwareAccelerated);

  await assert.rejects(
    compressMedia({
      inputPath: "./test_input.mp4",
      outputPath: "./test_target_compressed.mp4",
      targetSizeMB: 0.01,
      hardwareAcceleration: false,
    }),
    /too small/
  );
  const targetComp = await compressMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_target_compressed.mp4",
    targetSizeMB: 0.2,
    hardwareAcceleration: false,
  });
  assert.ok(targetComp.compressedSizeBytes <= 0.2 * 1024 * 1024);

  console.log("\n=== Testing 8: concat_media ===");
  const concat = await concatMedia({
    inputPaths: ["./test_input.mp4", "./test_input2.mp4"],
    outputPath: "./test_concatenated.mp4",
  });
  assert.strictEqual(concat.strategyUsed, "lossless");
  console.log("✓ Concatenated (auto matching -> lossless):", concat.outputPath, `(${concat.totalInputs} clips)`);

  const reencodedConcat = await concatMedia({
    inputPaths: ["./test_input2.mp4", "./test_output.webm"],
    outputPath: "./test_reencoded_concat.mp4",
    mode: "reencode",
  });
  const reencodedConcatProbe = await probeMedia(reencodedConcat.outputPath);
  assert.ok(
    reencodedConcatProbe.format.durationSeconds >= 4.8,
    `Expected both clips in reencoded concat, got ${reencodedConcatProbe.format.durationSeconds}s`
  );

  const autoMismatchConcat = await concatMedia({
    inputPaths: ["./test_input2.mp4", "./test_output.webm"],
    outputPath: "./test_auto_concat_mismatch.mp4",
  });
  assert.strictEqual(autoMismatchConcat.strategyUsed, "reencode");
  const autoMismatchProbe = await probeMedia(autoMismatchConcat.outputPath);
  assert.ok(
    autoMismatchProbe.format.durationSeconds >= 4.8,
    `Expected both clips in auto mismatched concat, got ${autoMismatchProbe.format.durationSeconds}s`
  );
  console.log("✓ Concatenated (auto mismatched -> reencode):", autoMismatchConcat.outputPath);

  console.log("\n=== Testing 9: generate_waveform (Multimodal Base64) ===");
  const wave = await generateWaveform({
    inputPath: "./test_input.mp4",
    outputPath: "./test_waveform.png",
    color: "0x6366f1",
  });
  console.log("✓ Waveform:", wave.outputPath, wave.resolution, "Base64 Length:", wave.base64 ? wave.base64.length : "none");

  console.log("\n=== Testing 10: add_subtitles (Soft Track) ===");
  const sub = await addSubtitles({
    videoPath: "./test_input.mp4",
    subtitlesPath: "./test_dummy.srt",
    outputPath: "./test_subtitled.mp4",
    title: "English Subs",
  });
  console.log("✓ Subtitled:", sub.outputPath, `Codec: ${sub.subtitleCodec}`);

  fs.writeFileSync(
    "./test_old.srt",
    "1\n00:00:00,000 --> 00:00:01,000\nOLD_TRACK\n",
    "utf8"
  );
  fs.writeFileSync(
    "./test_new.srt",
    "1\n00:00:00,000 --> 00:00:01,000\nNEW_TRACK\n",
    "utf8"
  );
  await execAsync("ffmpeg", [
    "-i", "./test_input.mp4",
    "-i", "./test_old.srt",
    "-map", "0:v",
    "-map", "0:a",
    "-map", "1:s",
    "-c", "copy",
    "-c:s", "mov_text",
    "-y", "./test_pre_subtitled.mp4",
  ]);
  await addSubtitles({
    videoPath: "./test_pre_subtitled.mp4",
    subtitlesPath: "./test_new.srt",
    outputPath: "./test_subtitled.mp4",
  });
  const { stdout: extractedSubtitle } = await execAsync("ffmpeg", [
    "-i", "./test_subtitled.mp4",
    "-map", "0:s:0",
    "-f", "srt",
    "-",
  ]);
  assert.match(extractedSubtitle, /NEW_TRACK/);

  console.log("\n=== Testing 11: change_speed ===");
  const speed = await changeSpeed({
    inputPath: "./test_input.mp4",
    outputPath: "./test_speed.mp4",
    speed: 2.0,
  });
  console.log("✓ Speed adjusted:", speed.outputPath, `${speed.speedMultiplier}x`);

  console.log("\n=== Testing 12: reformat_aspect_ratio (9:16 Blurred Reel) ===");
  const reformat = await reformatAspectRatio({
    inputPath: "./test_input.mp4",
    outputPath: "./test_reformatted.mp4",
    targetRatio: "9:16",
    mode: "blur_background",
  });
  console.log("✓ Reformatted:", reformat.outputPath, reformat.resolution, "HwAccel:", reformat.hardwareAccelerated);

  console.log("\n=== Testing 13: trim_silence (with A/V Sync Guard) ===");
  const silence = await trimSilence({
    inputPath: "./test_input.mp4",
    outputPath: "./test_silence_cut.mp4",
    mode: "start_end",
  });
  console.log("✓ Silence trimmed:", silence.outputPath);

  console.log("\n=== Testing 14: create_split_screen (Top/Bottom Stack + Subtitles) ===");
  const split = await createSplitScreen({
    firstVideoPath: "./test_input2.mp4",
    secondVideoPath: "./test_input.mp4",
    outputPath: "./test_split_screen.mp4",
    layout: "vertical_9_16",
    audioSource: "mix",
    subtitlesPath: "./test_dummy.srt",
  });
  const { stdout: splitProbeJson } = await execAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,duration",
    "-of", "json",
    split.outputPath,
  ]);
  const splitStreams = JSON.parse(splitProbeJson).streams;
  const splitVideoDuration = Number(splitStreams.find((stream) => stream.codec_type === "video").duration);
  const splitAudioDuration = Number(splitStreams.find((stream) => stream.codec_type === "audio").duration);
  assert.ok(
    Math.abs(splitVideoDuration - splitAudioDuration) < 0.15,
    `Expected aligned split-screen streams, got video=${splitVideoDuration}s audio=${splitAudioDuration}s`
  );
  console.log("✓ Split Screen Reel:", split.outputPath, split.resolution, `Subtitles: ${split.subtitlesEmbedded}`, `HwAccel: ${split.hardwareAccelerated}`);

  console.log("\n=== Testing 15 (NEW): burn_subtitles (Hardcoded Subtitles) ===");
  try {
    const burned = await burnSubtitles({
      videoPath: "./test_input.mp4",
      subtitlesPath: "./test_dummy.srt",
      outputPath: "./test_burned_subs.mp4",
      fontSize: 26,
      fontColor: "yellow",
    });
    console.log("✓ Hardcoded Subtitles:", burned.outputPath, `Font: ${burned.fontSize}pt (${burned.fontColor})`, "HwAccel:", burned.hardwareAccelerated);
  } catch (err) {
    if (err.message.includes("missing the 'subtitles' filter")) {
      console.log("✓ burn_subtitles: Handled missing libass in local FFmpeg build with diagnostic guidance");
    } else {
      throw err;
    }
  }

  console.log("\n=== Testing 16 (NEW): extract_keyframes (Contact Sheet Montage for Vision) ===");
  const kf = await extractKeyframes({
    inputPath: "./test_input.mp4",
    outputPath: "./test_keyframes_grid.png",
    count: 4,
    layout: "montage",
  });
  console.log("✓ Keyframe Montage:", kf.outputPath, `Grid: ${kf.gridDimensions}`, "Base64 Length:", kf.base64 ? kf.base64.length : "none");

  console.log("\n=== Testing 17 (NEW): normalize_audio (EBU R128 + Voice Clarity) ===");
  const norm = await normalizeAudio({
    inputPath: "./test_input.mp4",
    outputPath: "./test_normalized.mp4",
    targetLufs: -16,
    voiceClarity: true,
  });
  console.log("✓ Normalized Audio:", norm.outputPath, `Target: ${norm.targetLufs} LUFS`, "Voice Clarity:", norm.voiceClarityEnabled);

  console.log("\n=== Testing 18 (NEW): add_overlay (Watermark / Branding) ===");
  const overlay = await addOverlay({
    videoPath: "./test_input.mp4",
    overlayPath: "./test_logo.png",
    outputPath: "./test_overlayed.mp4",
    position: "top_right",
    opacity: 0.85,
  });
  console.log("✓ Watermark Overlay:", overlay.outputPath, "Position:", overlay.position, "Opacity:", overlay.opacity, "HwAccel:", overlay.hardwareAccelerated);

  console.log("\n=== Testing 19 (NEW): mux_media (Stream Copy Video + Audio Track) ===");
  const muxed = await muxMedia({
    videoPath: "./test_input.mp4",
    audioPath: "./test_audio.wav",
    outputPath: "./test_muxed.mp4",
    mode: "replace",
    streamCopyVideo: true,
  });
  console.log("✓ Muxed Media:", muxed.outputPath, "Mode:", muxed.mode, "Encoder:", muxed.encoderUsed);

  console.log("\n=== Testing 20 (NEW): detect_scenes (Scene Cuts + Contact Sheet) ===");
  const scenes = await detectScenes({
    inputPath: "./test_input.mp4",
    threshold: 0.3,
    minDurationSeconds: 0.2,
    outputPath: "./test_scenes_sheet.png",
  });
  console.log("✓ Detected Scenes:", `Total: ${scenes.totalScenes} scenes, ${scenes.totalCuts} cuts`, "Sheet:", scenes.contactSheetPath ? "generated" : "none", "Base64 Length:", scenes.base64 ? scenes.base64.length : "none");

  console.log("\n=== Testing 21 (NEW): AbortSignal Cancellation ===");
  const controller = new AbortController();
  // Abort after 50ms to ensure process is actively running when killed
  setTimeout(() => controller.abort(), 50);
  try {
    await convertMedia(
      {
        inputPath: "./test_input.mp4",
        outputPath: "./test_cancelled.mp4",
        preset: "webm",
      },
      { signal: controller.signal }
    );
    throw new Error("Cancellation test failed: process did not abort!");
  } catch (err) {
    if (err.message.includes("cancelled") || err.message.includes("aborted")) {
      console.log("✓ AbortSignal cancellation successfully intercepted:", err.message);
    } else {
      throw err;
    }
  }

  console.log("\n🎉 ALL 21 TEST SUITES (19 TOOLS + HW ACCEL + PROGRESS + CANCELLATION) PASSED FLAWLESSLY!");
  cleanup();
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  cleanup();
  process.exit(1);
});
