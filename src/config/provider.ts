import type { AgentVenomConfig, ModelRoleMapping } from "../core/contracts.js"

const MODEL_ROLES: readonly (keyof ModelRoleMapping)[] = [
  "reasoning",
  "deepCoding",
  "standardCoding",
  "fastCoding",
  "context",
  "vision"
]

export function validateProviderConfig(config: AgentVenomConfig): string[] {
  const errors: string[] = []
  if (config.provider.kind === "custom" && !config.provider.baseUrl) {
    errors.push("Custom providers require a base URL")
  }

  for (const role of MODEL_ROLES) {
    if (!config.modelRoles[role].trim()) {
      errors.push(`Model role '${role}' requires a model ID`)
    }
  }

  return errors
}

export function setProviderKind(
  config: AgentVenomConfig,
  kind: AgentVenomConfig["provider"]["kind"],
  baseUrl?: string
): AgentVenomConfig {
  const { baseUrl: existingBaseUrl, ...providerWithoutBaseUrl } = config.provider
  const provider: AgentVenomConfig["provider"] = { ...providerWithoutBaseUrl, kind }
  const nextBaseUrl = baseUrl ?? existingBaseUrl
  if (nextBaseUrl !== undefined && !(kind === "custom" && baseUrl === undefined)) {
    provider.baseUrl = nextBaseUrl
  }
  return { ...config, provider }
}