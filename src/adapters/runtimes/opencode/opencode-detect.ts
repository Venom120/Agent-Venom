import { execFile } from "node:child_process"
import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface OpenCodePaths {
  /** Resolved path to the opencode binary, or undefined if not found. */
  binaryPath: string | undefined
  /** The config directory (e.g., ~/.config/opencode on Linux, %USERPROFILE%\.config\opencode on Windows). */
  configDir: string
  /** The data directory (e.g., ~/.local/share/opencode on Linux, %USERPROFILE%\.local\share on Windows). */
  dataDir: string
  /** The cache directory (e.g., ~/.cache/opencode on Linux, %USERPROFILE%\.cache\opencode on Windows). */
  cacheDir: string
  /** The detected install method. */
  installMethod: "irm" | "npm" | "unknown"
}

/**
 * Detect OpenCode paths across platforms and installation methods.
 *
 * Known installation methods:
 * - Windows irm: C:\Users\<user>\AppData\Local\Programs\OpenCode\opencode.exe
 * - Windows npm: <npm-global-prefix>\opencode.cmd
 * - Linux: ~/.local/bin/opencode or /usr/local/bin/opencode
 * - WSL: same as Linux but accessed through wsl.exe
 */
export async function detectOpenCodePaths(): Promise<OpenCodePaths> {
  const platform = process.platform
  const home = homedir()

  let binaryPath: string | undefined
  let installMethod: "irm" | "npm" | "unknown" = "unknown"

  if (platform === "win32") {
    // Check Windows-specific locations
    // 1. Check irm install location
    const irmPath = join(home, "AppData", "Local", "Programs", "OpenCode", "opencode.exe")
    if (await fileExists(irmPath)) {
      binaryPath = irmPath
      installMethod = "irm"
    }

    // 2. Check npm global bin
    if (!binaryPath) {
      const npmGlobal = await getNpmGlobalDir()
      const npmBin = join(npmGlobal, "opencode.cmd")
      if (await fileExists(npmBin)) {
        binaryPath = npmBin
        installMethod = "npm"
      }
    }

    // 3. Try `where opencode` as fallback
    if (!binaryPath) {
      try {
        const result = await execFileAsync("where", ["opencode"], {
          timeout: 5000,
          windowsHide: true
        })
        const firstLine = result.stdout.trim().split("\n")[0]
        if (firstLine && await fileExists(firstLine.trim())) {
          binaryPath = firstLine.trim()
          installMethod = firstLine.includes("Programs\\OpenCode") ? "irm" : "npm"
        }
      } catch {}
    }

    return {
      binaryPath,
      configDir: join(home, ".config", "opencode"),
      dataDir: join(home, ".local", "share"),
      cacheDir: join(home, ".cache", "opencode"),
      installMethod
    }
  }

  // Linux / macOS
  // 1. Check ~/.local/bin/opencode
  const localBin = join(home, ".local", "bin", "opencode")
  if (await fileExists(localBin)) {
    binaryPath = localBin
    installMethod = "npm"
  }

  // 2. Check /usr/local/bin/opencode
  if (!binaryPath) {
    const usrLocalBin = "/usr/local/bin/opencode"
    if (await fileExists(usrLocalBin)) {
      binaryPath = usrLocalBin
      installMethod = "npm"
    }
  }

  // 3. Try `which opencode` as fallback
  if (!binaryPath) {
    try {
      const result = await execFileAsync("which", ["opencode"], {
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

  const xdgConfigHome = process.env.XDG_CONFIG_HOME || join(home, ".config")
  const xdgDataHome = process.env.XDG_DATA_HOME || join(home, ".local", "share")
  const xdgCacheHome = process.env.XDG_CACHE_HOME || join(home, ".cache")

  return {
    binaryPath,
    configDir: join(xdgConfigHome, "opencode"),
    dataDir: join(xdgDataHome, "opencode"),
    cacheDir: join(xdgCacheHome, "opencode"),
    installMethod
  }
}

/**
 * Detect OpenCode paths inside WSL by probing the WSL environment.
 */
export async function detectOpenCodePathsWsl(): Promise<OpenCodePaths> {
  const home = "~"
  let binaryPath: string | undefined
  let installMethod: "irm" | "npm" | "unknown" = "unknown"

  // Check WSL via bash -lc 'which opencode'
  try {
    const { runWslCommand } = await import("../../platforms/wsl.js")
    const result = await runWslCommand("bash", [
      "-c",
      "if [ -f ~/.bashrc ]; then . ~/.bashrc; fi; which opencode 2>/dev/null || true"
    ], { timeout: 5000 })
    const path = result.stdout.trim().split("\n")[0]
    if (path && path !== "") {
      // Convert WSL path to something we can reference
      binaryPath = `wsl:${path}`
      installMethod = "npm"
    }
  } catch {}

  return {
    binaryPath,
    configDir: join(home, ".config", "opencode"),
    dataDir: join(home, ".local", "share", "opencode"),
    cacheDir: join(home, ".cache", "opencode"),
    installMethod
  }
}

/**
 * Read the OpenCode config file (opencode.json or opencode.jsonc).
 */
export async function readOpenCodeConfig(configDir: string): Promise<Record<string, unknown> | undefined> {
  const jsoncPath = join(configDir, "opencode.jsonc")
  const jsonPath = join(configDir, "opencode.json")

  let content: string | undefined
  try {
    content = await readFile(jsoncPath, "utf8")
  } catch {
    try {
      content = await readFile(jsonPath, "utf8")
    } catch {
      return undefined
    }
  }

  // Strip comments for JSONC
  const stripped = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
  try {
    return JSON.parse(stripped)
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
    // Fallback to common Windows location
    return join(homedir(), "AppData", "Roaming", "npm")
  }
}
