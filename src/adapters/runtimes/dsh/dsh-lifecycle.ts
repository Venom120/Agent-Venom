import type { EnvironmentKind } from "../../../core/contracts.js"
import { LinuxDshLifecycle } from "./dsh-lifecycle-linux.js"
import { WindowsDshLifecycle } from "./dsh-lifecycle-windows.js"
import { WslDshLifecycle } from "./dsh-lifecycle-wsl.js"
import { MacOsDshLifecycle } from "./dsh-lifecycle-macos.js"

export interface DshStatus {
  installed: boolean
  running: boolean
  pid?: number | undefined
  version?: string | undefined
  port: number
  serviceType: "systemd" | "process" | "winsw" | "wsl-systemd" | "wsl-process" | "launchd"
}

export interface DshLifecycle {
  install(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  restart(): Promise<void>
  status(): Promise<DshStatus>
  uninstall(): Promise<void>
}

export const DSH_DEFAULT_PORT = 3000

export function createDshLifecycle(env: EnvironmentKind): DshLifecycle {
  switch (env) {
    case "linux-desktop":
    case "linux-headless":
      return new LinuxDshLifecycle()
    case "windows-wsl":
      return new WslDshLifecycle()
    case "windows-native":
      return new WindowsDshLifecycle()
    case "macos-future":
      return new MacOsDshLifecycle()
    default:
      throw new Error(`Unsupported environment: ${env}`)
  }
}
