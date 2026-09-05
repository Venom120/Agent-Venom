import { open, readFile, unlink } from "node:fs/promises"
import { dirname } from "node:path"
import { mkdir } from "node:fs/promises"

/**
 * Attempts to acquire an exclusive lock on the given file path.
 * Retries are performed if the lock is held but appears stale.
 * Returns a function to release the lock.
 * Throws if the lock cannot be acquired after retries.
 */
export async function acquireLock(lockPath: string, retries = 3): Promise<() => Promise<void>> {
  await mkdir(dirname(lockPath), { recursive: true })

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // 'wx' fails if the file already exists (atomic create)
      const handle = await open(lockPath, "wx")
      await handle.write(String(process.pid))
      await handle.close()

      // Lock acquired successfully
      let released = false
      return async () => {
        if (released) return
        released = true
        try {
          await unlink(lockPath)
        } catch {
          // Ignore errors during release (e.g. if deleted externally)
        }
      }
    } catch (error: any) {
      if (error?.code !== "EEXIST") {
        throw new Error(`Failed to acquire lock at ${lockPath}: ${error.message}`)
      }

      // Lock exists. Check if it's stale.
      const stale = await isLockStale(lockPath)
      if (stale) {
        try {
          await unlink(lockPath)
          // Lock cleared; loop will retry acquisition
          continue
        } catch (unlinkError: any) {
          if (unlinkError?.code !== "ENOENT") {
            throw new Error(`Failed to clear stale lock at ${lockPath}: ${unlinkError.message}`)
          }
        }
      } else {
        // Lock is active.
        if (attempt === retries) {
          throw new Error(`Lock at ${lockPath} is currently held by another process.`)
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
  }
  throw new Error(`Failed to acquire lock at ${lockPath} after retries.`)
}

async function isLockStale(lockPath: string): Promise<boolean> {
  let content: string
  try {
    content = await readFile(lockPath, "utf8")
  } catch (error: any) {
    // If it disappeared while we were trying to read it, it's effectively stale/gone
    return error?.code === "ENOENT"
  }

  const pid = parseInt(content.trim(), 10)
  if (isNaN(pid)) {
    // Corrupt lock file is considered stale
    return true
  }

  return !isPidAlive(pid)
}

function isPidAlive(pid: number): boolean {
  try {
    // process.kill(pid, 0) checks existence without sending a signal.
    // Works on Windows, Linux, macOS.
    process.kill(pid, 0)
    return true
  } catch (error: any) {
    // ESRCH means no such process (stale).
    // EPERM means the process exists but we don't have permission to signal it (active).
    return error?.code === "EPERM"
  }
}
