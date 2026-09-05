import type { DshLifecycle, DshStatus } from "./dsh-lifecycle.js"
import { DSH_DEFAULT_PORT } from "./dsh-lifecycle.js"
import { runWslCommand } from "../../platforms/wsl.js"
import { DSH_API_KEY_ENV_VAR } from "../../../config/env-file.js"
import { detectDshPathsWsl, type DshPaths } from "./dsh-detect.js"

const SERVICE_NAME = "av-dsh"

export class WslDshLifecycle implements DshLifecycle {
  private paths: DshPaths | undefined

  private async getPaths(): Promise<DshPaths> {
    if (!this.paths) {
      this.paths = await detectDshPathsWsl()
    }
    return this.paths
  }

  async install(): Promise<void> {
    const paths = await this.getPaths()
    if (paths.binaryPath) {
      return
    }
    await runWsl("npm", ["install", "-g", "@deepseek-ai/dsh"])
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

  async status(): Promise<DshStatus> {
    const paths = await this.getPaths()
    const installed = !!paths.binaryPath
    if (!installed) {
      return { installed: false, running: false, port: DSH_DEFAULT_PORT, serviceType: "wsl-systemd" }
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
    await runWsl("npm", ["uninstall", "-g", "@deepseek-ai/dsh"])
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
    const apiKey = process.env[DSH_API_KEY_ENV_VAR] || ""
    const content = [
      "[Unit]",
      "Description=Agent-Venom DeepSeek Harness (WSL)",
      "After=network-online.target",
      "Wants=network-online.target",
      "RequiresMountsFor=/root/.dsh",
      "",
      "[Service]",
      "Type=simple",
      "User=root",
      "WorkingDirectory=/root/.dsh",
      "Environment=HOME=/root",
      "Environment=DSH_HOME=/root/.dsh",
      "Environment=NODE_OPTIONS=--max-old-space-size=8192",
      `Environment=AV_DSH_API_KEY=${apiKey}`,
      "Environment=BASH_ENV=/root/.bashrc",
      "ExecStart=/bin/bash -c 'exec dsh web --no-open'",
      "Restart=on-failure",
      "RestartSec=5",
      "KillSignal=SIGTERM",
      "TimeoutStopSec=15",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      ""
    ].join("\n")

    const escaped = content.replace(/'/g, "'\\''")
    await runWsl("bash", ["-c", `echo '${escaped}' | sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null`])
  }

  private async systemdStatus(version?: string): Promise<DshStatus> {
    try {
      const result = await runWsl("systemctl", ["is-active", SERVICE_NAME], 3000)
      const running = result.stdout.trim() === "active"
      let pid: number | undefined
      if (running) {
        const pidResult = await runWsl("systemctl", ["show", SERVICE_NAME, "--property=MainPID"], 3000)
        const pidStr = pidResult.stdout.trim().replace("MainPID=", "")
        pid = parseInt(pidStr, 10) || undefined
      }
      return { installed: true, running, pid, version, port: DSH_DEFAULT_PORT, serviceType: "wsl-systemd" }
    } catch {
      return { installed: true, running: false, version, port: DSH_DEFAULT_PORT, serviceType: "wsl-systemd" }
    }
  }

  private async processStatus(version?: string): Promise<DshStatus> {
    try {
      const result = await runWsl("bash", ["-c", "pgrep -f 'dsh web' || true"], 3000)
      const pid = parseInt(result.stdout.trim().split("\n")[0] || "", 10)
      const running = !isNaN(pid) && pid > 0
      return { installed: true, running, pid: running ? pid : undefined, version, port: DSH_DEFAULT_PORT, serviceType: "wsl-process" }
    } catch {
      return { installed: true, running: false, version, port: DSH_DEFAULT_PORT, serviceType: "wsl-process" }
    }
  }

  private async startBackgroundProcess(): Promise<void> {
    await runWsl("bash", ["-c", `nohup dsh web --no-open > /tmp/dsh.log 2>&1 &`])
  }

  private async stopBackgroundProcess(): Promise<void> {
    await runWsl("bash", ["-c", "pkill -f 'dsh web' || true"])
  }

  private async getVersion(): Promise<string | undefined> {
    try {
      const result = await runWsl("dsh", ["--version"], 5000)
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
