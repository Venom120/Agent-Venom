import type { AgentVenomConfig } from "./contracts.js"
import type { EnvironmentDescriptor } from "../environment/detect.js"
import { resolveTargetEnvironment } from "../environment/target.js"

export type InstallRuntime = "opencode" | "dsh"

export interface InstallPlan {
  runtime: InstallRuntime
  environment: EnvironmentDescriptor["kind"]
  delegatedToWsl: boolean
  inWsl: boolean
  source?: "upstream" | "venom120"
  actions: string[]
}

export function createInstallPlan(
  runtime: InstallRuntime,
  environment: EnvironmentDescriptor,
  config: AgentVenomConfig,
  options: { useWsl: boolean; useAgentVenom: boolean }
): InstallPlan {
  const targetEnvironment = resolveTargetEnvironment(
    environment,
    config.environment === undefined
      ? { useWsl: options.useWsl }
      : { useWsl: options.useWsl, recorded: config.environment }
  )
  const delegatedToWsl = targetEnvironment === "windows-wsl" && environment.platform === "windows"
  const inWsl = environment.isWsl
  const actions: string[] = []

  if (delegatedToWsl) {
    actions.push("Invoke the Linux-side Agent-Venom installation through WSL")
  }

  if (runtime === "opencode") {
    actions.push("Detect OpenCode and offer npm installation if missing")
    actions.push("Install selected Agent-Venom/ECC sources interactively")
    actions.push("Prepare the active OpenCode profile")
  } else {
    actions.push("Detect DSH and offer the official package installation if missing")
    actions.push("Generate and install selected DSH presets")
  }

  return {
    runtime,
    environment: targetEnvironment,
    delegatedToWsl,
    inWsl,
    ...(runtime === "opencode" || runtime === "dsh"
      ? { source: options.useAgentVenom ? "venom120" : config.eccSource }
      : {}),
    actions
  }
}