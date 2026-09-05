import { readFile, writeFile, rename, copyFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { resolveOpenCodeConfigPath } from "./config-paths.js"
import { mergeProfileConfig } from "./profile-merge.js"
import type { AgentVenomConfig } from "../../../core/contracts.js"

export interface TransactionResult {
  /** The path to the active OpenCode config file. */
  configPath: string
  /** 
   * Reverts the OpenCode config to its pre-transaction state.
   * Does nothing if a backup wasn't successfully created.
   */
  rollback: () => Promise<void>
}

/**
 * atomatically updates the OpenCode configuration for the selected profile.
 * - Discovers the correct .json or .jsonc file.
 * - Backs it up.
 * - Merges the active profile settings semantically.
 * - atomatically writes the result back.
 */
export async function applyOpenCodeProfile(
  activeProfile: "agent-venom" | "ecc",
  config: AgentVenomConfig
): Promise<TransactionResult> {
  const configPath = await resolveOpenCodeConfigPath()
  const backupPath = `${configPath}.bak`
  
  let sourceContent = "{}"
  try {
    sourceContent = await readFile(configPath, "utf8")
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw new Error(`Failed to read OpenCode config at ${configPath}: ${error.message}`)
    }
  }

  // 1. Create a backup if the original file exists
  let backedUp = false
  if (sourceContent !== "{}") {
    try {
      await copyFile(configPath, backupPath)
      backedUp = true
    } catch (error: any) {
      throw new Error(`Failed to create backup at ${backupPath}: ${error.message}`)
    }
  }

  // 2. Perform the semantic merge
  const mergedContent = mergeProfileConfig({
    activeProfile,
    config,
    sourceContent
  })

  // 3. atomatically write the new config
  const tempPath = join(dirname(configPath), `.${Date.now()}-opencode.tmp`)
  try {
    await writeFile(tempPath, mergedContent, { encoding: "utf8", mode: 0o644 })
    await rename(tempPath, configPath)
  } catch (error: any) {
    throw new Error(`Failed to atomatically update OpenCode config at ${configPath}: ${error.message}`)
  }

  // 4. Return the transaction handle with a rollback capability
  const rollback = async () => {
    if (backedUp) {
      try {
        await copyFile(backupPath, configPath)
      } catch (error: any) {
        console.error(`Rollback failed: unable to restore backup from ${backupPath}: ${error.message}`)
      }
    } else {
      // If there was no original file, "rollback" means deleting the created file,
      // though typically OpenCode config always exists after 'npm install -g opencode'.
      // For safety, we won't aggressively delete in a rollback, just restore if backed up.
    }
  }

  return { configPath, rollback }
}
