import type { AgentVenomConfig } from "../core/contracts.js"

export const DEFAULT_MODEL_ROLES = {
  reasoning: "omniroute/free-reasoning",
  deepCoding: "omniroute/free-coding-deep",
  standardCoding: "omniroute/free-coding-standard",
  fastCoding: "omniroute/free-coding-fast",
  context: "omniroute/free-context",
  vision: "omniroute/free-vision"
} as const

export const DEFAULT_CONFIG: AgentVenomConfig = {
  schemaVersion: 1,
  eccSource: "upstream",
  eccChannel: "stable",
  modelRoles: { ...DEFAULT_MODEL_ROLES },
  provider: {
    kind: "omniroute",
    baseUrl: "http://127.0.0.1:20128/v1",
    apiKeyEnv: "AGENT_VENOM_API_KEY"
  },
  services: {
    openCode: "av-opencode",
    dsh: "av-dsh"
  }
}