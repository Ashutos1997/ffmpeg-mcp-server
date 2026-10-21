import { probeMedia } from "./dist/tools/probe.js";
import { convertMedia } from "./dist/tools/convert.js";
import { trimMedia } from "./dist/tools/trim.js";
import { extractAudio } from "./dist/tools/audio.js";
import { extractThumbnail } from "./dist/tools/thumbnail.js";

async function runTests() {
  console.log("=== Testing 1: media_probe ===");
  const probe = await probeMedia("./test_input.mp4");
  console.log("Format:", probe.format);
  console.log("Video Stream:", probe.videoStreams[0]);
  console.log("Audio Stream:", probe.audioStreams[0]);

  console.log("\n=== Testing 2: media_convert (WebM) ===");
  const webm = await convertMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_output.webm",
    preset: "webm",
  });
  console.log(webm);

  console.log("\n=== Testing 3: media_convert (GIF) ===");
  const gif = await convertMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_output.gif",
    preset: "gif",
    fps: 10,
  });
  console.log(gif);

  console.log("\n=== Testing 4: trim_media ===");
  const trim = await trimMedia({
    inputPath: "./test_input.mp4",
    outputPath: "./test_trimmed.mp4",
    startTime: "00:00:01",
    duration: "1",
  });
  console.log(trim);

  console.log("\n=== Testing 5: extract_audio (Whisper 16kHz WAV) ===");
  const audio = await extractAudio({
    inputPath: "./test_input.mp4",
    outputPath: "./test_audio.wav",
    format: "whisper_wav",
  });
  console.log(audio);

  console.log("\n=== Testing 6: extract_thumbnail (Midpoint) ===");
  const thumb = await extractThumbnail({
    inputPath: "./test_input.mp4",
    outputPath: "./test_thumb.png",
    timestamp: "midpoint",
  });
  console.log(thumb);

  console.log("\n ALL 6 TOOLS EXECUTED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
