import type { ReadStream, WriteStream } from "node:tty"
import { createInterface } from "node:readline"

export interface SelectionOption<T extends string> {
  label: string
  value: T
}

export async function selectOption<T extends string>(
  prompt: string,
  options: readonly SelectionOption<T>[],
  input: ReadStream = process.stdin,
  output: WriteStream = process.stdout
): Promise<T> {
  if (options.length === 0) {
    throw new Error("Interactive selector requires at least one option")
  }
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Interactive selection requires a TTY; provide explicit non-interactive options")
  }

  let selectedIndex = 0
  input.setRawMode(true)
  input.resume()
  output.write("\x1b[?25l")

  const render = (): void => {
    output.write("\x1b[2J\x1b[H")
    output.write(`${prompt}\n\n`)
    options.forEach((option, index) => {
      output.write(`${index === selectedIndex ? "❯" : " "} ${option.label}\n`)
    })
    output.write("\nUse Up/Down and Enter to select.\n")
  }

  render()

  try {
    return await new Promise<T>((resolve, reject) => {
      const onData = (chunk: Buffer): void => {
        const key = chunk.toString()
        if (key === "\u0003" || key === "\u001b") {
          reject(new Error("Interactive selection cancelled"))
          return
        }
        if (key === "\r" || key === "\n") {
          const option = options[selectedIndex]
          if (option) resolve(option.value)
          return
        }
        if (key === "\u001b[A" || key === "k") {
          selectedIndex = (selectedIndex + options.length - 1) % options.length
          render()
          return
        }
        if (key === "\u001b[B" || key === "j") {
          selectedIndex = (selectedIndex + 1) % options.length
          render()
        }
      }

      input.on("data", onData)
      input.once("close", () => reject(new Error("Interactive input closed")))
    })
  } finally {
    input.removeAllListeners("data")
    input.setRawMode(false)
    input.pause()
    output.write("\x1b[?25h\n")
  }
}

/**
 * Present a set of checkboxes where the user can toggle individual items
 * with Space and confirm with Enter. At least one item must be selected.
 */
export async function selectMultiple<T extends string>(
  prompt: string,
  options: readonly SelectionOption<T>[],
  input: ReadStream = process.stdin,
  output: WriteStream = process.stdout
): Promise<T[]> {
  if (options.length === 0) {
    throw new Error("Multi-select requires at least one option")
  }
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Interactive selection requires a TTY; provide explicit non-interactive options")
  }

  let cursorIndex = 0
  // All start unchecked; user must explicitly select at least one
  const checked = new Array<boolean>(options.length).fill(false)
  input.setRawMode(true)
  input.resume()
  output.write("\x1b[?25l")

  const render = (): void => {
    output.write("\x1b[2J\x1b[H")
    output.write(`${prompt}\n\n`)
    options.forEach((option, index) => {
      const checkmark = checked[index] ? "✓" : " "
      const arrow = index === cursorIndex ? "❯" : " "
      output.write(`${arrow} [${checkmark}] ${option.label}\n`)
    })
    output.write("\nSpace to toggle, Enter to confirm, Esc/Ctrl-C to cancel.\n")
    const selected = options.filter((_, i) => checked[i]).map(o => o.label)
    if (selected.length > 0) {
      output.write(`Selected: ${selected.join(", ")}\n`)
    }
  }

  render()

  try {
    return await new Promise<T[]>((resolve, reject) => {
      const onData = (chunk: Buffer): void => {
        const key = chunk.toString()
        if (key === "\u0003" || key === "\u001b") {
          reject(new Error("Interactive selection cancelled"))
          return
        }
        if (key === "\r" || key === "\n") {
          const selected = options
            .filter((_, i) => checked[i])
            .map(o => o.value)
          if (selected.length === 0) {
            // Require at least one selection; do not resolve
            output.write("\x1b[1A\x1b[2K") // erase the last status line
            output.write("  Please select at least one option.\n")
            return
          }
          resolve(selected)
          return
        }
        if (key === " ") {
          checked[cursorIndex] = !checked[cursorIndex]
          render()
          return
        }
        if (key === "\u001b[A" || key === "k") {
          cursorIndex = (cursorIndex + options.length - 1) % options.length
          render()
          return
        }
        if (key === "\u001b[B" || key === "j") {
          cursorIndex = (cursorIndex + 1) % options.length
          render()
        }
      }

      input.on("data", onData)
      input.once("close", () => reject(new Error("Interactive input closed")))
    })
  } finally {
    input.removeAllListeners("data")
    input.setRawMode(false)
    input.pause()
    output.write("\x1b[?25h\n")
  }
}

/**
 * Prompt the user for a secret value without echoing characters.
 * Returns the trimmed value. Never logs it.
 */
export async function promptSecret(
  prompt: string,
  input: ReadStream = process.stdin,
  output: WriteStream = process.stdout
): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Secret prompt requires a TTY; provide the value via environment variable")
  }

  output.write(`${prompt} `)

  const rl = createInterface({ input, output, terminal: false })
  // Suppress echo by removing the stream line writer
  ;(rl as { output?: unknown }).output = undefined

  input.setRawMode(true)
  input.resume()

  const chars: string[] = []

  try {
    return await new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer): void => {
        const key = chunk.toString()
        if (key === "\u0003") {
          reject(new Error("Secret input cancelled"))
          return
        }
        if (key === "\r" || key === "\n") {
          output.write("\n")
          resolve(chars.join("").trim())
          return
        }
        if (key === "\u007f" || key === "\b") {
          // Backspace
          chars.pop()
          return
        }
        // Ignore control sequences
        if (key.startsWith("\u001b")) return
        chars.push(key)
      }

      input.on("data", onData)
      input.once("close", () => reject(new Error("Secret input closed")))
    })
  } finally {
    rl.close()
    input.removeAllListeners("data")
    input.setRawMode(false)
    input.pause()
  }
}

/**
 * Prompt the user for a yes/no confirmation.
 * Returns true if the user confirmed, false otherwise.
 */
export async function promptConfirm(
  prompt: string,
  input: ReadStream = process.stdin,
  output: WriteStream = process.stdout
): Promise<boolean> {
  if (!input.isTTY || !output.isTTY) {
    // In non-interactive mode, default to yes for --yes flag, no otherwise.
    return false
  }

  output.write(`${prompt} [Y/n] `)

  const rl = createInterface({ input, output })
  try {
    return await new Promise<boolean>((resolve) => {
      rl.question("", (answer) => {
        rl.close()
        const trimmed = answer.trim().toLowerCase()
        resolve(trimmed === "" || trimmed === "y" || trimmed === "yes")
      })
    })
  } finally {
    rl.close()
  }
}

/**
 * Prompt the user for a password (hidden input) without echoing characters.
 * Returns the password string, or null if cancelled.
 * Used for sudo password prompts.
 */
export async function promptPassword(
  prompt: string,
  input: ReadStream = process.stdin,
  output: WriteStream = process.stdout
): Promise<string | null> {
  if (!input.isTTY || !output.isTTY) {
    return null // cannot prompt in non-interactive mode
  }

  output.write(`${prompt}: `)

  const rl = createInterface({ input, output, terminal: false })
  // Suppress echo
  ;(rl as { output?: unknown }).output = undefined

  input.setRawMode(true)
  input.resume()

  const chars: string[] = []

  try {
    return await new Promise<string | null>((resolve, reject) => {
      const onData = (chunk: Buffer): void => {
        const key = chunk.toString()
        if (key === "\u0003") {
          // Ctrl+C — cancel
          output.write("\n")
          resolve(null)
          return
        }
        if (key === "\r" || key === "\n") {
          output.write("\n")
          resolve(chars.join(""))
          return
        }
        if (key === "\u007f" || key === "\b") {
          // Backspace
          chars.pop()
          return
        }
        // Ignore control sequences
        if (key.startsWith("\u001b")) return
        chars.push(key)
      }

      input.on("data", onData)
      input.once("close", () => resolve(null))
    })
  } finally {
    rl.close()
    input.removeAllListeners("data")
    input.setRawMode(false)
    input.pause()
  }
}