import { homedir } from "node:os"
import { join } from "node:path"

export interface AgentVenomPaths {
  configFile: string
  stateFile: string
  lockFile: string
}

export function resolveAgentVenomPaths(env: NodeJS.ProcessEnv = process.env): AgentVenomPaths {
  if (process.platform === "win32") {
    const root = env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
    const directory = join(root, "Agent-Venom")
    return createPaths(directory)
  }

  const configRoot = env.XDG_CONFIG_HOME || join(homedir(), ".config")
  const stateRoot = env.XDG_STATE_HOME || join(homedir(), ".local", "state")
  return {
    configFile: join(configRoot, "agent-venom", "config.json"),
    stateFile: join(stateRoot, "agent-venom", "state.json"),
    lockFile: join(stateRoot, "agent-venom", "state.lock")
  }
}

function createPaths(directory: string): AgentVenomPaths {
  return {
    configFile: join(directory, "config.json"),
    stateFile: join(directory, "state.json"),
    lockFile: join(directory, "state.lock")
  }
}