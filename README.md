# Agent-Venom

`@venom120/agent-venom` is the cross-platform orchestration and installation
layer for Agent-Venom and ECC across OpenCode and DeepSeek Harness.

## Requirements

- Node.js 18 or newer
- npm (comes with Node.js)
- WSL (for Windows + WSL environments)
- sudo (for Linux/WSL when npm prefix is root-owned)

## Quick Start

```bash
npm install -g @venom120/agent-venom
agent-venom install opencode
agent-venom profile use agent-venom
```

## Linux/WSL Note

On Linux and WSL, the npm global prefix (`/usr/local`) is typically root-owned.
When installing OpenCode, you will be prompted for your sudo password. The
password is read securely via stdin and never logged or stored.

## Development

```bash
npm install
npm run build
node dist/cli/main.js --help
```

## Commands

| Command | Description |
|---------|-------------|
| `agent-venom install opencode` | Install OpenCode with Agent-Venom/ECC profiles |
| `agent-venom install opencode --wsl` | Install inside WSL from Windows |
| `agent-venom profile use <name>` | Switch active profile (agent-venom/ecc) |
| `agent-venom profile current` | Show current active profile |
| `agent-venom config show` | Show current configuration |
| `agent-venom config ecc-source <source>` | Set ECC source (upstream/venom120) |
| `agent-venom status` | Show environment detection results |
| `agent-venom doctor` | Check dependency health |

## Platform Support

- Windows native
- Windows + WSL (via `--wsl` flag)
- Linux desktop
- Linux headless

See [AGENTS.md](AGENTS.md) for the approved architecture and Phase 0
decisions.