import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
}

export interface FfmpegProgress {
  percent?: number;
  timeSeconds?: number;
  speed?: string;
  frame?: number;
  fps?: number;
  isEnd?: boolean;
}

export interface FfmpegOptions extends CommandOptions {
  expectedDurationSeconds?: number;
  onProgress?: (progress: FfmpegProgress) => void;
}

/**
 * Execute a command using spawn, capturing stdout and stderr with cancellation and timeout support.
 */
export async function runCommand(
  command: string,
  args: string[],
  options?: CommandOptions
): Promise<ExecResult> {
  if (options?.signal?.aborted) {
    throw new Error(`Command cancelled before launch: ${command}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args);

    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let timer: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (options?.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    };

    const onAbort = () => {
      isCancelled = true;
      try {
        child.kill("SIGTERM");
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {}
        }, 1500);
      } catch {}
    };

    if (options?.signal) {
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    if (options?.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        isCancelled = true;
        try {
          child.kill("SIGTERM");
          setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {}
          }, 1500);
        } catch {}
        cleanup();
        reject(new Error(`Command timed out after ${options.timeoutMs}ms: ${command}`));
      }, options.timeoutMs);
    }

    child.stdout.on("data", (data: Buffer | string) => {
      const str = data.toString();
      stdout += str;

      if (options?.onStdoutLine) {
        stdoutBuffer += str;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || "";
        for (const line of lines) {
          options.onStdoutLine(line);
        }
      }
    });

    child.stderr.on("data", (data: Buffer | string) => {
      const str = data.toString();
      stderr += str;

      if (options?.onStderrLine) {
        stderrBuffer += str;
        const lines = stderrBuffer.split(/\r?\n/);
        stderrBuffer = lines.pop() || "";
        for (const line of lines) {
          options.onStderrLine(line);
        }
      }
    });

    child.on("error", (error: Error) => {
      cleanup();
      reject(new Error(`Failed to launch ${command}: ${error.message}`));
    });

    child.on("close", (code: number | null) => {
      cleanup();

      if (options?.onStdoutLine && stdoutBuffer.length > 0) {
        options.onStdoutLine(stdoutBuffer);
      }
      if (options?.onStderrLine && stderrBuffer.length > 0) {
        options.onStderrLine(stderrBuffer);
      }

      if (isCancelled || options?.signal?.aborted) {
        reject(new Error(`FFmpeg operation was cancelled by client.`));
        return;
      }

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
 * Convenience wrapper for running ffmpeg commands with execution timing,
 * progress tracking (-progress pipe:1), and cancellation.
 */
export async function runFfmpeg(
  args: string[],
  options?: FfmpegOptions
): Promise<{ command: string; stdout: string; stderr: string; durationSeconds: number }> {
  const startTime = Date.now();
  const effectiveArgs = [...args];

  let currentProgress: FfmpegProgress = {};

  const onStdoutLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const [key, value] = trimmed.split("=");
    if (!key || value === undefined) return;

    if (key === "frame") {
      const frameNum = parseInt(value, 10);
      if (!isNaN(frameNum)) currentProgress.frame = frameNum;
    } else if (key === "fps") {
      const fpsNum = parseFloat(value);
      if (!isNaN(fpsNum)) currentProgress.fps = fpsNum;
    } else if (key === "speed") {
      currentProgress.speed = value.trim();
    } else if (key === "out_time_us") {
      const us = parseInt(value, 10);
      if (!isNaN(us)) {
        currentProgress.timeSeconds = Number((us / 1_000_000).toFixed(2));
        if (options?.expectedDurationSeconds && options.expectedDurationSeconds > 0) {
          const pct = Math.min(
            100,
            Math.max(0, Math.round((currentProgress.timeSeconds / options.expectedDurationSeconds) * 100))
          );
          currentProgress.percent = pct;
        }
      }
    } else if (key === "progress") {
      if (value === "end") {
        currentProgress.isEnd = true;
        if (options?.expectedDurationSeconds) {
          currentProgress.percent = 100;
        }
      }
      if (options?.onProgress) {
        options.onProgress({ ...currentProgress });
      }
    }
  };

  // If progress callback provided, inject -progress pipe:1 before output arguments
  if (options?.onProgress && !effectiveArgs.includes("-progress")) {
    effectiveArgs.unshift("-progress", "pipe:1");
  }

  const res = await runCommand("ffmpeg", effectiveArgs, {
    ...options,
    onStdoutLine: options?.onProgress ? onStdoutLine : options?.onStdoutLine,
  });

  const durationSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));
  return {
    command: `ffmpeg ${effectiveArgs.join(" ")}`,
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
