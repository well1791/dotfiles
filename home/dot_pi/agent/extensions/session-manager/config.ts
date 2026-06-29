// home/dot_pi/agent/extensions/session-manager/config.ts

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SHORTCUTS, DEFAULT_COLORS } from "./constants.ts";
import type { SMConfig, ColorKey } from "./types.ts";

const CONFIG_PATH = join(
  process.env.HOME ?? "~",
  ".pi",
  "agent",
  "session-manager.json",
);

export function loadConfig(notifyError: (msg: string) => void): SMConfig {
  const defaults: SMConfig = {
    shortcuts: { ...DEFAULT_SHORTCUTS } as SMConfig["shortcuts"],
    colors: { ...DEFAULT_COLORS } as SMConfig["colors"],
  };

  if (!existsSync(CONFIG_PATH)) return defaults;

  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);

    if (parsed.shortcuts && typeof parsed.shortcuts === "object") {
      for (const [key, value] of Object.entries(parsed.shortcuts)) {
        if (key in defaults.shortcuts && typeof value === "string") {
          (defaults.shortcuts as Record<string, string>)[key] = value;
        }
      }
    }

    if (parsed.colors && typeof parsed.colors === "object") {
      for (const [key, value] of Object.entries(parsed.colors)) {
        if (key in defaults.colors && typeof value === "string") {
          (defaults.colors as Record<string, string>)[key] = value;
        }
      }
    }

    return defaults;
  } catch (err: any) {
    notifyError(`session-manager: config error — ${err?.message ?? "invalid JSON"}`);
    return defaults;
  }
}

/**
 * Apply a color to text. Supports:
 * - Hex: "#RRGGBB" → 24-bit true color
 * - ANSI 256: "153" → 256 palette
 */
export function colorize(text: string, color: string): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
  }
  return `\x1b[38;5;${color}m${text}\x1b[39m`;
}

/** Resolve a config color key and apply it to text */
export function applyColor(text: string, key: ColorKey, config: SMConfig): string {
  return colorize(text, config.colors[key]);
}
