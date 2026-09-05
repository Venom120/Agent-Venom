import type { OpenCodeLifecycle, OpenCodeStatus } from "./opencode-lifecycle.js"
import { OPENCODE_DEFAULT_PORT } from "./opencode-lifecycle.js"

export class MacOsOpenCodeLifecycle implements OpenCodeLifecycle {
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

  async status(): Promise<OpenCodeStatus> {
    return {
      installed: false,
      running: false,
      port: OPENCODE_DEFAULT_PORT,
      serviceType: "launchd"
    }
  }

  async uninstall(): Promise<void> {
    throw new Error("macOS is not yet supported.")
  }
}
