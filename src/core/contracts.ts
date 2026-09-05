export type EnvironmentKind =
  | "windows-native"
  | "windows-wsl"
  | "linux-desktop"
  | "linux-headless"
  | "macos-future"

export type EccSourceName = "upstream" | "venom120"
export type ReleaseChannel = "stable" | "latest" | "pinned"

export interface ModelRoleMapping {
  reasoning: string
  deepCoding: string
  standardCoding: string
  fastCoding: string
  context: string
  vision: string
}

export interface AgentVenomConfig {
  schemaVersion: 1
  environment?: EnvironmentKind
  eccSource: EccSourceName
  eccChannel: ReleaseChannel
  eccRef?: string
  modelRoles: ModelRoleMapping
  provider: {
    kind: "omniroute" | "custom"
    baseUrl?: string
  }
  services: {
    openCode: string
    dsh: string
  }
}

export interface AgentVenomState {
  schemaVersion: 1
  packageVersion: string
  environment?: EnvironmentKind
  activeProfiles: Partial<Record<"opencode" | "dsh", string>>
  ecc?: {
    source: EccSourceName
    channel: ReleaseChannel
    ref?: string
    resolvedCommit?: string
    checksum?: string
    adapterVersion?: string
  }
  managedFiles: Array<{
    path: string
    owner: string
    checksum?: string
  }>
  migration: {
    version: number
    completed: boolean
  }
}