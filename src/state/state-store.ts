import type { AgentVenomState } from "../core/contracts.js"
import type { EnvironmentKind } from "../core/contracts.js"
import { readJsonFile, writeJsonFileAtomic } from "../config/json-store.js"
import type { InstallResult } from "../core/install-executor.js"

export async function loadState(path: string, packageVersion: string): Promise<AgentVenomState> {
  const stored = await readJsonFile<AgentVenomState>(path)
  if (stored) return stored

  return {
    schemaVersion: 1,
    packageVersion,
    activeProfiles: {},
    managedFiles: [],
    migration: {
      version: 1,
      completed: false
    }
  }
}

export async function saveState(path: string, state: AgentVenomState): Promise<void> {
  await writeJsonFileAtomic(path, state)
}

/**
 * Record the selected environment kind in persistent state.
 * Only updates if the stored value differs or is not yet set.
 */
export async function recordEnvironment(
  statePath: string,
  packageVersion: string,
  environment: EnvironmentKind
): Promise<void> {
  const state = await loadState(statePath, packageVersion)
  if (state.environment === environment) return
  await saveState(statePath, { ...state, environment })
}

/**
 * Record runtime installation results in persistent state.
 * Updates the active profile and installed runtime version for the runtime.
 */
export async function recordInstallResult(
  statePath: string,
  packageVersion: string,
  result: InstallResult,
  profile?: string
): Promise<void> {
  if (!result.success) return

  const state = await loadState(statePath, packageVersion)

  const nextProfiles = { ...state.activeProfiles }
  if (profile) {
    nextProfiles[result.runtime as "opencode" | "dsh"] = profile
  }

  await saveState(statePath, {
    ...state,
    activeProfiles: nextProfiles
  })
}