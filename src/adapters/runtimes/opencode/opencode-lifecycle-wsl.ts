import type { OpenCodeLifecycle, OpenCodeStatus } from "./opencode-lifecycle.js"
import { OPENCODE_DEFAULT_PORT } from "./opencode-lifecycle.js"
import { runWslCommand } from "../../platforms/wsl.js"
import { OPENCODE_API_KEY_ENV_VAR } from "../../../config/env-file.js"
import { detectOpenCodePathsWsl, type OpenCodePaths } from "./opencode-detect.js"

const SERVICE_NAME = "av-opencode"

export class WslOpenCodeLifecycle implements OpenCodeLifecycle {
  private paths: OpenCodePaths | undefined

  private async getPaths(): Promise<OpenCodePaths> {
    if (!this.paths) {
      this.paths = await detectOpenCodePathsWsl()
    }
    return this.paths
  }

  async install(): Promise<void> {
    const paths = await this.getPaths()
    if (paths.binaryPath) {
      return
    }
    await runWsl("npm", ["install", "-g", "opencode-ai"])
    this.paths = undefined
  }

  async start(): Promise<void> {
    if (await this.hasSystemd()) {
      await this.generateServiceFile()
      await runWsl("sudo", ["systemctl", "daemon-reload"])
      await runWsl("sudo", ["systemctl", "start", SERVICE_NAME])
    } else {
      await this.startBackgroundProcess()
    }
  }

  async stop(): Promise<void> {
    if (await this.hasSystemd()) {
      await runWsl("sudo", ["systemctl", "stop", SERVICE_NAME])
    } else {
      await this.stopBackgroundProcess()
    }
  }

  async restart(): Promise<void> {
    if (await this.hasSystemd()) {
      await runWsl("sudo", ["systemctl", "restart", SERVICE_NAME])
    } else {
      await this.stopBackgroundProcess()
      await this.startBackgroundProcess()
    }
  }

  async status(): Promise<OpenCodeStatus> {
    const paths = await this.getPaths()
    const installed = !!paths.binaryPath
    if (!installed) {
      return { installed: false, running: false, port: OPENCODE_DEFAULT_PORT, serviceType: "wsl-systemd" }
    }

    const version = await this.getVersion()

    if (await this.hasSystemd()) {
      return this.systemdStatus(version)
    }
    return this.processStatus(version)
  }

  async uninstall(): Promise<void> {
    if (await this.hasSystemd()) {
      await runWsl("sudo", ["systemctl", "stop", SERVICE_NAME]).catch(() => {})
      await runWsl("sudo", ["systemctl", "disable", SERVICE_NAME]).catch(() => {})
      await runWsl("sudo", ["rm", `-f`, `/etc/systemd/system/${SERVICE_NAME}.service`]).catch(() => {})
      await runWsl("sudo", ["systemctl", "daemon-reload"]).catch(() => {})
    }
    await runWsl("npm", ["uninstall", "-g", "opencode-ai"])
  }

  private async hasSystemd(): Promise<boolean> {
    try {
      const result = await runWsl("systemctl", ["--version"], 3000)
      return result.exitCode === 0
    } catch {
      return false
    }
  }

  private async generateServiceFile(): Promise<void> {
    const apiKey = process.env[OPENCODE_API_KEY_ENV_VAR] || ""
    const content = [
      "[Unit]",
      "Description=Agent-Venom OpenCode (WSL)",
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
      "ExecStart=/bin/bash -c 'exec opencode web --hostname 0.0.0.0 --port 4096'",
      "Restart=on-failure",
      "RestartSec=5",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      ""
    ].join("\n")

    const escaped = content.replace(/'/g, "'\\''")
    await runWsl("bash", ["-c", `echo '${escaped}' | sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null`])
  }

  private async systemdStatus(version?: string): Promise<OpenCodeStatus> {
    try {
      const result = await runWsl("systemctl", ["is-active", SERVICE_NAME], 3000)
      const running = result.stdout.trim() === "active"
      let pid: number | undefined
      if (running) {
        const pidResult = await runWsl("systemctl", ["show", SERVICE_NAME, "--property=MainPID"], 3000)
        const pidStr = pidResult.stdout.trim().replace("MainPID=", "")
        pid = parseInt(pidStr, 10) || undefined
      }
      return { installed: true, running, pid, version, port: OPENCODE_DEFAULT_PORT, serviceType: "wsl-systemd" }
    } catch {
      return { installed: true, running: false, version, port: OPENCODE_DEFAULT_PORT, serviceType: "wsl-systemd" }
    }
  }

  private async processStatus(version?: string): Promise<OpenCodeStatus> {
    try {
      const result = await runWsl("bash", ["-c", "pgrep -f 'opencode web' || true"], 3000)
      const pid = parseInt(result.stdout.trim().split("\n")[0] || "", 10)
      const running = !isNaN(pid) && pid > 0
      return { installed: true, running, pid: running ? pid : undefined, version, port: OPENCODE_DEFAULT_PORT, serviceType: "wsl-process" }
    } catch {
      return { installed: true, running: false, version, port: OPENCODE_DEFAULT_PORT, serviceType: "wsl-process" }
    }
  }

  private async startBackgroundProcess(): Promise<void> {
    await runWsl("bash", ["-c", `nohup opencode web --hostname 0.0.0.0 --port ${OPENCODE_DEFAULT_PORT} > /tmp/opencode.log 2>&1 &`])
  }

  private async stopBackgroundProcess(): Promise<void> {
    await runWsl("bash", ["-c", "pkill -f 'opencode web' || true"])
  }

  private async getVersion(): Promise<string | undefined> {
    try {
      const result = await runWsl("opencode", ["--version"], 5000)
      return result.stdout.trim().split("\n")[0]
    } catch {
      return undefined
    }
  }
}

async function runWsl(command: string, args: string[], timeout?: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const options = timeout !== undefined ? { timeout } : {}
  const result = await runWslCommand(command, args, options)
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
}
