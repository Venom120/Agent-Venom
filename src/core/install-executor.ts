/**
 * Agent-Venom installation executor.
 *
 * Executes the steps described by an InstallPlan. All external processes are
 * invoked through execFile argument arrays — never shell command strings.
 *
 * Security rules (from AGENTS.md):
 * - Use spawn/execFile argument arrays; never interpolate user data.
 * - Do not execute downloaded repository scripts implicitly.
 * - Keep secrets out of logs.
 */

import { execFile } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import type { InstallPlan } from "./install-plan.js"
import { acquireLock } from "../state/lock.js"
import { resolveAgentVenomPaths } from "../environment/paths.js"
import { applyOpenCodeProfile } from "../adapters/runtimes/opencode/transaction.js"
import type { AgentVenomConfig } from "./contracts.js"
import { runWslCommand } from "../adapters/platforms/wsl.js"
import { checkWslCommand } from "../dependencies/detect.js"
import { fetchAgentVenomPlugin } from "./plugin-fetch.js"

const execFileAsync = promisify(execFile)
const OPENCODE_NPM_PACKAGE = "opencode-ai"

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type StepStatus = "ok" | "skipped" | "failed"

export interface InstallStepResult {
  step: string
  status: StepStatus
  detail?: string
}

export interface InstallResult {
  runtime: InstallPlan["runtime"]
  environment: InstallPlan["environment"]
  steps: InstallStepResult[]
  success: boolean
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ExecuteInstallOptions {
  /** If true, describe actions without running them. */
  dryRun?: boolean
  /** Stream to write progress messages to (defaults to process.stdout). */
  output?: NodeJS.WritableStream
  /** The full AgentVenom configuration (required for profile updates) */
  config: AgentVenomConfig
  /** The profile to activate during installation */
  activeProfile: "agent-venom" | "ecc"
  /** Original install flags used when delegating a Windows request to WSL. */
  forwardedArgs?: readonly string[]
  /** If true, accept all confirmation prompts automatically. */
  yes?: boolean
  /** If true, skip all confirmation prompts and require explicit flags. */
  nonInteractive?: boolean
  /** Callback to prompt the user for sudo password. Returns password or null if cancelled. */
  promptSudoPassword?: (() => Promise<string | null>) | undefined
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function executeInstallPlan(
  plan: InstallPlan,
  options: ExecuteInstallOptions
): Promise<InstallResult> {
  const out = options.output ?? process.stdout
  const dryRun = options.dryRun ?? false
  const steps: InstallStepResult[] = []

  const log = (msg: string): void => {
    out.write(`${msg}\n`)
  }

  // When delegated to WSL, the Windows-side CLI invokes the same CLI inside
  // the selected Linux distribution after the user's shell profiles load.
  if (plan.delegatedToWsl) {
    const step = "Delegate installation to WSL"
    log(`→ ${step}`)
    if (!dryRun) {
      const forwardedArgs = options.forwardedArgs ?? ["--source", options.activeProfile]
      const result = await runWslCommand(
        "agent-venom",
        ["install", plan.runtime, ...forwardedArgs.filter(argument => argument !== "--wsl")],
        { timeout: 120_000 }
      )
      if (result.stdout) out.write(result.stdout)
      if (result.stderr) out.write(result.stderr)
      steps.push({
        step,
        status: result.exitCode === 0 ? "ok" : "failed",
        detail: result.exitCode === 0
          ? "WSL installation completed"
          : `WSL installation exited with code ${result.exitCode}`
      })
    } else {
      steps.push({ step, status: "ok", detail: "dry-run" })
    }
    return buildResult(plan, steps)
  }

  const paths = resolveAgentVenomPaths()
  let releaseLock: (() => Promise<void>) | undefined

  if (!dryRun) {
    try {
      log(`→ Acquiring transaction lock...`)
      releaseLock = await acquireLock(paths.lockFile)
    } catch (error) {
      steps.push({
        step: "Acquire transaction lock",
        status: "failed",
        detail: messageOf(error)
      })
      return buildResult(plan, steps)
    }
  } else {
    log(`→ Acquire transaction lock (dry-run)`)
    steps.push({ step: "Acquire transaction lock", status: "ok", detail: "dry-run" })
  }

  try {
    if (plan.runtime === "opencode") {
      await runOpenCodeInstall(plan, { dryRun, log, steps, options })
    } else {
      await runDshInstall(plan, { dryRun, log, steps, options })
    }
  } finally {
    if (releaseLock) {
      await releaseLock()
    }
  }

  return buildResult(plan, steps)
}

// ---------------------------------------------------------------------------
// OpenCode installation
// ---------------------------------------------------------------------------

async function runOpenCodeInstall(
  plan: InstallPlan,
  ctx: StepContext
): Promise<void> {
  const { dryRun, log, steps, options } = ctx

  // Step 1: ensure opencode is installed
  const opencodeStep = "Install OpenCode via npm"
  log(`→ ${opencodeStep}`)
  
  if (dryRun) {
    steps.push({ step: opencodeStep, status: "ok", detail: `dry-run: would check and install ${OPENCODE_NPM_PACKAGE} if missing` })
  } else {
    // Check if opencode is already installed
    let opencodeAvailable = false
    if (plan.delegatedToWsl) {
      const check = await checkWslCommand("opencode", ["--version"], "opencode")
      opencodeAvailable = check.available
    } else {
      try {
        const npmBin = process.platform === "win32" ? "npm.cmd" : "npm"
        await execFileAsync(npmBin, ["list", "-g", "--depth=0", OPENCODE_NPM_PACKAGE], {
          env: process.env,
          windowsHide: true
        })
        opencodeAvailable = true
      } catch {
        opencodeAvailable = false
      }
    }

    if (opencodeAvailable) {
      steps.push({ step: opencodeStep, status: "skipped", detail: "OpenCode already installed" })
    } else {
      // Determine if we need sudo for global npm install
      const needsElevation = await detectNpmNeedsElevation(plan)
      
      let sudoPassword: string | null = null
      if (needsElevation) {
        log(`→ Global npm install requires elevated permissions`)
        
        // Prompt user for sudo password
        if (options.promptSudoPassword) {
          sudoPassword = await options.promptSudoPassword()
          if (sudoPassword === null) {
            steps.push({
              step: opencodeStep,
              status: "failed",
              detail: "Installation cancelled: sudo permission denied by user"
            })
            return
          }
        } else {
          steps.push({
            step: opencodeStep,
            status: "failed",
            detail: "sudo required but no password prompt available in non-interactive mode"
          })
          return
        }
      }

      try {
        const installOpts: { sudo: boolean; sudoPassword?: string } = { sudo: needsElevation }
        if (sudoPassword) {
          installOpts.sudoPassword = sudoPassword
        }
        const result = await npmInstallGlobal(OPENCODE_NPM_PACKAGE, installOpts)
        steps.push({ step: opencodeStep, status: "ok", detail: result })
      } catch (error) {
        steps.push({
          step: opencodeStep,
          status: "failed",
          detail: `npm install -g ${OPENCODE_NPM_PACKAGE} failed: ${messageOf(error)}`
        })
        return // abort on npm failure
      }
    }
  }

  // Step 2: Update OpenCode Configuration Profile
  const profileStep = `Apply ${options.activeProfile} OpenCode profile`
  log(`→ ${profileStep}`)
  let transaction: Awaited<ReturnType<typeof applyOpenCodeProfile>> | undefined
  
  if (dryRun) {
    steps.push({ step: profileStep, status: "ok", detail: `dry-run: would apatomaticallyr ${options.activeProfile}` })
  } else {
    try {
      transaction = await applyOpenCodeProfile(options.activeProfile, options.config)
      steps.push({ step: profileStep, status: "ok", detail: `Config updated automatically at ${transaction.configPath}` })
    } catch (error) {
      steps.push({
        step: profileStep,
        status: "failed",
        detail: `Failed to apply OpenCode profile: ${messageOf(error)}`
      })
      return // abort on profile merge failure
    }
  }

  // Step 4: Agent-Venom DSH preset sync (if applicable)
  await syncAgentVenomDshPreset(plan, ctx)

  // Step 5: Fetch plugin files into OpenCode cache
  const fetchStep = "Fetch Agent-Venom plugin files into OpenCode cache"
  log(`→ ${fetchStep}`)
  if (dryRun) {
    steps.push({ step: fetchStep, status: "ok", detail: "dry-run: would fetch plugin files" })
  } else {
    try {
      const fetchResult = await fetchAgentVenomPlugin({ log })
      if (fetchResult.ok) {
        steps.push({ step: fetchStep, status: "ok", detail: "Plugin files fetched" })
      } else {
        steps.push({ step: fetchStep, status: "failed", detail: fetchResult.error ?? "Unknown fetch error" })
      }
    } catch (error) {
      steps.push({ step: fetchStep, status: "failed", detail: messageOf(error) })
    }
  }

  if (transaction && steps.some(step => step.status === "failed")) {
    const rollbackStep = "Rollback OpenCode profile transaction"
    log(`→ ${rollbackStep}`)
    try {
      await transaction.rollback()
      steps.push({ step: rollbackStep, status: "ok", detail: "Previous OpenCode configuration restored" })
    } catch (error) {
      steps.push({ step: rollbackStep, status: "failed", detail: messageOf(error) })
    }
  }
}

// ---------------------------------------------------------------------------
// DSH installation
// ---------------------------------------------------------------------------

async function runDshInstall(
  plan: InstallPlan,
  ctx: StepContext
): Promise<void> {
  const { dryRun, log, steps, options } = ctx

  // Agent-Venom DSH preset
  await syncAgentVenomDshPreset(plan, ctx)

  // ECC DSH adapter — full adapter is a separate phase; stub clearly.
  const eccStep = "Install ECC DSH adapter"
  log(`→ ${eccStep} (not yet implemented)`)
  steps.push({
    step: eccStep,
    status: "skipped",
    detail: "ECC DSH adapter generation is planned but not yet implemented."
  })
}

// ---------------------------------------------------------------------------
// DSH preset sync — mirrors Agent-Venom sync-preset.js pattern
// ---------------------------------------------------------------------------

/**atomatically
 * Synchronize the Agent-Venom DSH preset files into $DSH_HOME/.agent-presets/agent-venom/.
 *
 * The preset files are owned by Agent-Venom (not ECC). They are generated from
 * the configured model roles and written automatically. ECC's DSH adapter is a
 * separate future phase.
 */
async function syncAgentVenomDshPreset(
  plan: InstallPlan,
  ctx: StepContext
): Promise<void> {
  const { dryRun, log, steps } = ctx
  const step = "Sync Agent-Venom DSH preset"
  log(`→ ${step}`)

  if (dryRun) {
    steps.push({ step, status: "ok", detail: "dry-run: would sync preset files to $DSH_HOME/.agent-presets/agent-venom/" })
    return
  }

  try {
    const dshHome = process.env.DSH_HOME || join(homedir(), ".dsh")
    const targetRoot = join(dshHome, ".agent-presets", "agent-venom")
    await mkdir(targetRoot, { recursive: true })

    await syncPresetFile(
      join(targetRoot, "preset.yml"),
      buildAgentVenomPresetYml()
    )

    await syncPresetFile(
      join(targetRoot, "agent.cordis.yml"),
      buildAgentVenomCordisYml()
    )

    steps.push({ step, status: "ok", detail: `Preset synchronized to ${targetRoot}` })
  } catch (error) {
    steps.push({
      step,
      status: "failed",
      detail: `DSH preset sync failed: ${messageOf(error)}`
    })
  }
}

async function syncPresetFile(targetPath: string, content: string): Promise<void> {
  let existing: string | undefined
  try {
    existing = await readFile(targetPath, "utf8")
  } catch {
    existing = undefined
  }
  if (existing !== content) {
    await writeFile(targetPath, content, { encoding: "utf8", mode: 0o644 })
  }
}

/** Generate a minimal preset.yml for Agent-Venom's DSH profile. */
function buildAgentVenomPresetYml(): string {
  return [
    "name: Agent-Venom",
    "description: Master-controlled six-stage development pipeline (Researcher → Designer → Implementer → Optimizer → Tester → Reviewer).",
    ""
  ].join("\n")
}

/**
 * Generate the Agent-Venom cordis composition YAML.
 *
 * This mirrors the Agent-Venom pattern: standard DSH tool plugins plus the
 * Agent-Venom master persona with the six route-locked pipeline workers.
 * The model role IDs come from the install plan (env), not from hardcoded strings.
 */
function buildAgentVenomCordisYml(): string {
  // The generated YAML is a template. When full model-role configuration is
  // wired in, the plan will carry the resolved model IDs. For now we emit
  // placeholders that match the default OmniRoute values from defaults.ts.
  return `# Agent-Venom DSH preset
#
# Generated by agent-venom. Re-run 'agent-venom install dsh' to regenerate.
# Do not edit this file directly.

# ── coding shell ──────────────────────────────────────────────────────────────

- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'

- id: tool-pwsh
  name: '@deepseek-ai/dsh-tool-pwsh'
  disabled: !!js process.platform !== 'win32'

# ── filesystem ────────────────────────────────────────────────────────────────

- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'

- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
  config:
    sampleOverCapGlobResults: false

# ── background jobs ───────────────────────────────────────────────────────────

- id: tool-jobs
  name: '@deepseek-ai/dsh-tool-jobs'

# ── skills ────────────────────────────────────────────────────────────────────

- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'

- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'

# ── standard coding-agent capabilities ───────────────────────────────────────

- id: agent-instructions
  name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536

- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config:
        thresholdChars: 8192
        headChars: 4096
        tailChars: 1024

- id: tool-str-replace-editor
  name: '@deepseek-ai/dsh-tool-str-replace-editor'
  config:
    maxOutputChars: 16000

# ── Agent-Venom Master ────────────────────────────────────────────────────────

- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    agentOptions:
      provider: omniroute
      model: free-reasoning
    systemPrompt: |
      You are the Agent-Venom Master. Orchestrate the six-stage development
      pipeline: Researcher → Designer → Implementer → Optimizer → Tester → Reviewer.
      Present route options to the user and lock the approved route before
      dispatching to a pipeline worker. Never skip user approval.

# ── Pipeline workers ──────────────────────────────────────────────────────────

- id: pipeline-worker-deep
  name: '@deepseek-ai/dsh-subagent'
  config:
    agentOptions:
      provider: omniroute
      model: free-coding-deep

- id: pipeline-worker-standard
  name: '@deepseek-ai/dsh-subagent'
  config:
    agentOptions:
      provider: omniroute
      model: free-coding-standard

- id: pipeline-worker-fast
  name: '@deepseek-ai/dsh-subagent'
  config:
    agentOptions:
      provider: omniroute
      model: free-coding-fast

- id: pipeline-worker-reasoning
  name: '@deepseek-ai/dsh-subagent'
  config:
    agentOptions:
      provider: omniroute
      model: free-reasoning

- id: pipeline-worker-context
  name: '@deepseek-ai/dsh-subagent'
  config:
    agentOptions:
      provider: omniroute
      model: free-context

- id: pipeline-worker-vision
  name: '@deepseek-ai/dsh-subagent'
  config:
    agentOptions:
      provider: omniroute
      model: free-vision
`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StepContext {
  dryRun: boolean
  log: (msg: string) => void
  steps: InstallStepResult[]
  options: ExecuteInstallOptions
}

function buildResult(plan: InstallPlan, steps: InstallStepResult[]): InstallResult {
  return {
    runtime: plan.runtime,
    environment: plan.environment,
    steps,
    success: steps.every(s => s.status !== "failed")
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Detect whether the npm global prefix is writable.  On Linux / WSL the
 * system prefix (`/usr/local`) is typically root-owned, so we need sudo.
 */
async function detectNpmNeedsElevation(plan: InstallPlan): Promise<boolean> {
  // On Windows native, npm global prefix is user-writable — no elevation.
  if (process.platform === "win32") {
    return false
  }

  // Check the current npm global prefix writability.
  try {
    const { stdout } = await execFileAsync("npm", ["config", "get", "prefix"], {
      env: process.env,
      timeout: 5_000
    })
    const prefix = stdout.trim()
    // Try to create a temp directory to test write access.
    const testDir = join(prefix, ".agent-venom-write-test")
    try {
      await mkdir(testDir, { recursive: true })
      // Clean up — remove the test directory.
      const { rmdir } = await import("node:fs/promises")
      await rmdir(testDir)
      return false // prefix is writable — no sudo needed
    } catch {
      return true // prefix not writable — sudo needed
    }
  } catch {
    // Can't determine — assume sudo is needed on Linux/WSL.
    return true
  }
}

/**
 * Run `npm install -g <package>` with optional sudo elevation.
 * Uses `sudo -S` to read the password from stdin.
 * Returns a detail string on success, throws on failure.
 */
async function npmInstallGlobal(
  packageName: string,
  options: { sudo?: boolean; sudoPassword?: string | undefined } = {}
): Promise<string> {
  const args = ["install", "-g", packageName]

  if (options.sudo && options.sudoPassword) {
    // Use sudo -S to read password from stdin
    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = execFile("sudo", ["-S", "npm", ...args], {
        env: process.env,
        timeout: 300_000
      }, (error, stdout, stderr) => {
        if (error) {
          reject(error)
        } else {
          resolve({ stdout: stdout || "", stderr: stderr || "" })
        }
      })

      // Write the password to stdin
      if (child.stdin) {
        child.stdin.write(options.sudoPassword + "\n")
        child.stdin.end()
      }
    })

    return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n")
  }

  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm"
  const { stdout, stderr } = await execFileAsync(npmBin, args, {
    env: process.env,
    timeout: 300_000
  })
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n")
}
