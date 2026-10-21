import { z } from "zod";
import { runFfmpeg, ensureFileExists, ensureOutputDir } from "../utils/exec.js";

export const generateWaveformSchema = z.object({
  inputPath: z.string().describe("Path to audio or video file"),
  outputPath: z.string().describe("Target output image path (typically .png)"),
  width: z.number().int().positive().optional().default(1200).describe("Waveform image width in pixels"),
  height: z.number().int().positive().optional().default(280).describe("Waveform image height in pixels"),
  color: z.string().optional().default("0x6366f1").describe("Waveform color in hex format (e.g. 0x6366f1, 0x10b981, white, red)"),
  scale: z.enum(["lin", "log", "sqrt"]).optional().default("lin").describe("Waveform amplitude scale"),
});

export type GenerateWaveformParams = z.infer<typeof generateWaveformSchema>;

export async function generateWaveform(params: GenerateWaveformParams) {
  const { inputPath, outputPath, width = 1200, height = 280, color = "0x6366f1", scale = "lin" } = params;
  const input = await ensureFileExists(inputPath);
  const output = await ensureOutputDir(outputPath);

  const filter = `aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=${color}:scale=${scale}`;

  const args: string[] = [
    "-i", input,
    "-filter_complex", filter,
    "-vframes", "1",
    "-y", output
  ];

  const result = await runFfmpeg(args);

  return {
    success: true,
    outputPath: output,
    resolution: `${width}x${height}`,
    color,
    commandExecuted: result.command,
    durationSeconds: result.durationSeconds,
  };
}
