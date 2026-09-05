import { resolveAgentVenomPaths } from "../environment/paths.js"
import { detectEnvironment } from "../environment/detect.js"
import { detectDependencies } from "../dependencies/detect.js"
import { createInstallPlan, type InstallRuntime } from "../core/install-plan.js"
import { executeInstallPlan } from "../core/install-executor.js"
import { loadConfig, saveConfig } from "../config/config-store.js"
import { setProviderKind, validateProviderConfig } from "../config/provider.js"
import { loadState, saveState, recordEnvironment, recordInstallResult } from "../state/state-store.js"
import {
  selectOption,
  selectMultiple,
  promptSecret,
  promptConfirm,
  promptPassword,
  type SelectionOption
} from "./interactive.js"
import {
  writeAgentVenomEnv,
  loadAgentVenomEnv,
  resolveEnvFilePath,
  OPENCODE_API_KEY_ENV_VAR,
  DSH_API_KEY_ENV_VAR
} from "../config/env-file.js"
import type { EnvironmentKind, ModelRoleMapping } from "../core/contracts.js"
import { createInterface } from "node:readline"
import { acquireLock } from "../state/lock.js"
import { applyOpenCodeProfile } from "../adapters/runtimes/opencode/transaction.js"
import { runWslCommand } from "../adapters/platforms/wsl.js"
import { fetchAgentVenomPlugin, removePluginCache } from "../core/plugin-fetch.js"
import { createOpenCodeLifecycle } from "../adapters/runtimes/opencode/opencode-lifecycle.js"

const VERSION = "0.0.1-alpha"

const COMMANDS = [
  "install <opencode|dsh>",
  "uninstall <runtime>",
  "update [self|runtime|agents|generated|plugin]",
  "remove plugin",
  "profile [list|current|use <name>]",
  "runtime [list|status|start|stop|restart|logs]",
  "startup [status|enable|disable]",
  "tray [install|start|stop|status]",
  "status",
  "doctor",
  "repair",
  "migrate",
  "config [show|path|ecc-source <upstream|venom120>|provider <omniroute|custom>]"
] as const

function printHelp(): void {
  console.log("Usage: agent-venom <command> [options]")
  console.log("")
  console.log("Commands:")
  for (const command of COMMANDS) {
    console.log(`  ${command}`)
  }
  console.log("")
  console.log("Global options:")
  console.log("  --help, -h                           Show this help")
  console.log("  --version, -v                        Show the package version")
  console.log("  --wsl                                Use the WSL-managed environment")
  console.log("  --json                               Emit machine-readable output")
  console.log("  --dry-run                            Describe changes without applying them")
  console.log("  --no-restart                         Do not restart a runtime after changes")
  console.log("")
  console.log("Install options:")
  console.log("  --agent-venom                        Select the Venom120/ECC fork for this command")
  console.log("  --yes                                Accept confirmation prompts atomatically")
  console.log("  --non-interactive                    Require all options via flags (no TTY prompts)")
  console.log("  --environment <kind>                 windows-native|windows-wsl|linux-desktop|linux-headless")
  console.log("  --source <agent-venom|ecc|both>      Which profile sources to install")
  console.log("  --provider <omniroute|custom>        Provider selection")
  console.log("  --provider-base-url <url>            Base URL for custom provider")
  console.log("  --model-reasoning <id>")
  console.log("  --model-deep-coding <id>")
  console.log("  --model-standard-coding <id>")
  console.log("  --model-fast-coding <id>")
  console.log("  --model-context <id>")
  console.log("  --model-vision <id>")
  console.log("")
  console.log("Update options:")
  console.log("  --force                              Force re-fetch even if cache exists")
}

// ---------------------------------------------------------------------------
// Flag parsing helpers
// ---------------------------------------------------------------------------

function flag(args: readonly string[], name: string): boolean {
  return args.includes(name)
}

function flagValue(args: readonly string[], name: string): string | undefined {
  const idx = args.indexOf(name)
  return idx !== -1 ? args[idx + 1] : undefined
}

// ---------------------------------------------------------------------------
// Main CLI dispatcher
// ---------------------------------------------------------------------------

export async function runCli(args: readonly string[]): Promise<number> {
  const command = args[0]

  if (!command || command === "--help" || command === "-h") {
    printHelp()
    return 0
  }

  if (command === "--version" || command === "-v") {
    console.log(VERSION)
    return 0
  }

  if (command === "config") {
    return await runConfig(args.slice(1))
  }

  if (command === "status") {
    return await runStatus(args.slice(1))
  }

  if (command === "install") {
    return await runInstall(args.slice(1))
  }

  if (command === "profile") {
    return await runProfile(args.slice(1))
  }

  if (command === "doctor") {
    return await runDoctor(args.slice(1))
  }

  if (command === "update") {
    return await runUpdate(args.slice(1))
  }

  if (command === "remove") {
    return await runRemove(args.slice(1))
  }

  if (command === "runtime") {
    return await runRuntime(args.slice(1))
  }

  console.error(`Command '${command}' is not implemented yet.`)
  console.error("Run 'agent-venom --help' to see the planned command surface.")
  return 2
}

// ---------------------------------------------------------------------------
// profile command
// ---------------------------------------------------------------------------

async function runProfile(args: readonly string[]): Promise<number> {
  const action = args[0] || "current"
  const paths = resolveAgentVenomPaths()
  const state = await loadState(paths.stateFile, VERSION)

  if (action === "current") {
    const current = state.activeProfiles.opencode
    if (flag(args, "--json")) {
      console.log(JSON.stringify({ runtime: "opencode", profile: current ?? null }, null, 2))
    } else {
      console.log(current || "unknown")
    }
    return 0
  }

  if (action !== "use") {
    console.error("Usage: agent-venom profile [current|use <agent-venom|ecc>] [--no-restart]")
    return 2
  }

  const profile = args[1]
  if (profile !== "agent-venom" && profile !== "ecc") {
    console.error("Usage: agent-venom profile use <agent-venom|ecc> [--no-restart]")
    return 2
  }

  if (flag(args, "--wsl") && process.platform === "win32") {
    const result = await runWslCommand("agent-venom", ["profile", "use", profile, "--no-restart"])
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    return result.exitCode
  }

  if (!flag(args, "--no-restart")) {
    console.error("Runtime restart is not implemented yet. Re-run with --no-restart.")
    return 2
  }

  const config = await loadConfig(paths.configFile)
  const releaseLock = await acquireLock(paths.lockFile)
  try {
    const transaction = await applyOpenCodeProfile(profile, config)
    const nextState = await loadState(paths.stateFile, VERSION)
    await saveState(paths.stateFile, {
      ...nextState,
      activeProfiles: { ...nextState.activeProfiles, opencode: profile },
      managedFiles: [
        ...nextState.managedFiles.filter(file => file.path !== transaction.configPath),
        { path: transaction.configPath, owner: "agent-venom.opencode.profile" }
      ]
    })

    // Fetch plugin files into OpenCode cache so agents are available
    console.log("Fetching Agent-Venom plugin files...")
    const fetchResult = await fetchAgentVenomPlugin({
      log: (msg) => console.log(msg),
      force: flag(args, "--force"),
    })
    if (!fetchResult.ok) {
      console.warn(`Warning: plugin fetch failed: ${fetchResult.error}`)
    }

    console.log(`OpenCode profile activated: ${profile}`)
    return 0
  } catch (error) {
    console.error(`Failed to activate OpenCode profile: ${messageOf(error)}`)
    return 1
  } finally {
    await releaseLock()
  }
}

// ---------------------------------------------------------------------------
// config command
// ---------------------------------------------------------------------------

async function runConfig(args: readonly string[]): Promise<number> {
  const paths = resolveAgentVenomPaths()
  const action = args[0] || "show"

  if (action === "path") {
    console.log(paths.configFile)
    return 0
  }

  if (action === "show") {
    console.log(JSON.stringify(await loadConfig(paths.configFile), null, 2))
    return 0
  }

  if (action === "ecc-source") {
    const source = args[1]
    if (source !== "upstream" && source !== "venom120") {
      console.error("Usage: agent-venom config ecc-source <upstream|venom120>")
      return 2
    }

    const config = await loadConfig(paths.configFile)
    config.eccSource = source
    await saveConfig(paths.configFile, config)
    console.log(`ECC source set to ${source}`)
    return 0
  }

  if (action === "provider") {
    const providerKind = args[1]
    if (providerKind !== "omniroute" && providerKind !== "custom") {
      console.error("Usage: agent-venom config provider <omniroute|custom> [base-url]")
      return 2
    }

    const config = await loadConfig(paths.configFile)
    const updated = setProviderKind(config, providerKind, args[2])
    const errors = validateProviderConfig(updated)
    if (errors.length > 0) {
      console.error(errors.join("\n"))
      return 2
    }
    await saveConfig(paths.configFile, updated)
    console.log(`Provider set to ${providerKind}`)
    return 0
  }

  console.error(`Unknown config action '${action}'.`)
  console.error("Usage: agent-venom config [show|path|ecc-source <upstream|venom120>|provider <omniroute|custom>]")
  return 2
}

// ---------------------------------------------------------------------------
// status command
// ---------------------------------------------------------------------------

async function runStatus(args: readonly string[]): Promise<number> {
  const descriptor = detectEnvironment()
  if (flag(args, "--json")) {
    console.log(JSON.stringify({ environment: descriptor }, null, 2))
  } else {
    console.log(`Environment: ${descriptor.kind}`)
    console.log(`Platform: ${descriptor.platform}`)
    console.log(`WSL: ${descriptor.isWsl ? "yes" : "no"}`)
    console.log(`Desktop: ${descriptor.desktopAvailable ? "yes" : "no"}`)
    console.log(`systemd: ${descriptor.systemdAvailable ? "yes" : "no"}`)
    console.log(`Node: ${descriptor.nodeVersion}`)
  }
  return 0
}

// ---------------------------------------------------------------------------
// doctor command
// ---------------------------------------------------------------------------

async function runDoctor(args: readonly string[]): Promise<number> {
  const config = await loadConfig(resolveAgentVenomPaths().configFile)
  const [environment, dependencies] = await Promise.all([
    detectEnvironment(),
    detectDependencies(process.env, config)
  ])

  if (flag(args, "--json")) {
    console.log(JSON.stringify({ environment, dependencies }, null, 2))
  } else {
    console.log(`Environment: ${environment.kind}`)
    const summaries = [dependencies.windowsNative, dependencies.windowsWsl]
      .filter((summary): summary is NonNullable<typeof summary> => Boolean(summary))
    for (const summary of summaries) {
      console.log(`\n${summary.environment}:`)
      for (const dependency of summary.dependencies) {
        const state = dependency.available ? "available" : "missing"
        console.log(`  ${dependency.name}: ${state}${dependency.version ? ` (${dependency.version})` : ""}`)
      }
    }

    if (summaries.length === 0) {
      for (const dependency of dependencies.dependencies) {
        const state = dependency.available ? "available" : "missing"
        console.log(`${dependency.name}: ${state}${dependency.version ? ` (${dependency.version})` : ""}`)
      }
    }
  }

  return dependencies.complete ? 0 : 1
}

// ---------------------------------------------------------------------------
// update command — fetch/refresh plugin files into OpenCode cache
// ---------------------------------------------------------------------------

async function runUpdate(args: readonly string[]): Promise<number> {
  const target = args[0]

  if (target !== "plugin" && target !== "plugins") {
    console.error("Usage: agent-venom update plugin [--force]")
    return 2
  }

  const force = flag(args, "--force")

  console.log(force ? "Force-fetching Agent-Venom plugin files..." : "Fetching Agent-Venom plugin files...")

  const result = await fetchAgentVenomPlugin({
    force,
    log: (msg) => console.log(msg),
  })

  if (result.ok) {
    console.log("Plugin files updated successfully.")
    return 0
  } else {
    console.error(`Plugin fetch failed: ${result.error}`)
    return 1
  }
}

// ---------------------------------------------------------------------------
// remove command — remove plugin cache and/or config entry
// ---------------------------------------------------------------------------

async function runRemove(args: readonly string[]): Promise<number> {
  const target = args[0]

  if (target !== "plugin" && target !== "plugins") {
    console.error("Usage: agent-venom remove plugin [--config] [--cache]")
    console.error("")
    console.error("Options:")
    console.error("  --config   Remove the plugin entry from opencode.json")
    console.error("  --cache    Remove the cached plugin files from ~/.cache/opencode/packages/")
    console.error("  (default)  Remove both config entry and cache")
    return 2
  }

  const doConfig = flag(args, "--config") || (!flag(args, "--cache"))
  const doCache = flag(args, "--cache") || (!flag(args, "--config"))
  const paths = resolveAgentVenomPaths()

  // Remove cache
  if (doCache) {
    const result = removePluginCache((msg) => console.log(msg))
    if (!result.removed) {
      console.log("No cached plugin files found.")
    }
  }

  // Remove config entry
  if (doConfig) {
    const configPath = await import("../adapters/runtimes/opencode/config-paths.js")
      .then(m => m.resolveOpenCodeConfigPath())
    const { readFileSync: readFS, writeFileSync: writeFS, existsSync: existsFS } = await import("node:fs")

    if (!existsFS(configPath)) {
      console.error(`OpenCode config not found: ${configPath}`)
      return 1
    }

    const raw = readFS(configPath, "utf8")
    let config: any

    try {
      config = JSON.parse(raw)
    } catch {
      try {
        const jsonc = await import("jsonc-parser")
        config = jsonc.parse(raw)
      } catch {
        console.error("Cannot parse OpenCode config")
        return 1
      }
    }

    const plugins: any[] = Array.isArray(config?.plugin) ? config.plugin : []
    const before = plugins.length
    const isManaged = (entry: any): boolean => {
      let id: string | null = null
      if (typeof entry === "string") id = entry
      else if (Array.isArray(entry) && typeof entry[0] === "string") id = entry[0]
      if (!id) return false
      return id.startsWith("agent-venom@") ||
        id.startsWith("my-agents@") ||
        id.includes("Venom120/Agent-Venom")
    }

    config.plugin = plugins.filter((e: any) => !isManaged(e))

    if (config.plugin.length === before) {
      console.log("No managed agent-venom plugin entry found in config.")
    } else {
      writeFS(configPath, JSON.stringify(config, null, 2))
      console.log(`Removed agent-venom plugin entry from ${configPath}`)
    }
  }

  console.log("Agent-Venom plugin removed. Restart OpenCode to apply.")
  return 0
}

// ---------------------------------------------------------------------------
// install command — full interactive + non-interactive flow
// ---------------------------------------------------------------------------

async function runInstall(args: readonly string[]): Promise<number> {
  const runtime = args[0]
  if (runtime !== "opencode" && runtime !== "dsh") {
    console.error("Usage: agent-venom install <opencode|dsh> [options]")
    return 2
  }

  const paths = resolveAgentVenomPaths()
  const config = await loadConfig(paths.configFile)
  const state = await loadState(paths.stateFile, VERSION)
  const environment = detectEnvironment()
  const dryRun = flag(args, "--dry-run")
  const emitJson = flag(args, "--json")
  const yes = flag(args, "--yes")
  const nonInteractive = flag(args, "--non-interactive") || !process.stdout.isTTY || !process.stdin.isTTY

  // ── 1. Resolve environment target ──────────────────────────────────────────

  let targetEnvironment: EnvironmentKind

  const envFlag = flagValue(args, "--environment") as EnvironmentKind | undefined
  if (envFlag) {
    if (!isValidEnvironmentKind(envFlag)) {
      console.error("--environment must be one of: windows-native, windows-wsl, linux-desktop, linux-headless")
      return 2
    }
    targetEnvironment = envFlag
  } else if (state.environment) {
    // Already recorded from a previous installation
    targetEnvironment = state.environment
  } else if (nonInteractive) {
    console.error("--environment is required in non-interactive mode (not yet recorded in state)")
    return 2
  } else {
    // Interactive: ask the user
    const envOptions: SelectionOption<EnvironmentKind>[] = [
      { label: "Windows (native)", value: "windows-native" },
      { label: "Windows + WSL (Linux-side managed)", value: "windows-wsl" },
      { label: "Linux desktop", value: "linux-desktop" },
      { label: "Linux headless", value: "linux-headless" }
    ]
    // Auto-suggest based on detection
    const suggested = environment.kind
    const sortedOptions = [
      ...envOptions.filter(o => o.value === suggested),
      ...envOptions.filter(o => o.value !== suggested)
    ]
    targetEnvironment = await selectOption(
      "Select your environment:",
      sortedOptions
    )
  }

  // Validate --wsl flag against recorded environment
  if (flag(args, "--wsl") && state.environment === "windows-native") {
    console.error(
      "Agent-Venom is installed in the Windows-native environment. Run the command without --wsl."
    )
    return 2
  }

  // ── 2. Select profile sources ──────────────────────────────────────────────

  type SourceChoice = "agent-venom" | "ecc"
  let selectedSources: SourceChoice[]

  const sourceFlag = flagValue(args, "--source")
  if (sourceFlag) {
    if (sourceFlag === "both") {
      selectedSources = ["agent-venom", "ecc"]
    } else if (sourceFlag === "agent-venom" || sourceFlag === "ecc") {
      selectedSources = [sourceFlag]
    } else {
      console.error("--source must be one of: agent-venom, ecc, both")
      return 2
    }
  } else if (nonInteractive) {
    console.error("--source is required in non-interactive mode (agent-venom|ecc|both)")
    return 2
  } else {
    const sourceOptions: SelectionOption<SourceChoice>[] = [
      { label: "Agent Venom — six-stage development pipeline", value: "agent-venom" },
      { label: "ECC — Everything Claude Code", value: "ecc" }
    ]
    selectedSources = await selectMultiple(
      "Select profile sources to install:",
      sourceOptions
    )
  }

  // ── 3. Provider selection ──────────────────────────────────────────────────

  type ProviderKind = "omniroute" | "custom"
  let providerKind: ProviderKind = config.provider.kind

  const providerFlag = flagValue(args, "--provider") as ProviderKind | undefined
  if (providerFlag) {
    if (providerFlag !== "omniroute" && providerFlag !== "custom") {
      console.error("--provider must be one of: omniroute, custom")
      return 2
    }
    providerKind = providerFlag
  } else if (!nonInteractive && !process.env.OMNIROUTE_API_KEY && config.provider.kind === "omniroute") {
    // OmniRoute not detected — ask
    const providerOptions: SelectionOption<ProviderKind>[] = [
      { label: "OmniRoute (recommended — local gateway)", value: "omniroute" },
      { label: "Custom provider", value: "custom" }
    ]
    providerKind = await selectOption("Select your provider:", providerOptions)
  }

  // ── 4. Model role IDs for custom provider ──────────────────────────────────

  if (providerKind === "custom") {
    const baseUrl = flagValue(args, "--provider-base-url") ?? config.provider.baseUrl
    if (!baseUrl) {
      if (nonInteractive) {
        console.error("--provider-base-url is required for custom provider in non-interactive mode")
        return 2
      }
      // Interactive: we don't yet have a promptText helper — use simple readline
      const prompted = await promptLine("Custom provider base URL: ")
      if (!prompted.trim()) {
        console.error("A base URL is required for custom providers.")
        return 2
      }
      config.provider = { ...config.provider, kind: "custom", baseUrl: prompted.trim() }
    } else {
      config.provider = { ...config.provider, kind: "custom", baseUrl }
    }

    // Prompt for each model role if not supplied via flags
    const roleFlags: Record<keyof ModelRoleMapping, string | undefined> = {
      reasoning: flagValue(args, "--model-reasoning"),
      deepCoding: flagValue(args, "--model-deep-coding"),
      standardCoding: flagValue(args, "--model-standard-coding"),
      fastCoding: flagValue(args, "--model-fast-coding"),
      context: flagValue(args, "--model-context"),
      vision: flagValue(args, "--model-vision")
    }

    const roles = Object.keys(config.modelRoles) as (keyof ModelRoleMapping)[]
    for (const role of roles) {
      const flagged = roleFlags[role]
      if (flagged) {
        config.modelRoles[role] = flagged
      } else if (!nonInteractive) {
        const entered = await promptLine(`Model ID for ${role} [${config.modelRoles[role]}]: `)
        if (entered.trim()) config.modelRoles[role] = entered.trim()
      } else if (!config.modelRoles[role]) {
        console.error(`--model-${role.replace(/([A-Z])/g, "-$1").toLowerCase()} is required in non-interactive mode`)
        return 2
      }
    }

    const errors = validateProviderConfig(config)
    if (errors.length > 0) {
      console.error(errors.join("\n"))
      return 2
    }

    if (!dryRun) {
      await saveConfig(paths.configFile, config)
    }
  }

  // ── 5. API key ─────────────────────────────────────────────────────────────

  // Load env file if it exists so the keys are available in this process
  const envFilePath = resolveEnvFilePath(targetEnvironment)
  await loadAgentVenomEnv(envFilePath)

  // Determine which API keys are needed based on selected runtime
  const needsOpenCodeKey = runtime === "opencode" || selectedSources.includes("agent-venom") || selectedSources.includes("ecc")
  const needsDshKey = runtime === "dsh"

  if (needsOpenCodeKey && !process.env[OPENCODE_API_KEY_ENV_VAR]) {
    if (nonInteractive || yes) {
      console.error(
        `${OPENCODE_API_KEY_ENV_VAR} is not set. ` +
        `Export it in your environment before running agent-venom in non-interactive mode.`
      )
      return 2
    }

    console.log(`\n${OPENCODE_API_KEY_ENV_VAR} is not set.`)
    const apiKey = await promptSecret("Enter your OpenCode API key (input hidden):")
    if (!apiKey) {
      console.error("API key must not be empty.")
      return 2
    }

    if (!dryRun) {
      try {
        await writeAgentVenomEnv(targetEnvironment, apiKey, process.env, "opencode")
        if (targetEnvironment === "windows-native") {
          console.log(`✓ ${OPENCODE_API_KEY_ENV_VAR} written to machine environment via setx`)
        } else {
          console.log(`✓ ${OPENCODE_API_KEY_ENV_VAR} written to ${envFilePath}`)
        }
      } catch (error) {
        console.error(`Failed to write API key: ${error instanceof Error ? error.message : String(error)}`)
        return 2
      }
    } else {
      console.log(`[dry-run] Would write ${OPENCODE_API_KEY_ENV_VAR} to environment.`)
    }
  }

  if (needsDshKey && !process.env[DSH_API_KEY_ENV_VAR]) {
    if (nonInteractive || yes) {
      console.error(
        `${DSH_API_KEY_ENV_VAR} is not set. ` +
        `Export it in your environment before running agent-venom in non-interactive mode.`
      )
      return 2
    }

    console.log(`\n${DSH_API_KEY_ENV_VAR} is not set.`)
    const apiKey = await promptSecret("Enter your DSH API key (input hidden):")
    if (!apiKey) {
      console.error("API key must not be empty.")
      return 2
    }

    if (!dryRun) {
      try {
        await writeAgentVenomEnv(targetEnvironment, apiKey, process.env, "dsh")
        if (targetEnvironment === "windows-native") {
          console.log(`✓ ${DSH_API_KEY_ENV_VAR} written to machine environment via setx`)
        } else {
          console.log(`✓ ${DSH_API_KEY_ENV_VAR} written to ${envFilePath}`)
        }
      } catch (error) {
        console.error(`Failed to write API key: ${error instanceof Error ? error.message : String(error)}`)
        return 2
      }
    } else {
      console.log(`[dry-run] Would write ${DSH_API_KEY_ENV_VAR} to environment.`)
    }
  }

  // ── 6. Confirm ─────────────────────────────────────────────────────────────

  const sourceSummary = selectedSources.join(" + ")
  const summary = `runtime=${runtime} env=${targetEnvironment} sources=${sourceSummary} provider=${providerKind}`

  if (!dryRun && !yes && !nonInteractive) {
    const confirm = await promptLine(`\nReady to install: ${summary}\nProceed? [Y/n] `)
    if (confirm.trim().toLowerCase() === "n") {
      console.log("Installation cancelled.")
      return 0
    }
  }

  // ── 7. Build plan ──────────────────────────────────────────────────────────

  let plan
  try {
    plan = createInstallPlan(runtime as InstallRuntime, environment, config, {
      useWsl: flag(args, "--wsl"),
      useAgentVenom: flag(args, "--agent-venom") || selectedSources.includes("ecc")
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }

  if (dryRun || emitJson) {
    console.log(JSON.stringify({ dryRun: true, plan, selectedSources, targetEnvironment }, null, 2))
    return 0
  }

  // ── 8. Execute ─────────────────────────────────────────────────────────────

  // For testing: allow passing sudo password via flag
  const sudoPasswordFlag = flagValue(args, "--sudo-password")

  console.log(`\nInstalling ${runtime} (${targetEnvironment})...`)
  const result = await executeInstallPlan(plan, {
    output: process.stdout,
    config,
    activeProfile: selectedSources[0]!,
    forwardedArgs: args,
    yes,
    nonInteractive,
    promptSudoPassword: nonInteractive && !sudoPasswordFlag 
      ? undefined 
      : async () => {
          // If password provided via flag, use it directly
          if (sudoPasswordFlag) {
            return sudoPasswordFlag
          }
          // Otherwise prompt interactively
          return promptPassword("Enter sudo password (hidden)")
        }
  })

  if (emitJson) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    for (const step of result.steps) {
      const icon = step.status === "ok" ? "✓" : step.status === "skipped" ? "⚠" : "✗"
      console.log(`${icon} ${step.step}${step.detail ? `: ${step.detail}` : ""}`)
    }
  }

  if (!result.success) {
    console.error("\nInstallation completed with errors.")
    return 1
  }

  // ── 9. Record state ────────────────────────────────────────────────────────

  await recordEnvironment(paths.stateFile, VERSION, targetEnvironment)
  await recordInstallResult(paths.stateFile, VERSION, result, selectedSources[0])

  console.log("\n✓ Installation complete.")
  return 0
}

// ---------------------------------------------------------------------------
// runtime command
// ---------------------------------------------------------------------------

async function runRuntime(args: readonly string[]): Promise<number> {
  const subcommand = args[0]

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    console.log("Usage: agent-venom runtime <status|start|stop|restart> [--wsl] [--json]")
    console.log("")
    console.log("Subcommands:")
    console.log("  status     Show runtime status")
    console.log("  start      Start the runtime")
    console.log("  stop       Stop the runtime")
    console.log("  restart    Restart the runtime")
    console.log("")
    console.log("Options:")
    console.log("  --wsl      Use the WSL-managed environment")
    console.log("  --json     Emit machine-readable output")
    return 0
  }

  if (!["status", "start", "stop", "restart"].includes(subcommand)) {
    console.error(`Unknown runtime subcommand '${subcommand}'. Use start, stop, restart, or status.`)
    return 2
  }

  const emitJson = flag(args, "--json")

  // Detect environment
  const { detectEnvironment } = await import("../environment/detect.js")
  const detected = await detectEnvironment()
  let env = detected.kind
  if (flag(args, "--wsl")) {
    env = "windows-wsl"
  }

  const lifecycle = createOpenCodeLifecycle(env)

  if (subcommand === "status") {
    try {
      const status = await lifecycle.status()
      const { detectOpenCodePaths } = await import("../adapters/runtimes/opencode/opencode-detect.js")
      const paths = await detectOpenCodePaths()
      if (emitJson) {
        console.log(JSON.stringify({ ...status, paths: { binary: paths.binaryPath, config: paths.configDir, cache: paths.cacheDir, installMethod: paths.installMethod } }, null, 2))
      } else {
        console.log(`OpenCode status:`)
        console.log(`  Installed:  ${status.installed}`)
        console.log(`  Running:    ${status.running}`)
        if (status.version) console.log(`  Version:    ${status.version}`)
        if (status.pid) console.log(`  PID:        ${status.pid}`)
        console.log(`  Port:       ${status.port}`)
        console.log(`  Service:    ${status.serviceType}`)
        console.log(`  Binary:     ${paths.binaryPath || "not found"}`)
        console.log(`  Config:     ${paths.configDir}`)
        console.log(`  Cache:      ${paths.cacheDir}`)
        console.log(`  Install:    ${paths.installMethod}`)
      }
      return 0
    } catch (error) {
      console.error(`Failed to get status: ${messageOf(error)}`)
      return 1
    }
  }

  if (subcommand === "start") {
    try {
      await lifecycle.start()
      console.log("OpenCode started.")
      return 0
    } catch (error) {
      console.error(`Failed to start: ${messageOf(error)}`)
      return 1
    }
  }

  if (subcommand === "stop") {
    try {
      await lifecycle.stop()
      console.log("OpenCode stopped.")
      return 0
    } catch (error) {
      console.error(`Failed to stop: ${messageOf(error)}`)
      return 1
    }
  }

  if (subcommand === "restart") {
    try {
      await lifecycle.restart()
      console.log("OpenCode restarted.")
      return 0
    } catch (error) {
      console.error(`Failed to restart: ${messageOf(error)}`)
      return 1
    }
  }

  return 0
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function isValidEnvironmentKind(value: string): value is EnvironmentKind {
  return ["windows-native", "windows-wsl", "linux-desktop", "linux-headless"].includes(value)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Simple synchronous-style line prompt using readline. */
function promptLine(query: string): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(query, answer => {
      rl.close()
      resolve(answer)
    })
  })
}