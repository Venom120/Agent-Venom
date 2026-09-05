import type { DshLifecycle, DshStatus } from "./dsh-lifecycle.js"
import { DSH_DEFAULT_PORT } from "./dsh-lifecycle.js"

export class MacOsDshLifecycle implements DshLifecycle {
  async install(): Promise<void> {
    throw new Error("macOS is not yet supported. Use Linux or WSL instead.")
  }

  async start(): Promise<void> {
    throw new Error("macOS is not yet supported.")
  }

  async stop(): Promise<void> {
    throw new Error("macOS is not yet supported.")
  }

  async restart(): Promise<void> {
    throw new Error("macOS is not yet supported.")
  }

  async status(): Promise<DshStatus> {
    return {
      installed: false,
      running: false,
      port: DSH_DEFAULT_PORT,
      serviceType: "launchd"
    }
  }

  async uninstall(): Promise<void> {
    throw new Error("macOS is not yet supported.")
  }
}
