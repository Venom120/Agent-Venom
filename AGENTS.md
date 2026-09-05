# Agent-Venom Architecture and Phase 0 Decisions

## Scope

Agent-Venom is the cross-platform orchestration and installation layer for
Agent-Venom and ECC across OpenCode and DeepSeek Harness (DSH).

Supported implementation targets for v1:

- Windows native
- Windows with WSL
- Linux desktop
- Linux headless

macOS is a designed-but-not-implemented target for v1. Core code must not
depend on macOS-specific behavior so a later platform adapter can be added.

OmniRoute is outside Agent-Venom's installation and provider-management
scope. Agent-Venom detects and documents OmniRoute, but does not install,
configure, or own its providers.

`ONLY_FOR_CONTEXT/` is reference material only. It must not become a runtime
dependency, package source, or implementation location.

## Ownership Boundaries

### Agent-Venom owns

- CLI and command orchestration
- Environment and dependency detection
- Runtime adapters for OpenCode and DSH
- Platform adapters for Windows, WSL, Linux, and future macOS
- Persistent state and migration
- OpenCode profile management and safe configuration merging
- ECC source resolution and cache management
- ECC-to-DSH orchestration and compatibility handling
- Tray-to-CLI bridge and startup management
- Doctor, repair, update, rollback, and transaction handling
- OmniRoute documentation and integration checks

### Agent-Venom pipeline owns

- The six-stage Agent-Venom pipeline
- Agent-Venom agent definitions
- Agent-Venom OpenCode loader
- Agent-Venom DSH preset source
- Agent-Venom-specific runtime behavior

### ECC owns

- Canonical ECC agents, skills, commands, hooks, rules, and manifests
- ECC-native OpenCode integration
- ECC-native install targets
- ECC-native DSH adapter work intended for upstream contribution

Agent-Venom must not vendor or duplicate ECC's canonical `agents/`,
`skills/`, `commands/`, `hooks/`, or `rules/` trees.

ECC is not a canonical directory in the Agent-Venom repository structure.
When source checkout integration is implemented, ECC is represented by a
dedicated Git submodule/source checkout boundary rather than copied into
Agent-Venom's `agents/`, `skills/`, `commands/`, `hooks/`, or `rules/`
directories. The exact submodule path must remain clearly separate from
Agent-Venom-owned assets.

## Architectural Rules

1. Core logic must depend on interfaces, not `process.platform` checks.
2. Environment detection produces an explicit environment descriptor.
3. Platform adapters own paths, process execution, services, startup, tray,
	elevation, and WSL boundaries.
4. Runtime adapters own OpenCode/DSH detection, configuration, lifecycle,
	and runtime-specific validation.
5. Agent/profile adapters own source resolution and runtime representation.
6. The tray invokes the same command/application layer as the CLI; it must
	not contain duplicated business logic.
7. Agent-Venom's OpenCode loader remains read-only with respect to the active
	OpenCode configuration.
8. ECC source defaults to upstream `affaan-m/ECC`. The persistent source can
	be changed with `agent-venom config ecc-source venom120`; `--agent-venom`
	selects the fork for one command.
9. ECC source selection must be independent of Agent-Venom code changes and
	must support release tags, a latest-release channel, and explicit commits.
10. The resolved ECC tag, commit, source URL, checksum, and update channel
	 must be recorded in Agent-Venom state.
11. Shell command construction from user or repository data is prohibited;
	 use argument-array process APIs and validate paths/URLs/refs.
12. Installation, profile switching, generation, and repair are idempotent,
	 lock-protected, validated, and atomic where practical.
13. Unknown user configuration is user-owned by default and must be retained.

## Repository Structure

The repository follows ECC's canonical root layout for content and adapters,
with explicit orchestration domains:

```text
agent-venom/
├── agents/                  # Agent-Venom canonical agents
├── skills/                  # Agent-Venom skills
├── commands/                # CLI/workflow command definitions
├── hooks/                   # Agent-Venom hooks, if needed
├── rules/                   # Agent-Venom rules
├── runtimes/                # Runtime schemas and profile definitions
│   ├── opencode/
│   └── dsh/
├── @/ecc/                   # Managed ECC submodule/source boundary
├── adapters/
│   ├── agents/              # Agent-Venom and ECC source adapters
│   ├── runtimes/            # OpenCode and DSH adapters
│   └── platforms/           # Windows, WSL, Linux, future macOS
├── profiles/                # Logical profile definitions only
├── scripts/                 # Build, generation, release, and tooling
├── src/
│   ├── cli/
│   ├── core/
│   ├── config/
│   ├── state/
│   ├── environment/
│   ├── execution/
│   ├── dependencies/
│   ├── lifecycle/
│   ├── migration/
│   └── logging/
├── tray/                    # Thin platform UI bridges
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── fixtures/
│   ├── cross-platform/
│   └── acceptance/
├── docs/
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md
```

The repository tree must not contain a copied `ECC/` asset tree. ECC source
selection is an integration concern and is resolved through the `@/ecc`
submodule/source boundary. `@/ecc` remains separate from Agent-Venom-owned
canonical assets and is not imported as an Agent-Venom runtime module by
default.

## Core Model

```text
Agent/Profile
		↓
Runtime Adapter
		↓
Platform Adapter
		↓
Execution Context
```

Initial runtime adapters:

- OpenCode
- DSH

Initial environment model:

- WindowsNative
- WindowsWSL
- LinuxDesktop
- LinuxHeadless
- MacOSFuture

## OpenCode Configuration Ownership

Agent-Venom supports both `opencode.json` and `opencode.jsonc`, preserving
the existing filename. It must use a JSONC-capable parser and deterministic
serializer rather than `JSON.parse` alone.

The effective configuration is:

```text
user-owned configuration
+ Agent-Venom-managed configuration
+ runtime-required configuration
```

Ownership is tracked in an external Agent-Venom state manifest. Managed
entries have stable IDs and are replaced semantically. User plugins,
providers, comments, and unrelated settings are preserved whenever valid.

Profile identity is based on the canonical managed configuration and source
metadata, not a raw whole-file hash, because preserved user entries change
the active file.

Profile changes must:

1. acquire a lock;
2. parse and validate the active and target documents;
3. retain unknown/user-owned entries;
4. create a backup;
5. validate the merged document;
6. atomatically replace the active file;
7. restart and health-check the runtime when requested;
8. record state only after success;
9. restore the previous file and state on failure.

## ECC Strategy

ECC is consumed through a configurable Git submodule/source checkout boundary.
The checkout is managed independently from Agent-Venom-owned canonical assets.
The source URL, selected release tag or commit, resolved commit, checksum,
adapter version, and generated output are recorded independently.

The default source is upstream:

```text
affaan-m/ECC
```

Until the upstream DSH work is accepted, this explicit flag selects the fork:

```text
agent-venom install opencode --agent-venom
```

The flag is a source selector, not a different Agent-Venom product. The
implementation must not hardcode fork-only behavior into the general ECC
adapter.

Release policy:

- Default channel: latest compatible upstream release tag.
- Reproducibility: resolve the tag to a commit and record it.
- Stable installations: retain the resolved commit until `agent-venom update`
	is explicitly requested.
- Advanced users: allow an explicit tag or commit override.
- Fork mode: apply the same release/latest/explicit-commit policy to
	`Venom120/ECC`.

The submodule or managed source checkout must be updated explicitly; package
installation must not silently move an existing ECC source to a new commit.

The first Agent-Venom implementation may own compatibility orchestration for
ECC-to-DSH. Reusable ECC-native DSH target support should be developed in
`Venom120/ECC` and proposed upstream to `affaan-m/ECC`.

ECC assets are parsed and generated programmatically. Hundreds of manual DSH
entries must not be copied or maintained.

## Agent-Venom Release Channels

Agent-Venom uses three npm dist-tag channels for package releases:

| Channel | npm tag | Install command | Purpose |
|---------|---------|-----------------|---------|
| **stable** | `latest` | `npm install -g @venom120/agent-venom` | Default, tested release |
| **latest** | `next` | `npm install -g @venom120/agent-venom@next` | Bleeding edge, new features |
| **pinned** | `pinned` | `npm install -g @venom120/agent-venom@pinned` | Specific tested version |

### Version scheme

- **stable**: semver (`0.1.0`, `0.2.0`, `1.0.0`)
- **latest**: pre-release tags (`0.1.0-beta.1`, `0.1.0-rc.1`)
- **pinned**: any specific version (`0.0.1-alpha`, `0.1.0`)

### Release workflow

- `node scripts/release.js stable 0.1.0` — publish stable
- `node scripts/release.js latest 0.1.0-beta.1` — publish latest/next
- `node scripts/release.js pinned 0.0.1-alpha` — pin a version
- `node scripts/release.js promote 0.1.0-beta.1` — promote latest to stable
- `node scripts/release.js status` — show current dist-tags

### Git tags

- Stable releases get a `v{version}` tag (e.g., `v0.1.0`)
- Latest releases get a `v{version}-next` tag
- Pinned releases get a `v{version}-pinned` tag

### Channel policy

- `stable` is the default channel for `npm install`.
- `latest` is for features under active development that may have rough edges.
- `pinned` is for specific known-good versions users can lock to.
- A version can be promoted from `latest` to `stable` after testing.
- The `pinned` channel is manually managed; it does not auto-update.
- During `0.x`, ship clean versions (`0.1.0`, `0.2.0`) directly to `stable`/`latest`.
  The `0.x` major-zero is itself SemVer's "anything may change" signal.
  Reserve `-next`/`-beta` suffixes for genuine previews of upcoming versions.
- npm 11+ hard-errors when publishing a prerelease without `--tag`.
  Always pass `--tag` explicitly for prerelease versions.
- Use a single `main` branch. Tags mark releases. Dist-tags route consumers.
  Git branches are for code management, not release distribution.

## State

State is separate from runtime user configuration and records:

- schema and Agent-Venom versions;
- detected environment;
- installed runtimes and versions;
- active profiles;
- managed files and ownership records;
- ECC source URL, ref, commit, and checksum;
- generated artifact versions;
- startup and tray state;
- migration status and backups.

Recommended locations:

- Windows: `%LOCALAPPDATA%\\Agent-Venom\\`
- Linux/WSL: `${XDG_STATE_HOME:-$HOME/.local/state}/agent-venom/`

## Package and Runtime Decisions

- Implementation language: TypeScript.
- Module system: ESM.
- Minimum supported Node.js version: 18.
- Package name: `@venom120/agent-venom`.
- Runtime installation is interactive by default when missing.
- OpenCode installation uses `npm install -g opencode` after confirmation.
- `--wsl` selects installation and runtime management inside WSL.
- Without `--wsl`, the detected native environment is used.
- Logical model roles are configurable and default to the current OmniRoute
	mappings; the six current combo IDs are not the public Agent-Venom API.
- Default service names are `av-opencode` and `av-dsh`; users may configure
	them through the config command or editable JSON configuration.
- API credentials are supplied interactively and stored as
	`AGENT_VENOM_API_KEY` in the environment-specific `agent-venom-env` file;
	secrets are never stored in Agent-Venom JSON state.

## CLI Direction

```text
agent-venom
├── install <opencode|dsh> [--wsl] [--agent-venom]
├── uninstall <runtime>
├── update [self|runtime|agents|generated]
├── profile [list|current|use <name>] [--wsl]
├── runtime [list|status|start|stop|restart|logs]
├── startup [status|enable|disable]
├── tray [install|start|stop|status]
├── status
├── doctor
├── repair
├── migrate
└── config [show|path]
```

The CLI supports `--json`, `--dry-run`, `--yes`, `--non-interactive`, and
`--no-restart` where meaningful. Runtime-targeting commands also support
`--wsl`; ECC source-aware commands support `--agent-venom`. The Windows CLI
must be able to invoke the same Agent-Venom command layer inside WSL rather
than duplicating installation logic.

## Platform Direction

Windows + WSL uses a Windows tray/bridge invoking the Linux-side
Agent-Venom CLI through `wsl.exe`. WSL owns Linux runtime state and
lifecycle; Windows owns the tray and Windows startup integration.

Linux supports systemd where available and a process fallback otherwise.
The tray is optional and never a CLI dependency. Headless Linux has no tray
or desktop startup requirement.

The current VBS tray is reference material and a migration source. Its useful
menu structure and behavior may be retained, but its business logic must move
into the CLI/application layer. A robust single-instance mechanism is
mandatory.

## Security Requirements

- Validate repository URLs, refs, paths, and distro names.
- Use `spawn`/`execFile` argument arrays instead of shell interpolation.
- Keep downloads inside a controlled cache.
- Reject traversal and escaping symlinks.
- Do not execute downloaded repository scripts implicitly.
- Validate generated configurations before activation.
- Keep secrets out of logs and state.
- Require explicit elevation when needed.
- Use locks, stale-lock recovery, atomic writes, and bounded backups.
- Provide dry-run and structured audit output.

## Phase 0 Deliverables

Before implementation, finalize:

- package/runtime support matrix;
- Node and module/build strategy;
- ECC source and version policy;
- OpenCode configuration ownership schema;
- first-milestone scope;
- migration expectations;
- systemd/process lifecycle policy;
- tray scope and packaging policy;
- model-role mapping policy;
- DSH adapter ownership split.

## Roadmap

1. Phase 0: validate requirements and architecture.
2. Phase 1: package skeleton and CLI.
3. Phase 2: environment and dependency detection.
4. Phase 3: OpenCode adapter.
5. Phase 4: Agent-Venom pipeline integration.
6. Phase 5: profile switching and configuration union.
7. Phase 6: ECC source adapter.
8. Phase 7: Windows/WSL bridge and migration.
9. Phase 8: Linux lifecycle and headless support.
10. Phase 9: tray and startup.
11. Phase 10: ECC OpenCode integration.
12. Phase 11: ECC-to-DSH generation.
13. Phase 12: update, doctor, repair, and rollback hardening.
14. Phase 13: migration and compatibility release.
15. Phase 14: macOS implementation.

## First Implementation Milestone

The first milestone is intentionally limited to OpenCode:

```text
npm install -g @venom120/agent-venom
agent-venom install opencode
agent-venom profile use agent-venom
agent-venom profile use ecc
agent-venom profile use agent-venom
```

It must prove clean-machine installation, Agent-Venom and ECC availability,
profile switching, user-plugin preservation, provider preservation, backup,
rollback, and support for both JSON and JSONC. Tray, systemd, WSL service
orchestration, DSH installation, and macOS implementation are outside this
first milestone.

## Phase 0 Questionnaire Decisions

The following decisions were confirmed during requirements gathering:

1. Node.js 18 or newer is required.
2. ECC uses release tags and a latest-release channel, with resolved commits
	recorded for reproducibility and explicit update control.
3. Missing OpenCode may be installed atomatically after confirmation using
	`npm install -g opencode`.
4. ECC/Agent-Venom profile activation removes the inactive Agent-Venom-managed
	plugin from the active OpenCode `plugin` list and restores it when the
	profile is selected again. User-installed plugins are retained. Agent-Venom
	does not assume an OpenCode command can load/unload plugins dynamically.
5. Windows and WSL are both supported through an explicit `--wsl` flag.
6. TypeScript + ESM is the selected package implementation strategy.
7. Logical model-role mappings are configurable with current OmniRoute IDs as
	defaults.
8. Upstream `affaan-m/ECC` is the default ECC source. The persistent source
	can be changed with `agent-venom config ecc-source venom120`; the
	`--agent-venom` flag selects the fork for one command.

9. First-run installation asks the user to select the environment and then
	select Agent-Venom, ECC, or both using an interactive up/down-arrow terminal
   selector. Non-interactive installation must receive explicit selections.
10. If OmniRoute is unavailable, installation asks whether to use OmniRoute
	or a custom provider. Custom-provider setup requires six model IDs for
	Agent-Venom and DSH; ECC uses the model selected in the OpenCode/DSH web UI.
11. The provider API key is entered into the terminal and stored only as
	`AGENT_VENOM_API_KEY` in an environment-specific `agent-venom-env` file,
	loaded through the selected environment's shell/environment mechanism.
12. Agent-Venom configuration is stored in editable JSON. The `config`
	command reads and updates the same JSON configuration.
13. Runtime restart is automatic by default; `--no-restart` suppresses it.
14. DSH is installed interactively when selected, using its official package
	and runtime-specific installation flow.
15. Linux/WSL service names default to `av-opencode` and `av-dsh` and are
	configurable through the JSON configuration and `config` command.
16. The tray includes the existing scalable menu structure for OpenCode, DSH,
	OmniRoute, startup, exit, profile switching, runtime controls, status,
	and future Agent-Venom operations. It delegates all behavior to the CLI
	application layer.
17. Release channels include `stable`, `latest`, and `pinned`, with `stable`
	as the default.
18. `--wsl` installs or invokes the Linux-side Agent-Venom package when WSL
	is the selected environment, and rejects a WSL invocation that conflicts
	with a prior native-Windows installation.
19. ECC source selection supports `upstream` and `venom120`; upstream is the
	initial default, and changing the configured source does not update an
	existing checkout until `agent-venom update ecc` is explicitly run.

## Installation Experience

First-time installation is interactive by default. The CLI presents a
terminal selector navigable with the up/down arrow keys so the user can
choose:

- Agent-Venom
- ECC
- both

The selected sources are installed/configured in the chosen environment.
Non-interactive automation must provide an explicit selection through CLI
options or configuration and must never guess silently.

For OpenCode, Agent-Venom keeps both selected managed plugin sources
available, but activates only one managed profile at a time. Switching
profiles replaces only Agent-Venom-managed entries. User-installed plugins,
providers, comments, and unrelated settings remain preserved.

## ECC Fork Selector

`--agent-venom` is a source selector for the current operation, while the
persistent default source is changed explicitly with:

```text
agent-venom install opencode --agent-venom
agent-venom update ecc --agent-venom
agent-venom config ecc-source venom120
```

Without the flag, commands use the configured source. The initial configured
default is `affaan-m/ECC`. Running `agent-venom config ecc-source venom120`
changes the persistent default to `Venom120/ECC` until it is changed back:

```text
agent-venom config ecc-source upstream
```

The selected source, channel, ref, and resolved commit are recorded in state.
Changing the configured source must not silently update an existing checkout;
the user must explicitly run `agent-venom update ecc`.

## Environment Selection

The first installation records whether the user selected native Windows,
Windows + WSL, Linux desktop, or Linux headless operation.

When Windows + WSL is selected, both `agent-venom` and
`agent-venom --wsl` resolve to the WSL-managed installation. The Windows
bridge may install or invoke the Linux-side Agent-Venom package as needed.

When native Windows is selected and the user later runs `--wsl`, Agent-Venom
must detect the mismatch and explain that the installation belongs to the
Windows-native environment, then direct the user to use `agent-venom` without
`--wsl`. It must not silently create a second installation.
## Phase 1 Package Skeleton

Phase 1 starts with a TypeScript + ESM package using Node.js 18+, a single
CLI application layer, and no runtime-specific or platform-specific behavior
embedded in the entrypoint. The initial CLI exposes safe help/version output
and the command registration boundary; implementation commands are added in
later phases behind interfaces.

## Implementation Progress (Phase 1-3)

The following features are implemented and verified:

### CLI Commands
- `agent-venom --help` / `--version` — basic help and version output
- `agent-venom install opencode` — full installation flow with interactive and non-interactive modes
- `agent-venom profile use <name>` / `profile current` — profile switching and status
- `agent-venom config show` / `config path` / `config ecc-source` / `config provider` — configuration management
- `agent-venom status` — environment detection and display
- `agent-venom doctor` — dependency health check across native and WSL environments

### Install Flow
- Environment detection: Windows native, Windows WSL, Linux desktop, Linux headless
- Profile source selection: Agent-Venom, ECC, or both
- Provider selection: OmniRoute or custom with model role configuration
- API key management: interactive prompt, environment file storage, Windows setx integration
- Transaction locking and idempotent execution
- Atomic configuration merging with user-entry preservation
- Rollback on failure with backup creation

### WSL Support
- Windows-side delegation to WSL via `--wsl` flag
- Direct execution inside WSL with user-level npm prefix (`~/.npm-global`)
- Automatic PATH setup in `~/.bashrc` for user npm binaries
- Permission-safe installation avoiding root-owned system directories
- Dependency detection across native and WSL environments via `doctor` command

### OpenCode Integration
- Profile application with JSONC parsing and deterministic serialization
- Managed configuration tracking with stable IDs
- User-entry preservation during profile switches
- DSH preset synchronization to `$DSH_HOME/.agent-presets/agent-venom/`

### Known Limitations
- `npm install -g` via tarball can hang on dependency resolution in some WSL environments — manual copy fallback available
- DSH installation not yet implemented (stub only)
- ECC DSH adapter generation not yet implemented
- Runtime restart (`--no-restart` not yet supported — must pass `--no-restart`)
- Tray and startup integration not yet implemented
- macOS support not yet implemented
