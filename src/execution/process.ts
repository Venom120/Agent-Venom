import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface ProcessResult {
  stdout: string
  stderr: string
  exitCode: number
}

export async function runProcess(
  command: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}
): Promise<ProcessResult> {
  try {
    const result = await execFileAsync(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout ?? 30_000,
      windowsHide: true
    })
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
  } catch (error) {
    const processError = error as NodeJS.ErrnoException & {
      stdout?: string
      stderr?: string
      code?: string | number
    }
    return {
      stdout: processError.stdout || "",
      stderr: processError.stderr || processError.message || String(error),
      exitCode: typeof processError.code === "number" ? processError.code : 1
    }
  }
}