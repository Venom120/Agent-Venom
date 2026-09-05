import { execFile } from "node:child_process"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { homedir } from "node:os"
import type { OpenCodeLifecycle, OpenCodeStatus } from "./opencode-lifecycle.js"
import { OPENCODE_DEFAULT_PORT } from "./opencode-lifecycle.js"
import { OPENCODE_API_KEY_ENV_VAR } from "../../../config/env-file.js"
import { detectOpenCodePaths, type OpenCodePaths } from "./opencode-detect.js"

const execFileAsync = promisify(execFile)

const SERVICE_NAME = "av-opencode"
const SERVICE_PATH = `/etc/systemd/system/${SERVICE_NAME}.service`
const PID_FILE_PATH = join(homedir(), ".local", "state", "agent-venom", "opencode.pid")

export class LinuxOpenCodeLifecycle implements OpenCodeLifecycle {
  private paths: OpenCodePaths | undefined

  private async getPaths(): Promise<OpenCodePaths> {
    if (!this.paths) {
      this.paths = await detectOpenCodePaths()
    }
    return this.paths
  }

  async install(): Promise<void> {
    const paths = await this.getPaths()
    if (paths.binaryPath) {
      // Already installed — skip
      return
    }
    await runCommand("npm", ["install", "-g", "opencode-ai"])
    // Re-detect after install
    this.paths = undefined
  }

  async start(): Promise<void> {
    if (await this.hasSystemd()) {
      await this.generateServiceFile()
      await runCommand("sudo", ["systemctl", "daemon-reload"])
      await runCommand("sudo", ["systemctl", "start", SERVICE_NAME])
    } else {
      await this.startBackgroundProcess()
    }
  }

  async stop(): Promise<void> {
    if (await this.hasSystemd()) {
      await runCommand("sudo", ["systemctl", "stop", SERVICE_NAME])
    } else {
      await this.stopBackgroundProcess()
    }
  }

  async restart(): Promise<void> {
    if (await this.hasSystemd()) {
      await runCommand("sudo", ["systemctl", "restart", SERVICE_NAME])
    } else {
      await this.stopBackgroundProcess()
      await this.startBackgroundProcess()
    }
  }

  async status(): Promise<OpenCodeStatus> {
    const paths = await this.getPaths()
    const installed = !!paths.binaryPath
    if (!installed) {
      return { installed: false, running: false, port: OPENCODE_DEFAULT_PORT, serviceType: "systemd" }
    }

    const version = await this.getVersion(paths)

    if (await this.hasSystemd()) {
      return this.systemdStatus(version)
    }
    return this.processStatus(version)
  }

  async uninstall(): Promise<void> {
    if (await this.hasSystemd()) {
      await runCommand("sudo", ["systemctl", "stop", SERVICE_NAME]).catch(() => {})
      await runCommand("sudo", ["systemctl", "disable", SERVICE_NAME]).catch(() => {})
      try {
        const { unlink } = await import("node:fs/promises")
        await unlink(SERVICE_PATH)
      } catch {}
      await runCommand("sudo", ["systemctl", "daemon-reload"]).catch(() => {})
    }
    const paths = await this.getPaths()
    if (paths.installMethod === "npm") {
      await runCommand("npm", ["uninstall", "-g", "opencode-ai"])
    }
    // For irm installs, we don't uninstall — just remove the service
  }

  private async hasSystemd(): Promise<boolean> {
    try {
      const result = await runCommand("systemctl", ["--version"], { timeout: 3000 })
      return result.exitCode === 0
    } catch {
      return false
    }
  }

  private async generateServiceFile(): Promise<void> {
    const paths = await this.getPaths()
    const apiKey = process.env[OPENCODE_API_KEY_ENV_VAR] || ""
    const binaryPath = paths.binaryPath || "opencode"

    const content = [
      "[Unit]",
      "Description=Agent-Venom OpenCode",
      "After=network-online.target",
      "Wants=network-online.target",
      "",
      "[Service]",
      "Type=simple",
      "User=root",
      "WorkingDirectory=/root",
      "Environment=HOME=/root",
      `Environment=AV_OPENCODE_API_KEY=${apiKey}`,
      "Environment=DISPLAY=",
      "Environment=BROWSER=",
      "Environment=OPEN=",
      `ExecStart=/bin/bash -c 'exec ${binaryPath} web --hostname 0.0.0.0 --port ${OPENCODE_DEFAULT_PORT}'`,
      "Restart=on-failure",
      "RestartSec=5",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      ""
    ].join("\n")

    const tmpPath = `/tmp/${SERVICE_NAME}.service.tmp`
    await writeFile(tmpPath, content, { mode: 0o644 })
    await runCommand("sudo", ["cp", tmpPath, SERVICE_PATH])
    await runCommand("sudo", ["rm", tmpPath])
  }

  private async systemdStatus(version?: string): Promise<OpenCodeStatus> {
    try {
      const result = await runCommand("systemctl", ["is-active", SERVICE_NAME], { timeout: 3000 })
      const running = result.stdout.trim() === "active"
      let pid: number | undefined
      if (running) {
        const pidResult = await runCommand("systemctl", ["show", SERVICE_NAME, "--property=MainPID"], { timeout: 3000 })
        const pidStr = pidResult.stdout.trim().replace("MainPID=", "")
        pid = parseInt(pidStr, 10) || undefined
      }
      return { installed: true, running, pid, version, port: OPENCODE_DEFAULT_PORT, serviceType: "systemd" }
    } catch {
      return { installed: true, running: false, version, port: OPENCODE_DEFAULT_PORT, serviceType: "systemd" }
    }
  }

  private async processStatus(version?: string): Promise<OpenCodeStatus> {
    try {
      const pidContent = await readFile(PID_FILE_PATH, "utf8")
      const pid = parseInt(pidContent.trim(), 10)
      if (isNaN(pid)) {
        return { installed: true, running: false, version, port: OPENCODE_DEFAULT_PORT, serviceType: "process" }
      }
      try {
        await runCommand("kill", ["-0", String(pid)], { timeout: 2000 })
        return { installed: true, running: true, pid, version, port: OPENCODE_DEFAULT_PORT, serviceType: "process" }
      } catch {
        return { installed: true, running: false, version, port: OPENCODE_DEFAULT_PORT, serviceType: "process" }
      }
    } catch {
      return { installed: true, running: false, version, port: OPENCODE_DEFAULT_PORT, serviceType: "process" }
    }
  }

  private async startBackgroundProcess(): Promise<void> {
    const paths = await this.getPaths()
    const binaryPath = paths.binaryPath || "opencode"

    const { spawn } = await import("node:child_process")
    const env = {
      ...process.env,
      OPENCODE_ENABLE_EXA: "1",
      AV_OPENCODE_API_KEY: process.env[OPENCODE_API_KEY_ENV_VAR] || ""
    }
    const child = spawn(binaryPath, ["web", "--hostname", "0.0.0.0", "--port", String(OPENCODE_DEFAULT_PORT)], {
      detached: true,
      stdio: "ignore",
      env
    })
    child.unref()

    await mkdir(join(PID_FILE_PATH, ".."), { recursive: true })
    await writeFile(PID_FILE_PATH, String(child.pid), { mode: 0o600 })
  }

  private async stopBackgroundProcess(): Promise<void> {
    try {
      const pidContent = await readFile(PID_FILE_PATH, "utf8")
      const pid = parseInt(pidContent.trim(), 10)
      if (!isNaN(pid)) {
        process.kill(pid, "SIGTERM")
      }
    } catch {}
  }

  private async getVersion(paths: OpenCodePaths): Promise<string | undefined> {
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
  env?: NodeJS.ProcessEnv
}

async function runCommand(
  command: string,
  args: string[],
  options: RunOptions = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync(command, args, {
      timeout: options.timeout ?? 30_000,
      env: options.env,
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
