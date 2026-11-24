import fs from "node:fs";
import path from "node:path";
import os from "node:os";

interface ConfigTarget {
  name: string;
  configPath: string;
  type: "claude_desktop" | "cursor" | "antigravity" | "claude_code";
}

export async function runSetupCli(): Promise<void> {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   🎬 FFmpeg MCP Server - Automatic Client Setup Wizard        ║
║   v0.7.0 • https://github.com/Ashutos1997/ffmpeg-mcp-server   ║
╚═══════════════════════════════════════════════════════════════╝
`);

  const home = os.homedir();
  const platform = os.platform();

  const targets: ConfigTarget[] = [];

  // 1. Claude Desktop
  if (platform === "darwin") {
    targets.push({
      name: "Claude Desktop (macOS)",
      configPath: path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      type: "claude_desktop",
    });
  } else if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    targets.push({
      name: "Claude Desktop (Windows)",
      configPath: path.join(appData, "Claude", "claude_desktop_config.json"),
      type: "claude_desktop",
    });
  } else {
    targets.push({
      name: "Claude Desktop (Linux)",
      configPath: path.join(home, ".config", "Claude", "claude_desktop_config.json"),
      type: "claude_desktop",
    });
  }

  // 2. Cursor
  targets.push({
    name: "Cursor (Global)",
    configPath: path.join(home, ".cursor", "mcp.json"),
    type: "cursor",
  });

  // 3. Antigravity
  targets.push({
    name: "Antigravity (Global)",
    configPath: path.join(home, ".gemini", "config", "mcp_config.json"),
    type: "antigravity",
  });

  // 4. Claude Code
  targets.push({
    name: "Claude Code",
    configPath: path.join(home, ".claude", "mcp.json"),
    type: "claude_code",
  });

  let configuredCount = 0;

  for (const target of targets) {
    const parentDir = path.dirname(target.configPath);
    const parentExists = fs.existsSync(parentDir);
    const fileExists = fs.existsSync(target.configPath);

    if (parentExists || fileExists) {
      try {
        let config: any = {};
        if (fileExists) {
          const raw = fs.readFileSync(target.configPath, "utf8");
          try {
            config = JSON.parse(raw);
          } catch {
            config = {};
          }
        } else {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        if (!config.mcpServers) {
          config.mcpServers = {};
        }

        config.mcpServers["ffmpeg"] = {
          command: "npx",
          args: ["-y", "@ash_j1997/ffmpeg-mcp-server"],
        };

        fs.writeFileSync(target.configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
        console.log(`  ✓ Configured ${target.name} at:\n    ${target.configPath}`);
        configuredCount++;
      } catch (err: any) {
        console.log(`  ⚠ Could not write config for ${target.name}: ${err.message}`);
      }
    }
  }

  if (configuredCount === 0) {
    console.log("No existing AI client directories detected. Creating standard Claude Desktop configuration snippet:");
    const sampleConfig = {
      mcpServers: {
        ffmpeg: {
          command: "npx",
          args: ["-y", "@ash_j1997/ffmpeg-mcp-server"],
        },
      },
    };
    console.log(JSON.stringify(sampleConfig, null, 2));
    console.log("\nAdd this block to your Claude Desktop, Cursor, or Antigravity configuration.");
  } else {
    console.log(`\n🎉 Successfully configured ${configuredCount} AI client(s)!`);
    console.log("Please restart your AI app (Claude Desktop / Cursor / Antigravity) to activate 20 FFmpeg tools.\n");
  }
}

if (process.argv[1] && process.argv[1].endsWith("setup.js")) {
  runSetupCli().catch(console.error);
}
