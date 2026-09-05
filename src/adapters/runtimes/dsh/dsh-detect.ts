import { execFile } from "node:child_process"
import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface DshPaths {
  binaryPath: string | undefined
  dshHome: string
  settingsPath: string
  installMethod: "npm" | "unknown"
}

/**
 * Detect DSH paths across platforms.
 *
 * Known locations:
 * - Windows: %LOCALAPPDATA%\Programs\DSH\dsh.exe, npm global bin
 * - Linux: ~/.local/bin/dsh, /usr/local/bin/dsh
 * - DSH_HOME defaults to ~/.dsh
 */
export async function detectDshPaths(): Promise<DshPaths> {
  const platform = process.platform
  const home = homedir()
  const dshHome = process.env.DSH_HOME || join(home, ".dsh")
  const settingsPath = join(dshHome, "settings.yaml")

  let binaryPath: string | undefined
  let installMethod: "npm" | "unknown" = "unknown"

  if (platform === "win32") {
    // Check npm global bin
    const npmGlobal = await getNpmGlobalDir()
    const npmBin = join(npmGlobal, "dsh.cmd")
    if (await fileExists(npmBin)) {
      binaryPath = npmBin
      installMethod = "npm"
    }

    // Try `where dsh` as fallback
    if (!binaryPath) {
      try {
        const result = await execFileAsync("where", ["dsh"], {
          timeout: 5000,
          windowsHide: true
        })
        const firstLine = result.stdout.trim().split("\n")[0]
        if (firstLine && await fileExists(firstLine.trim())) {
          binaryPath = firstLine.trim()
          installMethod = "npm"
        }
      } catch {}
    }
  } else {
    // Linux / macOS
    const localBin = join(home, ".local", "bin", "dsh")
    if (await fileExists(localBin)) {
      binaryPath = localBin
      installMethod = "npm"
    }

    if (!binaryPath) {
      const usrLocalBin = "/usr/local/bin/dsh"
      if (await fileExists(usrLocalBin)) {
        binaryPath = usrLocalBin
        installMethod = "npm"
      }
    }

    if (!binaryPath) {
      try {
        const result = await execFileAsync("which", ["dsh"], {
          timeout: 5000,
          windowsHide: true
        })
        const path = result.stdout.trim().split("\n")[0]
        if (path && await fileExists(path)) {
          binaryPath = path
          installMethod = "npm"
        }
      } catch {}
    }
  }

  return { binaryPath, dshHome, settingsPath, installMethod }
}

/**
 * Detect DSH paths inside WSL.
 */
export async function detectDshPathsWsl(): Promise<DshPaths> {
  const dshHome = join("~", ".dsh")
  const settingsPath = join(dshHome, "settings.yaml")
  let binaryPath: string | undefined
  let installMethod: "npm" | "unknown" = "unknown"

  try {
    const { runWslCommand } = await import("../../platforms/wsl.js")
    const result = await runWslCommand("bash", [
      "-c",
      "if [ -f ~/.bashrc ]; then . ~/.bashrc; fi; which dsh 2>/dev/null || true"
    ], { timeout: 5000 })
    const path = result.stdout.trim().split("\n")[0]
    if (path && path !== "") {
      binaryPath = `wsl:${path}`
      installMethod = "npm"
    }
  } catch {}

  return { binaryPath, dshHome, settingsPath, installMethod }
}

/**
 * Read DSH settings.yaml.
 */
export async function readDshSettings(settingsPath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const content = await readFile(settingsPath, "utf8")
    // Simple YAML-like parse for settings (not full YAML parser)
    // For now, return the raw content wrapped in an object
    return { raw: content }
  } catch {
    return undefined
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function getNpmGlobalDir(): Promise<string> {
  try {
    const result = await execFileAsync("npm", ["prefix", "-g"], {
      timeout: 5000,
      windowsHide: true
    })
    return result.stdout.trim()
  } catch {
    return join(homedir(), "AppData", "Roaming", "npm")
  }
}
