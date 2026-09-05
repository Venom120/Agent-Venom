import { execFile } from "node:child_process"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { homedir } from "node:os"
import type { DshLifecycle, DshStatus } from "./dsh-lifecycle.js"
import { DSH_DEFAULT_PORT } from "./dsh-lifecycle.js"
import { DSH_API_KEY_ENV_VAR } from "../../../config/env-file.js"
import { detectDshPaths, type DshPaths } from "./dsh-detect.js"

const execFileAsync = promisify(execFile)

const SERVICE_NAME = "av-dsh"
const AGENT_VENOM_DIR = join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Agent-Venom")
const WINSW_CONFIG = join(AGENT_VENOM_DIR, `${SERVICE_NAME}.xml`)
const WINSW_EXE = join(AGENT_VENOM_DIR, "WinSW.exe")

export class WindowsDshLifecycle implements DshLifecycle {
  private paths: DshPaths | undefined

  private async getPaths(): Promise<DshPaths> {
    if (!this.paths) {
      this.paths = await detectDshPaths()
    }
    return this.paths
  }

  async install(): Promise<void> {
    const paths = await this.getPaths()
    if (paths.binaryPath) {
      return
    }
    await runCommand("npm", ["install", "-g", "@deepseek-ai/dsh"])
    this.paths = undefined
    await this.ensureWinSw()
    await this.generateWinSwConfig()
    await this.registerService()
  }

  async start(): Promise<void> {
    await runCommand("sc", ["start", SERVICE_NAME])
  }

  async stop(): Promise<void> {
    await runCommand("sc", ["stop", SERVICE_NAME])
  }

  async restart(): Promise<void> {
    await runCommand("sc", ["stop", SERVICE_NAME])
    await new Promise(r => setTimeout(r, 2000))
    await runCommand("sc", ["start", SERVICE_NAME])
  }

  async status(): Promise<DshStatus> {
    const paths = await this.getPaths()
    const installed = !!paths.binaryPath
    if (!installed) {
      return { installed: false, running: false, port: DSH_DEFAULT_PORT, serviceType: "winsw" }
    }

    const version = await this.getVersion(paths)
    try {
      const result = await runCommand("sc", ["query", SERVICE_NAME], { timeout: 5000 })
      const output = result.stdout
      const running = output.includes("RUNNING")
      const pidMatch = output.match(/PID\s*:\s*(\d+)/)
      const pid = pidMatch ? parseInt(pidMatch[1]!, 10) : undefined
      return { installed: true, running, pid, version, port: DSH_DEFAULT_PORT, serviceType: "winsw" }
    } catch {
      return { installed: true, running: false, version, port: DSH_DEFAULT_PORT, serviceType: "winsw" }
    }
  }

  async uninstall(): Promise<void> {
    await runCommand("sc", ["stop", SERVICE_NAME]).catch(() => {})
    await runCommand("sc", ["delete", SERVICE_NAME]).catch(() => {})
    try {
      const { unlink } = await import("node:fs/promises")
      await unlink(WINSW_CONFIG)
      await unlink(WINSW_EXE)
    } catch {}
    const paths = await this.getPaths()
    if (paths.installMethod === "npm") {
      await runCommand("npm", ["uninstall", "-g", "@deepseek-ai/dsh"])
    }
  }

  private async ensureWinSw(): Promise<void> {
    try {
      await readFile(WINSW_EXE)
      return
    } catch {}

    await mkdir(AGENT_VENOM_DIR, { recursive: true })
    const downloadUrl = "https://github.com/winsw/winsw/releases/latest/download/WinSW.exe"
    await runCommand("curl", ["-L", "-o", WINSW_EXE, downloadUrl], { timeout: 60_000 })
  }

  private async generateWinSwConfig(): Promise<void> {
    const paths = await this.getPaths()
    const apiKey = process.env[DSH_API_KEY_ENV_VAR] || ""
    const binaryPath = paths.binaryPath || "dsh"
    const dshHome = paths.dshHome

    const config = [
      "<service>",
      `  <id>${SERVICE_NAME}</id>`,
      "  <name>Agent-Venom DeepSeek Harness</name>",
      "  <description>DeepSeek Harness managed by Agent-Venom</description>",
      `  <executable>${binaryPath}</executable>`,
      "  <arguments>web --no-open</arguments>",
      `  <workingdirectory>${dshHome}</workingdirectory>`,
      `  <env name="DSH_HOME" value="${dshHome}"/>`,
      `  <env name="AV_DSH_API_KEY" value="${apiKey}"/>`,
      `  <env name="NODE_OPTIONS" value="--max-old-space-size=8192"/>`,
      "  <onfailure action=\"restart\" delay=\"10 sec\"/>",
      "  <onfailure action=\"restart\" delay=\"20 sec\"/>",
      `  <logpath>${AGENT_VENOM_DIR}</logpath>`,
      "  <log mode=\"roll-by-size\">",
      "    <sizeThreshold>10240</sizeThreshold>",
      "    <keepFiles>5</keepFiles>",
      "  </log>",
      "</service>",
      ""
    ].join("\n")

    await writeFile(WINSW_CONFIG, config, { encoding: "utf8" })
  }

  private async registerService(): Promise<void> {
    await runCommand(WINSW_EXE, ["install"])
    await runCommand(WINSW_EXE, ["start"])
  }

  private async getVersion(paths: DshPaths): Promise<string | undefined> {
    if (!paths.binaryPath) return undefined
    try {
      const result = await runCommand(paths.binaryPath, ["--version"], { timeout: 5000 })
      return result.stdout.trim().split("\n")[0]
    } catch {
      return undefined
    }
  }
}

interface RunOptions {
  timeout?: number
}

async function runCommand(
  command: string,
  args: string[],
  options: RunOptions = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync(command, args, {
      timeout: options.timeout ?? 30_000,
      windowsHide: true
    })
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: string | number }
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || String(error),
      exitCode: typeof err.code === "number" ? err.code : 1
    }
  }
}
