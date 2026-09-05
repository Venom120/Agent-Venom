import { platform, release } from "node:os"
import type { EnvironmentKind } from "../core/contracts.js"

export interface EnvironmentDescriptor {
  kind: EnvironmentKind
  platform: "windows" | "linux" | "macos" | "unknown"
  isWsl: boolean
  desktopAvailable: boolean
  systemdAvailable: boolean
  nodeVersion: string
}

export function detectEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  platformName = platform(),
  kernelRelease = release()
): EnvironmentDescriptor {
  const isWsl = platformName === "linux" && isWslEnvironment(env, kernelRelease)
  const desktopAvailable = Boolean(env.DISPLAY || env.WAYLAND_DISPLAY || env.SESSIONNAME)
  const systemdAvailable = Boolean(env.INVOCATION_ID || env.SYSTEMD_EXEC_PID)

  if (platformName === "win32") {
    return descriptor("windows-native", "windows", false, desktopAvailable, systemdAvailable, env)
  }

  if (platformName === "darwin") {
    return descriptor("macos-future", "macos", false, desktopAvailable, systemdAvailable, env)
  }

  if (platformName === "linux") {
    return descriptor(
      isWsl ? "windows-wsl" : desktopAvailable ? "linux-desktop" : "linux-headless",
      "linux",
      isWsl,
      desktopAvailable,
      systemdAvailable,
      env
    )
  }

  return descriptor("linux-headless", "unknown", isWsl, desktopAvailable, systemdAvailable, env)
}

function isWslEnvironment(env: NodeJS.ProcessEnv, kernelRelease: string): boolean {
  return Boolean(env.WSL_INTEROP || env.WSL_DISTRO_NAME || /microsoft-standard|WSL/i.test(kernelRelease))
}

function descriptor(
  kind: EnvironmentKind,
  platformName: EnvironmentDescriptor["platform"],
  isWsl: boolean,
  desktopAvailable: boolean,
  systemdAvailable: boolean,
  env: NodeJS.ProcessEnv
): EnvironmentDescriptor {
  return {
    kind,
    platform: platformName,
    isWsl,
    desktopAvailable,
    systemdAvailable,
    nodeVersion: process.version || env.NODE_VERSION || "unknown"
  }
}