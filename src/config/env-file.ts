/**
 * Agent-Venom environment-file helpers.
 *
 * The env file stores AGENT_VENOM_API_KEY for use by runtimes launched through
 * the shell. On Linux and WSL it is a POSIX shell source file (export KEY=VAL).
 * On Windows-native the key is written to the machine environment with setx so
 * no file needs to be sourced; this module still provides a read path for
 * bootstrapping the CLI's own process.
 *
 * Security rules:
 * - The key value is NEVER written to logs or stdout.
 * - The file is written atomatically with mode 0o600.
 * - setx is called through execFile argument arrays, never shell interpolation.
 */

import { execFile } from "node:child_process"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import type { EnvironmentKind } from "../core/contracts.js"

const execFileAsync = promisify(execFile)

// The canonical env-var name. Never changes.
export const API_KEY_ENV_VAR = "AGENT_VENOM_API_KEY"

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Returns the path for the agent-venom-env file for the given environment.
 * Windows-native does not use a file; callers may still read this path to check
 * for a legacy value, but writing is done via setx on that platform.
 */
export function resolveEnvFilePath(
  envKind: EnvironmentKind,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (envKind === "windows-native") {
    // Not normally written as a file on Windows-native, but provide a path for
    // diagnostic purposes (e.g., legacy check).
    const root = env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
    return join(root, "Agent-Venom", "agent-venom-env")
  }

  if (envKind === "windows-wsl") {
    // The WSL side reads this file; Linux path inside WSL.
    const stateRoot = env.XDG_STATE_HOME || join(homedir(), ".local", "state")
    return join(stateRoot, "agent-venom", "agent-venom-env")
  }

  // linux-desktop, linux-headless
  const stateRoot = env.XDG_STATE_HOME || join(homedir(), ".local", "state")
  return join(stateRoot, "agent-venom", "agent-venom-env")
}

// ---------------------------------------------------------------------------
// Writing credentials
// ---------------------------------------------------------------------------

/**
 * Persist the API key for the given environment.
 *
 * - Windows-native: uses setx for permanent machine-level persistence.
 * - Linux / WSL: writes a POSIX shell source file with mode 0o600.
 *
 * The value is NEVER passed to a shell command string; only argument arrays
 * are used.
 */
export async function writeAgentVenomEnv(
  envKind: EnvironmentKind,
  apiKey: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (!apiKey.trim()) {
    throw new Error("API key must not be empty")
  }

  if (envKind === "windows-native") {
    // setx writes to HKCU\Environment; the key survives new shells.
    // We do NOT pass the key via shell; execFile takes argument arrays.
    await execFileAsync("setx", [API_KEY_ENV_VAR, apiKey], { windowsHide: true })
    return
  }

  const filePath = resolveEnvFilePath(envKind, env)
  await writeEnvFileAtomic(filePath, apiKey)
}

/**
 * Write (or update) the POSIX shell source file atomatically with mode 0o600.
 * The file content is:
 *
 *   # Written by agent-venom. Do not commit this file.
 *   export AGENT_VENOM_API_KEY=<value>
 *
 * Only POSIX-safe characters are checked; the key is treated as opaque bytes.
 */
async function writeEnvFileAtomic(filePath: string, apiKey: string): Promise<void> {
  const directory = dirname(filePath)
  await mkdir(directory, { recursive: true })

  const content = [
    "# Written by agent-venom. Do not commit this file.",
    `export ${API_KEY_ENV_VAR}=${shellEscape(apiKey)}`,
    ""
  ].join("\n")

  const tmpPath = join(directory, `.${Date.now()}-${process.pid}.env.tmp`)
  await writeFile(tmpPath, content, { encoding: "utf8", mode: 0o600 })
  await rename(tmpPath, filePath)
}

/**
 * Minimal shell-escaping for the env-file value.
 * Wraps in single quotes and escapes embedded single quotes.
 */
function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

// ---------------------------------------------------------------------------
// Reading credentials
// ---------------------------------------------------------------------------

/**
 * Attempt to load AGENT_VENOM_API_KEY from the env file into the current
 * process.env. Does nothing if the file does not exist or the variable is
 * already set. Never logs the value.
 */
export async function loadAgentVenomEnv(
  filePath: string
): Promise<boolean> {
  if (process.env[API_KEY_ENV_VAR]) {
    // Already set (e.g., from shell or setx); no need to read file.
    return true
  }

  let content: string
  try {
    content = await readFile(filePath, "utf8")
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false
    }
    throw error
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    // Match: export KEY='value' or export KEY=value (unquoted)
    const match = /^export\s+([A-Z_][A-Z0-9_]*)=(.*)$/.exec(trimmed)
    if (!match) continue

    const key = match[1]
    const rawValue = match[2]?.trim() ?? ""

    // Never log the value
    if (key === API_KEY_ENV_VAR) {
      const value = unquote(rawValue)
      if (value) {
        process.env[API_KEY_ENV_VAR] = value
        return true
      }
    }
  }

  return false
}

/**
 * Strip surrounding single or double quotes from a shell value.
 */
function unquote(raw: string): string {
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return raw.slice(1, -1).replace(/'\\''/g, "'")
  }
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return raw.slice(1, -1)
  }
  return raw
}
