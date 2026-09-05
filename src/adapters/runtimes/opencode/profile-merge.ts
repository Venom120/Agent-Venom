import { parse, modify, applyEdits } from "jsonc-parser"
import type { AgentVenomConfig } from "../../../core/contracts.js"

export interface MergeOptions {
  activeProfile: "agent-venom" | "ecc"
  config: AgentVenomConfig
  sourceContent: string
}

/**
 * True for Agent-Venom-managed plugin IDs.
 * Canonical: agent-venom@git+https://github.com/Venom120/Agent-Venom.git#main
 * Legacy cleanup: my-agents@git+... (My-Agents/Agent-Venom), @venom120/agent-venom,
 * github:venom120/Agent-Venom shortcuts.
 */
function isManagedAgentVenomPluginId(id: string): boolean {
  if (id.startsWith("agent-venom@git+") && id.includes("github.com/Venom120/Agent-Venom")) return true
  if (id.startsWith("my-agents@git+") && (id.includes("Agent-Venom") || id.includes("My-Agents"))) return true
  if (id === "@venom120/agent-venom") return true
  if (id.startsWith("@venom120/agent-venom@")) return true
  if (id.startsWith("github:venom120/Agent-Venom")) return true
  return false
}

/**
 * Semantically merge the Agent-Venom configuration into an OpenCode JSONC string.
 * Preserves user-owned plugins, comments, and formatting.
 */
export function mergeProfileConfig(options: MergeOptions): string {
  const { activeProfile, config, sourceContent } = options
  let updatedContent = sourceContent

  // 1. Determine the exact plugin strings for the managed profiles.
  // Agent-Venom uses the current orchestrator repository pipeline
  // ECC uses the ecc-universal package.
  // Tuple form carries the externalSkills option: the plugin loader
  // auto-clones each repo and registers its skills on startup.
  const agentVenomPlugin = ["agent-venom@git+https://github.com/Venom120/Agent-Venom.git#main", {
    externalSkills: [
      { name: "shopify-ai-toolkit", url: "https://github.com/Shopify/shopify-ai-toolkit.git", ref: "main", skillsPath: "skills" }
    ]
  }]
  const eccPlugin = "ecc-universal"

  // 2. Parse the existing 'plugin' array to preserve user plugins and swap managed ones.
  const rootNode = parse(updatedContent) || {}
  const existingPlugins: any[] = Array.isArray(rootNode.plugin) ? rootNode.plugin : []

  // Filter out any previously managed Agent-Venom or ECC plugins.
  // Keeps legacy my-agents@git+ entries for cleanup, but the canonical
  // Agent-Venom entry is agent-venom@git+https://github.com/Venom120/Agent-Venom.git#main.
  const filteredPlugins = existingPlugins.filter(p => {
    if (typeof p === "string" && (p === "ecc-universal")) return false
    if (typeof p === "string" && isManagedAgentVenomPluginId(p)) return false
    if (Array.isArray(p) && typeof p[0] === "string" && isManagedAgentVenomPluginId(p[0])) return false
    return true
  })

  // Add the newly active managed plugin
  if (activeProfile === "agent-venom") {
    filteredPlugins.push(agentVenomPlugin)
  } else if (activeProfile === "ecc") {
    filteredPlugins.push(eccPlugin)
  }

  // Apply the 'plugin' edits
  const pluginEdits = modify(updatedContent, ["plugin"], filteredPlugins, {
    formattingOptions: { insertSpaces: true, tabSize: 2 }
  })
  updatedContent = applyEdits(updatedContent, pluginEdits)

  // 3. Merge Provider configuration
  if (config.provider.kind === "omniroute") {
    const omnirouteProvider = {
      name: "OmniRoute",
      npm: "@ai-sdk/openai-compatible",
      options: {
        baseURL: config.provider.baseUrl,
        apiKey: `{env:${config.provider.apiKeyEnv}}`
      },
      models: {
        "free-reasoning": { name: "OmniRoute — Reasoning" },
        "free-coding-deep": { name: "OmniRoute — Deep Coding" },
        "free-coding-standard": { name: "OmniRoute — Standard Coding" },
        "free-coding-fast": { name: "OmniRoute — Fast Coding" },
        "free-context": { name: "OmniRoute — Large Context" },
        "free-vision": { name: "OmniRoute — Vision" }
      }
    }

    const providerEdits = modify(updatedContent, ["provider", "omniroute"], omnirouteProvider, {
      formattingOptions: { insertSpaces: true, tabSize: 2 }
    })
    updatedContent = applyEdits(updatedContent, providerEdits)
  }
  // (Custom provider logic could be added here if needed, but for now
  // we just ensure OmniRoute is injected if selected).

  return updatedContent
}
