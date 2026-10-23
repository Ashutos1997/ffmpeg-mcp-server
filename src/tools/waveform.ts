import fs from "node:fs/promises";
import { z } from "zod";
import { runFfmpeg, ensureFileExists, ensureOutputDir } from "../utils/exec.js";

export const generateWaveformSchema = z.object({
  inputPath: z.string().describe("Path to the audio or video file."),
  outputPath: z.string().describe("Destination path for the PNG image."),
  width: z.number().int().positive().optional().default(1200).describe("Image width in pixels. Default: 1200."),
  height: z.number().int().positive().optional().default(280).describe("Image height in pixels. Default: 280."),
  color: z.string().optional().default("0x6366f1").describe("Waveform color in hex or name (such as '0x6366f1', 'white', or 'black'). Default: '0x6366f1'."),
  scale: z.enum(["lin", "log", "sqrt"]).optional().default("lin").describe("Amplitude scale: 'lin', 'log', or 'sqrt'. Default: 'lin'."),
  includeBase64: z.boolean().optional().default(true).describe("Return base64 image data in the response for vision models. Default: true."),
});

export type GenerateWaveformParams = z.infer<typeof generateWaveformSchema>;

export async function generateWaveform(
  params: GenerateWaveformParams,
  options?: { signal?: AbortSignal }
) {
  const { inputPath, outputPath, width = 1200, height = 280, color = "0x6366f1", scale = "lin", includeBase64 = true } = params;
  const input = await ensureFileExists(inputPath);
  const output = await ensureOutputDir(outputPath);

  const filter = `aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=${color}:scale=${scale}`;

  const args: string[] = [
    "-i", input,
    "-filter_complex", filter,
    "-vframes", "1",
    "-y", output
  ];

  const result = await runFfmpeg(args, { signal: options?.signal });

  let base64: string | undefined;
  if (includeBase64) {
    try {
      const buffer = await fs.readFile(output);
      if (buffer.length < 4 * 1024 * 1024) {
        base64 = buffer.toString("base64");
      }
    } catch {
      // Optional
    }
  }

  return {
    success: true,
    outputPath: output,
    resolution: `${width}x${height}`,
    color,
    commandExecuted: result.command,
    durationSeconds: result.durationSeconds,
    base64,
  };
}
