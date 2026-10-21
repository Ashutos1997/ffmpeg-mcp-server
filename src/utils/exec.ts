import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a command using spawn, capturing stdout and stderr.
 */
export async function runCommand(
  command: string,
  args: string[]
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer | string) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer | string) => {
      stderr += data.toString();
    });

    child.on("error", (error: Error) => {
      reject(new Error(`Failed to launch ${command}: ${error.message}`));
    });

    child.on("close", (code: number | null) => {
      const exitCode = code ?? 0;
      if (exitCode !== 0) {
        reject(
          new Error(
            `${command} exited with code ${exitCode}:\n${stderr || stdout}`
          )
        );
      } else {
        resolve({ stdout, stderr, exitCode });
      }
    });
  });
}

/**
 * Convenience wrapper for running ffmpeg commands with execution timing.
 */
export async function runFfmpeg(args: string[]): Promise<{ command: string; stdout: string; stderr: string; durationSeconds: number }> {
  const startTime = Date.now();
  const res = await runCommand("ffmpeg", args);
  const durationSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));
  return {
    command: `ffmpeg ${args.join(" ")}`,
    stdout: res.stdout,
    stderr: res.stderr,
    durationSeconds,
  };
}

/**
 * Validates that an input file exists and is accessible.
 */
export async function ensureFileExists(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      throw new Error(`Path is not a regular file: ${resolved}`);
    }
    return resolved;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`Input file not found: ${resolved}`);
    }
    throw err;
  }
}

/**
 * Ensures parent directory exists before writing output file.
 */
export async function ensureOutputDir(outputPath: string): Promise<string> {
  const resolved = path.resolve(outputPath);
  const dir = path.dirname(resolved);
  await fs.mkdir(dir, { recursive: true });
  return resolved;
}
