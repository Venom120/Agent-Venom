import type { EnvironmentKind } from "../../../core/contracts.js"
import { LinuxOpenCodeLifecycle } from "./opencode-lifecycle-linux.js"
import { WindowsOpenCodeLifecycle } from "./opencode-lifecycle-windows.js"
import { WslOpenCodeLifecycle } from "./opencode-lifecycle-wsl.js"
import { MacOsOpenCodeLifecycle } from "./opencode-lifecycle-macos.js"

export interface OpenCodeStatus {
  installed: boolean
  running: boolean
  pid?: number | undefined
  version?: string | undefined
  port: number
  serviceType: "systemd" | "process" | "winsw" | "wsl-systemd" | "wsl-process" | "launchd"
}

export interface OpenCodeLifecycle {
  install(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  restart(): Promise<void>
  status(): Promise<OpenCodeStatus>
  uninstall(): Promise<void>
}

export const OPENCODE_DEFAULT_PORT = 4096

export function createOpenCodeLifecycle(env: EnvironmentKind): OpenCodeLifecycle {
  switch (env) {
    case "linux-desktop":
    case "linux-headless":
      return new LinuxOpenCodeLifecycle()
    case "windows-wsl":
      return new WslOpenCodeLifecycle()
    case "windows-native":
      return new WindowsOpenCodeLifecycle()
    case "macos-future":
      return new MacOsOpenCodeLifecycle()
    default:
      throw new Error(`Unsupported environment: ${env}`)
  }
}
