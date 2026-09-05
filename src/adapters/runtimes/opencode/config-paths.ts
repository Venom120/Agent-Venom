import { homedir } from "node:os"
import { join } from "node:path"
import { stat } from "node:fs/promises"

/**
 * Returns the path to the active OpenCode configuration file.
 * The global npm installation (`npm install -g opencode-ai`) defaults to
 * `~/.config/opencode/opencode.json[c]` on all platforms (including Windows).
 */
export async function resolveOpenCodeConfigPath(
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const configHome = env.XDG_CONFIG_HOME || join(homedir(), ".config")
  const opencodeDir = join(configHome, "opencode")
  
  const jsoncPath = join(opencodeDir, "opencode.jsonc")
  const jsonPath = join(opencodeDir, "opencode.json")

  // Check if .jsonc exists first (since it allows comments)
  if (await fileExists(jsoncPath)) {
    return jsoncPath
  }

  // Check if .json exists
  if (await fileExists(jsonPath)) {
    return jsonPath
  }

  // Default to .json if neither exists
  return jsonPath
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isFile()
  } catch {
    return false
  }
}
