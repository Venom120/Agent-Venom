import type { EnvironmentDescriptor } from "./detect.js"
import type { EnvironmentKind } from "../core/contracts.js"

export function resolveTargetEnvironment(
  detected: EnvironmentDescriptor,
  options: { useWsl: boolean; recorded?: EnvironmentKind }
): EnvironmentKind {
  if (options.recorded === "windows-native" && options.useWsl) {
    throw new Error(
      "Agent-Venom is installed in the Windows-native environment. "
        + "Run the command without --wsl."
    )
  }

  if (options.recorded === "windows-wsl" && detected.platform === "windows") {
    return "windows-wsl"
  }

  if (options.useWsl) {
    if (detected.platform !== "windows") {
      throw new Error("--wsl is only supported when Agent-Venom is invoked from Windows")
    }
    return "windows-wsl"
  }

  if (detected.kind === "windows-wsl") return "windows-wsl"
  return detected.kind
}