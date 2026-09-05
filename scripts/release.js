#!/usr/bin/env node

/**
 * Agent-Venom Release Script
 *
 * Manages three release channels via npm dist-tags:
 *
 *   stable  → npm tag "latest"   (default install: npm install -g @venom120/agent-venom)
 *   latest  → npm tag "next"     (bleeding edge: npm install -g @venom120/agent-venom@next)
 *   pinned  → npm tag "pinned"   (specific tested version: npm install -g @venom120/agent-venom@pinned)
 *
 * Usage:
 *   node scripts/release.js <channel> [version]
 *
 * Channels:
 *   stable [version]   Publish a stable release (e.g., 0.1.0)
 *   latest [version]   Publish a latest/next release (e.g., 0.1.0-beta.1)
 *   pinned [version]   Pin a specific version as the pinned release
 *   status             Show current dist-tags
 *   promote <version>  Promote a version from latest to stable
 */

import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const PACKAGE_JSON_PATH = join(import.meta.dirname, "..", "package.json")

function run(cmd) {
  console.log(`> ${cmd}`)
  return execSync(cmd, { encoding: "utf8", stdio: "inherit" })
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim()
}

function getVersion() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"))
  return pkg.version
}

function setVersion(version) {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"))
  pkg.version = version
  writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + "\n")
  console.log(`Version set to ${version}`)
}

function showStatus() {
  console.log("\nCurrent package version:", getVersion())
  console.log("\nDist-tags on npm:")
  try {
    const tags = runCapture("npm dist-tag ls @venom120/agent-venom 2>/dev/null || echo '(not published yet)'")
    console.log(tags)
  } catch {
    console.log("(not published yet or package not found)")
  }
  console.log("\nChannel mapping:")
  console.log("  stable → npm tag 'latest'  (default install)")
  console.log("  latest → npm tag 'next'    (bleeding edge)")
  console.log("  pinned → npm tag 'pinned'  (specific version)")
}

function build() {
  console.log("\nBuilding...")
  run("npm run build")
}

function publishStable(version) {
  if (!version) {
    console.error("Usage: node scripts/release.js stable <version>")
    console.error("Example: node scripts/release.js stable 0.1.0")
    process.exit(1)
  }

  // During 0.x, ship clean versions directly — no -next/-beta suffix
  if (version.startsWith("0.") && (version.includes("-next") || version.includes("-beta"))) {
    console.error(`Warning: During 0.x, ship clean versions (${version.replace(/-.*/, "")}) to stable.`)
    console.error("The 0.x signal itself means 'anything may change'.")
    console.error("Only use -next/-beta for genuine previews of upcoming versions.")
    process.exit(1)
  }

  setVersion(version)
  build()

  console.log(`\nPublishing stable release ${version}...`)
  run("npm publish --tag latest --access public")

  // Also tag as stable for clarity
  try {
    run(`npm dist-tag add @venom120/agent-venom@${version} stable`)
  } catch {
    // dist-tag add may fail if tag already exists, that's ok
  }

  // Create git tag
  run(`git tag -a v${version} -m "v${version}: stable release"`)
  run(`git push origin v${version}`)

  console.log(`\n✓ Stable release ${version} published`)
  console.log(`  npm install -g @venom120/agent-venom`)
  console.log(`  npm install -g @venom120/agent-venom@stable`)
}

function publishLatest(version) {
  if (!version) {
    console.error("Usage: node scripts/release.js latest <version>")
    console.error("Example: node scripts/release.js latest 0.1.0-beta.1")
    process.exit(1)
  }

  setVersion(version)
  build()

  console.log(`\nPublishing latest/next release ${version}...`)
  run("npm publish --tag next --access public")

  // Also tag as latest for clarity
  try {
    run(`npm dist-tag add @venom120/agent-venom@${version} latest`)
  } catch {
    // ok
  }

  // Create git tag
  run(`git tag -a v${version}-next -m "v${version}: latest/next release"`)
  run(`git push origin v${version}-next`)

  console.log(`\n✓ Latest release ${version} published`)
  console.log(`  npm install -g @venom120/agent-venom@next`)
  console.log(`  npm install -g @venom120/agent-venom@latest`)
}

function publishPinned(version) {
  if (!version) {
    console.error("Usage: node scripts/release.js pinned <version>")
    console.error("Example: node scripts/release.js pinned 0.0.1-alpha")
    process.exit(1)
  }

  setVersion(version)
  build()

  console.log(`\nPublishing pinned release ${version}...`)
  run(`npm publish --tag pinned --access public`)

  // Create git tag
  run(`git tag -a v${version}-pinned -m "v${version}: pinned release"`)
  run(`git push origin v${version}-pinned`)

  console.log(`\n✓ Pinned release ${version} published`)
  console.log(`  npm install -g @venom120/agent-venom@pinned`)
  console.log(`  npm install -g @venom120/agent-venom@${version}`)
}

function promote(version) {
  if (!version) {
    console.error("Usage: node scripts/release.js promote <version>")
    console.error("Example: node scripts/release.js promote 0.1.0-beta.1")
    process.exit(1)
  }

  console.log(`\nPromoting ${version} to stable...`)
  run(`npm dist-tag add @venom120/agent-venom@${version} latest`)
  run(`npm dist-tag add @venom120/agent-venom@${version} stable`)

  console.log(`\n✓ ${version} is now the stable release`)
  console.log(`  npm install -g @venom120/agent-venom`)
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const [,, command, version] = process.argv

switch (command) {
  case "stable":
    publishStable(version)
    break
  case "latest":
    publishLatest(version)
    break
  case "pinned":
    publishPinned(version)
    break
  case "promote":
    promote(version)
    break
  case "status":
    showStatus()
    break
  default:
    console.log("Agent-Venom Release Script")
    console.log("")
    console.log("Usage:")
    console.log("  node scripts/release.js stable <version>   Publish stable release")
    console.log("  node scripts/release.js latest <version>   Publish latest/next release")
    console.log("  node scripts/release.js pinned <version>   Pin a specific version")
    console.log("  node scripts/release.js promote <version>  Promote latest to stable")
    console.log("  node scripts/release.js status             Show current dist-tags")
    console.log("")
    console.log("Channels:")
    console.log("  stable  → npm 'latest'  (default: npm install -g @venom120/agent-venom)")
    console.log("  latest  → npm 'next'    (bleeding edge: npm install -g @venom120/agent-venom@next)")
    console.log("  pinned  → npm 'pinned'  (specific: npm install -g @venom120/agent-venom@pinned)")
    console.log("")
    console.log("Git tags:")
    console.log("  stable  → v{version}")
    console.log("  latest  → v{version}-next")
    console.log("  pinned  → v{version}-pinned")
    console.log("")
    console.log("Examples:")
    console.log("  node scripts/release.js stable 0.1.0")
    console.log("  node scripts/release.js latest 0.1.0-beta.1")
    console.log("  node scripts/release.js pinned 0.0.1-alpha")
    console.log("  node scripts/release.js promote 0.1.0-beta.1")
    break
}
