import { runProcess, type ProcessResult } from "../../execution/process.js"

export interface WslExecutionOptions {
  distro?: string
  timeout?: number
}

export async function runWslCommand(
  command: string,
  args: readonly string[],
  options: WslExecutionOptions = {}
): Promise<ProcessResult> {
  const shellCommand = [
    loadShellProfiles(),
    "exec",
    shellQuote(command),
    ...args.map(shellQuote)
  ].join(" ")
  const wslArgs = options.distro
    ? ["-d", options.distro, "--", "bash", "-lc", shellCommand]
    : ["--", "bash", "-lc", shellCommand]

  return runProcess(
    "wsl.exe",
    wslArgs,
    options.timeout === undefined ? {} : { timeout: options.timeout }
  )
}

function loadShellProfiles(): string {
  return "if [ -f ~/.bash_profile ]; then . ~/.bash_profile; fi; "
    + "if [ -f ~/.bashrc ]; then . ~/.bashrc; fi;"
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}