import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { resolveOpenCodeConfigPath } from "../adapters/runtimes/opencode/config-paths.js"

const execFileAsync = promisify(execFile)

// Directories to keep from the Agent-Venom repo for OpenCode plugin loading.
// The plugin loader (load-agents.ts) reads agents/ via import.meta.url.
// dist/ contains the compiled plugin entry. package.json declares the main field.
const OPENCODE_DIRS = ["agents", "dist"]

// Directories to exclude from the clone (not needed for OpenCode plugin).
const EXCLUDE_DIRS = [
  "node_modules",
  ".git",
  "src",
  "scripts",
  "tests",
  "docs",
  "tray",
  "profiles",
  "runtimes",
  "adapters",
  ".vscode",
]

export interface PluginFetchOptions {
  /** Ref to checkout (branch, tag, commit). Defaults to "main". */
  ref?: string
  /** Force re-fetch even if cache already exists. */
  force?: boolean
  /** Write status messages to this callback. */
  log?: (msg: string) => void
}

/**
 * Resolve the OpenCode cache directory for a git-based plugin entry.
 *
 * OpenCode stores git plugins at:
 *   ~/.cache/opencode/packages/<name>@git+https:/<path>#<ref>
 *
 * The URL's `://` is stripped to a single `:` for the filesystem path.
 */
export function resolvePluginCacheDir(pluginEntry: string): string | null {
  // Extract the plugin name before the @
  const atIndex = pluginEntry.indexOf("@")
  if (atIndex <= 0) return null

  const name = pluginEntry.slice(0, atIndex)
  const rest = pluginEntry.slice(atIndex + 1)

  // Convert git URL to cache path: "git+https://github.com/..." -> "git+https:/github.com/..."
  // OpenCode strips one slash from :// -> :/
  const cachePath = rest.replace("://", ":/")

  return join(homedir(), ".cache", "opencode", "packages", `${name}@${cachePath}`)
}

/**
 * Resolve the ref from a plugin entry string like "agent-venom@git+https://...#main".
 */
function resolveRef(pluginEntry: string): string {
  const hashIndex = pluginEntry.lastIndexOf("#")
  if (hashIndex > 0) {
    const afterHash = pluginEntry.slice(hashIndex + 1)
    if (afterHash) return afterHash
  }
  return "main"
}

/**
 * Resolve the git URL from a plugin entry string like "agent-venom@git+https://github.com/Venom120/Agent-Venom.git#main".
 */
function resolveGitUrl(pluginEntry: string): string | null {
  const atIndex = pluginEntry.indexOf("@")
  if (atIndex <= 0) return null

  let rest = pluginEntry.slice(atIndex + 1)

  // Remove trailing #ref
  const hashIndex = rest.lastIndexOf("#")
  if (hashIndex > 0) rest = rest.slice(0, hashIndex)

  // Convert "git+https://..." to "https://..."
  if (rest.startsWith("git+")) rest = rest.slice(4)

  return rest
}

/**
 * Resolve the GitHub tarball URL for a given repo URL and ref.
 * Falls back to git clone if the URL doesn't match github.com.
 */
function resolveTarballUrl(gitUrl: string, ref: string): string | null {
  // Match github.com URLs
  const m = gitUrl.match(/https:\/\/github\.com\/([^/]+)\/([^/.]+)/)
  if (!m) return null

  const owner = m[1]
  const repo = m[2]
  return `https://github.com/${owner}/${repo}/archive/refs/heads/${ref}.tar.gz`
}

/**
 * Fetch the Agent-Venom plugin files into OpenCode's cache directory.
 *
 * Strategy:
 * 1. Try GitHub tarball download (fast, no git dependency).
 * 2. Fall back to git clone with sparse-checkout if tarball fails.
 * 3. Fall back to full git clone as last resort.
 *
 * Only the directories needed for OpenCode plugin loading are copied:
 * agents/, dist/, package.json, README.md.
 */
export async function syncPluginToCache(
  pluginEntry: string,
  options: PluginFetchOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  const log = options.log ?? (() => {})
  const ref = options.ref ?? resolveRef(pluginEntry)
  const gitUrl = resolveGitUrl(pluginEntry)

  if (!gitUrl) {
    return { ok: false, error: `Cannot parse git URL from plugin entry: ${pluginEntry}` }
  }

  const cacheDir = resolvePluginCacheDir(pluginEntry)
  if (!cacheDir) {
    return { ok: false, error: `Cannot resolve cache dir from plugin entry: ${pluginEntry}` }
  }

  // Already cached and not forcing re-fetch
  if (!options.force && existsSync(cacheDir)) {
    // Check if the cache has the essential files
    const hasPackageJson = existsSync(join(cacheDir, "package.json"))
    const hasDist = existsSync(join(cacheDir, "dist"))
    const hasAgents = existsSync(join(cacheDir, "agents"))
    if (hasPackageJson && hasDist && hasAgents) {
      log(`[agent-venom] plugin cache exists, skipping fetch: ${cacheDir}`)
      return { ok: true }
    }
    log(`[agent-venom] plugin cache incomplete, re-fetching: ${cacheDir}`)
  }

  log(`[agent-venom] fetching plugin from ${gitUrl} (ref: ${ref})...`)

  // Strategy 1: GitHub tarball download
  const tarballUrl = resolveTarballUrl(gitUrl, ref)
  if (tarballUrl) {
    const result = await fetchViaTarball(tarballUrl, cacheDir, log)
    if (result.ok) return result
    log(`[agent-venom] tarball download failed, trying git clone...`)
  }

  // Strategy 2: Git sparse-checkout (only needed dirs)
  const result = await fetchViaSparseClone(gitUrl, ref, cacheDir, log)
  if (result.ok) return result

  // Strategy 3: Full git clone
  log(`[agent-venom] sparse checkout failed, trying full clone...`)
  return await fetchViaFullClone(gitUrl, ref, cacheDir, log)
}

async function fetchViaTarball(
  url: string,
  cacheDir: string,
  log: (msg: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  // Use a temp dir OUTSIDE cacheDir so rmSync(cacheDir) doesn't destroy our source files
  const tmpDir = cacheDir + ".tmp-tarball"

  try {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })

    // Download and extract tarball
    await execFileAsync("curl", [
      "-fsSL",
      url,
      "-o",
      join(tmpDir, "repo.tar.gz"),
    ], { timeout: 60_000 })

    await execFileAsync("tar", [
      "-xzf",
      join(tmpDir, "repo.tar.gz"),
      "-C",
      tmpDir,
    ], { timeout: 30_000 })

    // Find the extracted directory (github tarballs extract to <repo>-<ref>/)
    const entries = readdirSync(tmpDir).filter(
      (e: string) => e !== "repo.tar.gz" && e !== ".",
    )

    if (entries.length === 0) {
      return { ok: false, error: "Tarball extraction produced no files" }
    }

    const extractedDir = join(tmpDir, entries[0]!)

    // Create cache dir and copy needed directories
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true })
    mkdirSync(cacheDir, { recursive: true })

    for (const dir of OPENCODE_DIRS) {
      const src = join(extractedDir, dir)
      if (existsSync(src)) {
        cpSync(src, join(cacheDir, dir), { recursive: true })
      }
    }

    // Copy package.json and README.md
    for (const file of ["package.json", "README.md"]) {
      const src = join(extractedDir, file)
      if (existsSync(src)) {
        cpSync(src, join(cacheDir, file))
      }
    }

    log(`[agent-venom] plugin fetched via tarball -> ${cacheDir}`)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: `Tarball fetch failed: ${err?.message || err}` }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function fetchViaSparseClone(
  gitUrl: string,
  ref: string,
  cacheDir: string,
  log: (msg: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  // Use a temp dir OUTSIDE cacheDir so rmSync(cacheDir) doesn't destroy our source files
  const tmpDir = cacheDir + ".tmp-clone"

  try {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })

    // Clone with sparse-checkout
    await execFileAsync("git", [
      "clone",
      "--filter=blob:none",
      "--sparse",
      "--branch",
      ref,
      "--depth",
      "1",
      gitUrl,
      tmpDir,
    ], { timeout: 120_000 })

    // Enable sparse-checkout with cone mode
    await execFileAsync("git", [
      "sparse-checkout",
      "init",
      "--cone",
    ], { cwd: tmpDir, timeout: 10_000 })

    // Set the directories to check out
    await execFileAsync("git", [
      "sparse-checkout",
      "set",
      ...OPENCODE_DIRS,
    ], { cwd: tmpDir, timeout: 30_000 })

    // Create cache dir and copy
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true })
    mkdirSync(cacheDir, { recursive: true })

    for (const dir of OPENCODE_DIRS) {
      const src = join(tmpDir, dir)
      if (existsSync(src)) {
        cpSync(src, join(cacheDir, dir), { recursive: true })
      }
    }

    for (const file of ["package.json", "README.md"]) {
      const src = join(tmpDir, file)
      if (existsSync(src)) {
        cpSync(src, join(cacheDir, file))
      }
    }

    log(`[agent-venom] plugin fetched via sparse clone -> ${cacheDir}`)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: `Sparse clone failed: ${err?.message || err}` }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function fetchViaFullClone(
  gitUrl: string,
  ref: string,
  cacheDir: string,
  log: (msg: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  // Use a temp dir OUTSIDE cacheDir so rmSync(cacheDir) doesn't destroy our source files
  const tmpDir = cacheDir + ".tmp-fullclone"

  try {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })

    await execFileAsync("git", [
      "clone",
      "--branch",
      ref,
      "--depth",
      "1",
      gitUrl,
      tmpDir,
    ], { timeout: 120_000 })

    // Create cache dir and copy needed contents
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true })
    mkdirSync(cacheDir, { recursive: true })

    for (const dir of OPENCODE_DIRS) {
      const src = join(tmpDir, dir)
      if (existsSync(src)) {
        cpSync(src, join(cacheDir, dir), { recursive: true })
      }
    }

    for (const file of ["package.json", "README.md"]) {
      const src = join(tmpDir, file)
      if (existsSync(src)) {
        cpSync(src, join(cacheDir, file))
      }
    }

    log(`[agent-venom] plugin fetched via full clone -> ${cacheDir}`)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: `Full clone failed: ${err?.message || err}` }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}

/**
 * Fetch the agent-venom plugin based on the current opencode.json config.
 * Reads the plugin entry, resolves cache dir, and fetches if needed.
 */
export async function fetchAgentVenomPlugin(
  options: PluginFetchOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  const configPath = await resolveOpenCodeConfigPath()

  if (!existsSync(configPath)) {
    return { ok: false, error: `OpenCode config not found: ${configPath}` }
  }

  const raw = readFileSync(configPath, "utf8")
  let config: any

  try {
    config = JSON.parse(raw)
  } catch {
    // Try JSONC parsing
    try {
      const jsonc = await import("jsonc-parser")
      const { parse } = jsonc
      config = parse(raw)
    } catch {
      return { ok: false, error: "Cannot parse OpenCode config" }
    }
  }

  // Find the agent-venom plugin entry
  const plugins: any[] = Array.isArray(config?.plugin) ? config.plugin : []

  for (const entry of plugins) {
    let pluginId: string | null = null

    if (typeof entry === "string") {
      pluginId = entry
    } else if (Array.isArray(entry) && typeof entry[0] === "string") {
      pluginId = entry[0]
    }

    if (!pluginId) continue

    // Check if this is the agent-venom plugin
    if (
      pluginId.startsWith("agent-venom@") ||
      pluginId.startsWith("my-agents@") ||
      pluginId.includes("Venom120/Agent-Venom")
    ) {
      return syncPluginToCache(pluginId, options)
    }
  }

  return { ok: false, error: "No agent-venom plugin entry found in opencode.json" }
}
