import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { AgentVenomConfig } from "../core/contracts.js"
import { runWslCommand } from "../adapters/platforms/wsl.js"
import { OPENCODE_API_KEY_ENV_VAR } from "../config/env-file.js"

const execFileAsync = promisify(execFile)

export interface DependencyResult {
  name: "node" | "npm" | "git" | "opencode" | "dsh" | "wsl" | "omniroute" | "av-opencode" | "av-dsh"
  available: boolean
  version?: string
  detail?: string
}

export interface DependencyReport {
  dependencies: DependencyResult[]
  complete: boolean
  windowsNative?: DependencySummary
  windowsWsl?: DependencySummary
}

export interface DependencySummary {
  environment: "windows-native" | "windows-wsl" | "linux-desktop" | "linux-headless"
  dependencies: DependencyResult[]
  complete: boolean
}

export async function detectDependencies(
  env: NodeJS.ProcessEnv = process.env,
  config?: Pick<AgentVenomConfig, "services">
): Promise<DependencyReport> {
  if (process.platform === "win32") {
    const windowsNative = await detectLocalDependencies(env)
    const windowsWsl = await detectWslDependencies(config?.services)
    return {
      dependencies: windowsNative.dependencies,
      complete: windowsNative.complete && windowsWsl.complete,
      windowsNative,
      windowsWsl
    }
  }

  const local = await detectLocalDependencies(env)
  return {
    dependencies: local.dependencies,
    complete: local.complete
  }
}

async function detectLocalDependencies(
  env: NodeJS.ProcessEnv
): Promise<DependencySummary> {
  const checks = await Promise.all([
    checkExecutable("node", ["--version"], "node"),
    checkExecutable("npm", ["--version"], "npm"),
    checkExecutable("git", ["--version"], "git"),
    checkExecutable("opencode", ["--version"], "opencode"),
    checkExecutable("dsh", ["--version"], "dsh"),
    checkExecutable("wsl", ["--status"], "wsl")
  ])

  const openCodeApiKeyConfigured = Boolean(env[OPENCODE_API_KEY_ENV_VAR] || env.OMNIROUTE_API_KEY)
  checks.push({
    name: "omniroute",
    available: openCodeApiKeyConfigured,
    detail: openCodeApiKeyConfigured
      ? "OpenCode API key environment variable is configured"
      : "No OpenCode API key environment variable is configured (AV_OPENCODE_API_KEY)"
  })

  return {
    environment: process.platform === "win32" ? "windows-native" : "linux-headless",
    dependencies: checks,
    complete: checks.every((dependency) => dependency.available)
  }
}

async function detectWslDependencies(
  services: AgentVenomConfig["services"] = {
    openCode: "av-opencode",
    dsh: "av-dsh"
  }
): Promise<DependencySummary> {
  const checks = await Promise.all([
    checkWslCommand("node", ["--version"], "node"),
    checkWslCommand("npm", ["--version"], "npm"),
    checkWslCommand("git", ["--version"], "git"),
    checkWslCommand("opencode", ["--version"], "opencode"),
    checkWslCommand("dsh", ["--version"], "dsh"),
    checkWslService(services.openCode, "av-opencode"),
    checkWslService(services.dsh, "av-dsh")
  ])

  return {
    environment: "windows-wsl",
    dependencies: checks,
    complete: checks.every((dependency) => dependency.available)
  }
}

async function checkExecutable(
  command: string,
  args: string[],
  name: DependencyResult["name"]
): Promise<DependencyResult> {
  try {
    const executable = process.platform === "win32" && command === "npm"
      ? "npm.cmd"
      : command
    const result = await execFileAsync(executable, args, {
      timeout: 5_000,
      shell: process.platform === "win32" && command === "npm"
    })
    const output = `${result.stdout}\n${result.stderr}`.replace(/\0/g, "").trim()
    const dependency: DependencyResult = {
      name,
      available: true
    }
    const version = output.split(/\r?\n/, 1)[0]
    if (version) dependency.version = version
    return dependency
  } catch (error) {
    return {
      name,
      available: false,
      detail: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function checkWslCommand(
  command: string,
  args: string[],
  name: DependencyResult["name"]
): Promise<DependencyResult> {
  // For npm global packages, also check the user's npm prefix bin directory
  const npmPrefixBin = "$HOME/.npm-global/bin"
  const lookup = `command -v ${command} >/dev/null 2>&1 && ${command} || (export PATH="${npmPrefixBin}:$PATH" && command -v ${command} >/dev/null 2>&1 && ${command})`
  return checkWslExecutable(["bash", "-lc", `${loadWslShellProfiles()} ${lookup} ${args.join(" ")}`], name)
}

async function checkWslService(
  service: string,
  resultName: "av-opencode" | "av-dsh"
): Promise<DependencyResult> {
  return checkWslExecutable(
    ["bash", "-lc", `${loadWslShellProfiles()} systemctl is-active -- ${service}`],
    resultName
  )
}

function loadWslShellProfiles(): string {
  return "if [ -f ~/.bash_profile ]; then . ~/.bash_profile; fi; "
    + "if [ -f ~/.bashrc ]; then . ~/.bashrc; fi;"
}

async function checkWslExecutable(
  args: string[],
  name: DependencyResult["name"]
): Promise<DependencyResult> {
  try {
    const [command, shellFlag, shellCommand] = args
    if (command !== "bash" || shellFlag !== "-lc" || !shellCommand) {
      throw new Error("Invalid WSL probe command")
    }
    const result = await runWslCommand("bash", ["-lc", shellCommand], { timeout: 5_000 })
    const output = `${result.stdout}\n${result.stderr}`.replace(/\0/g, "").trim()
    if (result.exitCode !== 0) {
      return {
        name,
        available: false,
        detail: output || `WSL command exited with code ${result.exitCode}`
      }
    }
    const dependency: DependencyResult = { name, available: true }
    const version = output.split(/\r?\n/, 1)[0]
    if (version) dependency.version = version
    return dependency
  } catch (error) {
    return {
      name,
      available: false,
      detail: error instanceof Error ? error.message : String(error)
    }
  }
}