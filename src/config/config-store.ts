import type { AgentVenomConfig } from "../core/contracts.js"
import { DEFAULT_CONFIG } from "./defaults.js"
import { readJsonFile, writeJsonFileAtomic } from "./json-store.js"

export async function loadConfig(path: string): Promise<AgentVenomConfig> {
  const stored = await readJsonFile<Partial<AgentVenomConfig>>(path)
  if (!stored) return structuredClone(DEFAULT_CONFIG)

  return {
    ...DEFAULT_CONFIG,
    ...stored,
    modelRoles: { ...DEFAULT_CONFIG.modelRoles, ...stored.modelRoles },
    provider: { ...DEFAULT_CONFIG.provider, ...stored.provider },
    services: { ...DEFAULT_CONFIG.services, ...stored.services }
  }
}

export async function saveConfig(path: string, config: AgentVenomConfig): Promise<void> {
  await writeJsonFileAtomic(path, config)
}