import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { resolveOpenCodeConfigPath } from "../adapters/runtimes/opencode/config-paths.js"

const execFileAsync = promisify(execFile)

// Directories to keep from the Agent-Venom repo for OpenCode plugin loading.
// The plugin loader (load-agents.ts) reads agents/ via import.meta.url.
// dist/ contains the compiled plugin entry. package.json declares the main field.
const OPENCODE_DIRS = ["agents", "dist"]

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
 * Resolve the plugin name from a plugin entry string like "agent-venom@git+https://...".
 */
function resolvePluginName(pluginEntry: string): string {
  const atIndex = pluginEntry.indexOf("@")
  return atIndex > 0 ? pluginEntry.slice(0, atIndex) : "agent-venom"
}

/**
 * Resolve the GitHub tarball URL for a given repo URL and ref.
 * Falls back to git clone if the URL doesn't match github.com.
 */
function resolveTarballUrl(gitUrl: string, ref: string): string | null {
  const m = gitUrl.match(/https:\/\/github\.com\/([^/]+)\/([^/.]+)/)
  if (!m) return null

  const owner = m[1]
  const repo = m[2]
  return `https://github.com/${owner}/${repo}/archive/refs/heads/${ref}.tar.gz`
}

/**
 * Write the wrapper package.json that OpenCode v1 expects at the cache root.
 * This matches the structure: { "dependencies": { "<name>": "github:..." } }
 */
function writeWrapperPackageJson(cacheDir: string, pluginName: string, gitUrl: string, ref: string): void {
  const gitDep = gitUrl.replace("https://", "")
  const pkg = {
    dependencies: {
      [pluginName]: `github:${gitDep}#${ref}`
    }
  }
  writeFileSync(join(cacheDir, "package.json"), JSON.stringify(pkg, null, 2))
}

/**
 * Copy extracted repo contents into node_modules/<pluginName>/ inside cacheDir.
 * Also creates the wrapper package.json at the cache root.
 */
function installPluginIntoCache(
  extractedDir: string,
  cacheDir: string,
  pluginName: string,
  gitUrl: string,
  ref: string,
): void {
  const pluginDir = join(cacheDir, "node_modules", pluginName)

  if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true })
  mkdirSync(pluginDir, { recursive: true })

  for (const dir of OPENCODE_DIRS) {
    const src = join(extractedDir, dir)
    if (existsSync(src)) {
      cpSync(src, join(pluginDir, dir), { recursive: true })
    }
  }

  for (const file of ["package.json", "README.md"]) {
    const src = join(extractedDir, file)
    if (existsSync(src)) {
      cpSync(src, join(pluginDir, file))
    }
  }

  writeWrapperPackageJson(cacheDir, pluginName, gitUrl, ref)
}

/**
 * Fetch the Agent-Venom plugin files into OpenCode's cache directory.
 *
 * OpenCode v1 stores git plugins at:
 *   ~/.cache/opencode/packages/<name>@git+https:/<path>#<ref>/
 *     package.json          (wrapper: { "dependencies": { "<name>": "<git-url>#<ref>" } })
 *     node_modules/
 *       <name>/             (actual plugin code)
 *         agents/
 *         dist/
 *         package.json
 *
 * Strategy:
 * 1. Try GitHub tarball download (fast, no git dependency).
 * 2. Fall back to git sparse-checkout if tarball fails.
 * 3. Fall back to full git clone as last resort.
 */
export async function syncPluginToCache(
  pluginEntry: string,
  options: PluginFetchOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  const log = options.log ?? (() => {})
  const ref = options.ref ?? resolveRef(pluginEntry)
  const gitUrl = resolveGitUrl(pluginEntry)
  const pluginName = resolvePluginName(pluginEntry)

  if (!gitUrl) {
    return { ok: false, error: `Cannot parse git URL from plugin entry: ${pluginEntry}` }
  }

  const cacheDir = resolvePluginCacheDir(pluginEntry)
  if (!cacheDir) {
    return { ok: false, error: `Cannot resolve cache dir from plugin entry: ${pluginEntry}` }
  }

  // Already cached and not forcing re-fetch
  if (!options.force && existsSync(cacheDir)) {
    const pluginDir = join(cacheDir, "node_modules", pluginName)
    const hasPackageJson = existsSync(join(cacheDir, "package.json"))
    const hasPluginDir = existsSync(pluginDir)
    const hasDist = existsSync(join(pluginDir, "dist"))
    const hasAgents = existsSync(join(pluginDir, "agents"))
    if (hasPackageJson && hasPluginDir && hasDist && hasAgents) {
      log(`[agent-venom] plugin cache exists, skipping fetch: ${cacheDir}`)
      return { ok: true }
    }
    log(`[agent-venom] plugin cache incomplete, re-fetching: ${cacheDir}`)
  }

  log(`[agent-venom] fetching plugin from ${gitUrl} (ref: ${ref})...`)

  // Strategy 1: GitHub tarball download
  const tarballUrl = resolveTarballUrl(gitUrl, ref)
  if (tarballUrl) {
    const result = await fetchViaTarball(tarballUrl, cacheDir, pluginName, ref, gitUrl, log)
    if (result.ok) return result
    log(`[agent-venom] tarball download failed, trying git clone...`)
  }

  // Strategy 2: Git sparse-checkout (only needed dirs)
  const result = await fetchViaSparseClone(gitUrl, ref, cacheDir, pluginName, log)
  if (result.ok) return result

  // Strategy 3: Full git clone
  log(`[agent-venom] sparse checkout failed, trying full clone...`)
  return await fetchViaFullClone(gitUrl, ref, cacheDir, pluginName, log)
}

async function fetchViaTarball(
  url: string,
  cacheDir: string,
  pluginName: string,
  ref: string,
  gitUrl: string,
  log: (msg: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  const tmpDir = cacheDir + ".tmp-tarball"

  try {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })

    await execFileAsync("curl", [
      "-fsSL", url, "-o", join(tmpDir, "repo.tar.gz"),
    ], { timeout: 60_000 })

    await execFileAsync("tar", [
      "-xzf", join(tmpDir, "repo.tar.gz"), "-C", tmpDir,
    ], { timeout: 30_000 })

    const entries = readdirSync(tmpDir).filter(
      (e: string) => e !== "repo.tar.gz" && e !== ".",
    )

    if (entries.length === 0) {
      return { ok: false, error: "Tarball extraction produced no files" }
    }

    const extractedDir = join(tmpDir, entries[0]!)

    if (!existsSync(extractedDir) || !existsSync(join(extractedDir, "package.json"))) {
      return { ok: false, error: `Tarball extracted but package.json not found in ${extractedDir}` }
    }

    installPluginIntoCache(extractedDir, cacheDir, pluginName, gitUrl, ref)
    log(`[agent-venom] plugin fetched via tarball -> ${join(cacheDir, "node_modules", pluginName)}`)
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
  pluginName: string,
  log: (msg: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  const tmpDir = cacheDir + ".tmp-clone"

  try {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })

    await execFileAsync("git", [
      "clone", "--filter=blob:none", "--sparse", "--branch", ref,
      "--depth", "1", gitUrl, tmpDir,
    ], { timeout: 120_000 })

    await execFileAsync("git", [
      "sparse-checkout", "init", "--cone",
    ], { cwd: tmpDir, timeout: 10_000 })

    await execFileAsync("git", [
      "sparse-checkout", "set", ...OPENCODE_DIRS,
    ], { cwd: tmpDir, timeout: 30_000 })

    installPluginIntoCache(tmpDir, cacheDir, pluginName, gitUrl, ref)
    log(`[agent-venom] plugin fetched via sparse clone -> ${join(cacheDir, "node_modules", pluginName)}`)
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
  pluginName: string,
  log: (msg: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  const tmpDir = cacheDir + ".tmp-fullclone"

  try {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })

    await execFileAsync("git", [
      "clone", "--branch", ref, "--depth", "1", gitUrl, tmpDir,
    ], { timeout: 120_000 })

    installPluginIntoCache(tmpDir, cacheDir, pluginName, gitUrl, ref)
    log(`[agent-venom] plugin fetched via full clone -> ${join(cacheDir, "node_modules", pluginName)}`)
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
    try {
      const jsonc = await import("jsonc-parser")
      const { parse } = jsonc
      config = parse(raw)
    } catch {
      return { ok: false, error: "Cannot parse OpenCode config" }
    }
  }

  const plugins: any[] = Array.isArray(config?.plugin) ? config.plugin : []

  for (const entry of plugins) {
    let pluginId: string | null = null

    if (typeof entry === "string") {
      pluginId = entry
    } else if (Array.isArray(entry) && typeof entry[0] === "string") {
      pluginId = entry[0]
    }

    if (!pluginId) continue

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
