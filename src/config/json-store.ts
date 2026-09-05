import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T
  } catch (error) {
    if (isMissingFile(error)) return undefined
    throw new Error(`Unable to read JSON file '${path}': ${messageOf(error)}`)
  }
}

export async function writeJsonFileAtomic<T>(path: string, value: T): Promise<void> {
  const directory = dirname(path)
  const temporaryPath = join(directory, `.${Date.now()}-${process.pid}.tmp`)
  await mkdir(directory, { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  })
  await rename(temporaryPath, path)
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}