# Agent-Venom — Architecture Discovery, Requirement Gathering & Implementation Plan

## Role

Act as a **principal/senior software architect and systems engineer** with extensive experience designing cross-platform developer tooling, npm CLIs, plugin ecosystems, OS integrations, service managers, WSL interoperability, desktop tray applications, configuration management, and adapter/plugin architectures.

Do **not** start implementing code immediately.

First perform deep repository archaeology and requirements analysis, understand the existing system, compare it against the target architecture, identify architectural problems, and produce a complete implementation plan.

Think in terms of:

* maintainability
* cross-platform compatibility
* upgradeability
* backwards compatibility
* idempotent installation
* clean separation of concerns
* adapter interfaces
* configuration ownership
* state management
* failure recovery
* user modifications
* dependency detection
* versioning
* security
* future extensibility

Do not blindly preserve the current implementation merely because it exists. If something in the current architecture should be replaced, say so explicitly and explain why.

---

# 1. Project Goal

I want to evolve my existing `Agent-Venoms` repository into a fully-fledged cross-platform npm package called:

```text
@venom120/agent-venom
```

The package should act as a **multi-runtime / multi-agent adapter system**.

The conceptual architecture is:

```text
                         agent-venom
                              │
                ┌─────────────┴─────────────┐
                │                           │
         OpenCode Adapter              DSH Adapter
                │                           │
        ┌───────┴───────┐           ┌───────┴───────┐
        │               │           │               │
     Agent-Venom          ECC       Agent-Venom          ECC
```

Where:

* **Agent-Venom** is one agent/workflow/profile.
* **ECC (Everything Claude Code)** is another agent/workflow/profile.
* **OpenCode** and **DSH (DeepSeek Harness)** are runtimes/harnesses.
* `agent-venom` is the orchestration, installation, configuration, adapter, and platform-management layer.

The package should eventually support:

### Operating environments

1. Windows native
2. Windows + WSL
3. Linux
4. macOS — architecture/design support in v1, implementation in a later version

For v1, the actual implementation target is:

```text
Windows native
Windows + WSL
Linux
```

macOS must nevertheless be considered during architectural decisions so that adding it later does not require redesigning the package.

---

# 2. Existing Repositories

You MUST inspect these repositories thoroughly before proposing implementation:

### Agent-Venom

`https://github.com/Venom120/Agent-Venoms`

### My ECC fork

`https://github.com/Venom120/ECC`

### Original ECC

`https://github.com/affaan-m/ECC`

The ECC fork is currently a fork of the upstream repository.

The intended future workflow is:

```text
Venom120/ECC
      │
      │ develop DSH adapter
      │
      ▼
Pull Request
      │
      ▼
affaan-m/ECC
      │
      │ PR eventually accepted
      ▼
upstream ECC
```

Until the PR is accepted, `agent-venom` may consume:

```text
Venom120/ECC
```

After upstream acceptance, I intend to change the ECC source URL in a new `agent-venom` package release so that it consumes:

```text
affaan-m/ECC
```

The architecture must therefore make the ECC source configurable rather than hardcoding assumptions about the fork forever.

---

# 3. Mandatory Repository Archaeology

Before writing the plan, inspect the repositories deeply.

Do NOT only read README files.

Inspect:

* repository tree
* source code
* package files
* scripts
* configuration files
* adapters
* installation scripts
* generated files
* OpenCode integration
* DSH integration
* agents
* skills
* ECC integration
* hooks
* rules
* templates
* service definitions
* shell scripts
* Python scripts
* VBS scripts
* documentation
* existing architecture/planning documents
* Git history where useful
* existing issues/PRs where relevant

For `Agent-Venoms`, pay particular attention to existing documentation/plans concerning:

* OpenCode profiles
* profile toggling
* user plugin persistence
* cross-OS CLI
* ECC integration
* OmniRoute
* DSH
* OpenCode
* current Windows + WSL behavior

Do not recreate solutions that are already documented unless there is a reason to replace them.

Determine which existing pieces should:

1. remain
2. be refactored
3. become part of `agent-venom`
4. become adapters
5. become generated artifacts
6. be deprecated
7. be completely replaced

---

# 4. Important Current Context

The current system was primarily built for:

```text
Windows + WSL
```

The current setup has several bugs and limitations.

The current system also uses approximately:

```text
OmniRoute
DSH
OpenCode web
```

with systemd services inside WSL and Windows-side scripts/systray functionality.

However, **do not assume that the current service architecture must survive**.

Analyze whether the new npm package should:

* preserve it
* simplify it
* replace it
* abstract it
* make it optional
* move responsibility between Windows and WSL

The current implementation is a source of requirements and compatibility information, not necessarily the final architecture.

---

# 5. Core Installation Experience

The desired clean-machine experience is approximately:

```text
Fresh machine
    │
    ├── user installs/configures OmniRoute separately
    │
    ▼
npm install -g "@venom120/agent-venom"
    │
    ▼
agent-venom detects environment
    │
    ▼
agent-venom installs/configures required adapters
```

OmniRoute itself is **OUT OF SCOPE for installation and management by agent-venom**.

The package should NOT install or configure OmniRoute providers.

Instead, the repository should provide clear documentation explaining how users can:

1. configure OmniRoute
2. configure providers
3. create/update OmniRoute combinations
4. use those combinations with Agent-Venom/ECC

The existing Python OmniRoute setup scripts/documentation should be preserved or reorganized into documentation where appropriate.

---

# 6. Dependency Detection

The installation experience should be interactive when required.

For example:

```text
OpenCode is not installed.

Would you like Agent-Venom to install it? [Y/n]
```

The package should:

* detect the operating system
* detect whether WSL exists
* detect the relevant Linux distribution where applicable
* detect OpenCode
* detect DSH
* detect Node/npm
* detect required runtime dependencies
* detect whether a graphical desktop environment exists
* detect whether a system tray is realistically available
* detect existing Agent-Venom installation/state
* detect conflicting installations/configurations

If a dependency is missing, use a simple Y/N interaction where appropriate.

Do not assume that Windows, Windows+WSL, and Linux should perform the same installation operations.

The package must have an explicit environment model.

---

# 7. Environment Model

Design a formal environment/platform abstraction.

At minimum consider:

```text
WindowsNative
WindowsWSL
LinuxDesktop
LinuxHeadless
MacOSFuture
```

Do not scatter checks such as:

```js
process.platform === ...
```

throughout the application.

Instead determine whether an abstraction such as:

```text
PlatformAdapter
EnvironmentDetector
ExecutionContext
RuntimeTarget
```

or a better design is appropriate.

The final architecture should make it possible to add macOS without rewriting core logic.

---

# 8. Adapter Architecture

The central architectural requirement is that adapters must be first-class.

Conceptually:

```text
agent-venom
│
├── core
│
├── platform adapters
│
│   ├── windows
│   ├── wsl
│   ├── linux
│   └── macos (future)
│
└── runtime adapters
    │
    ├── opencode
    │   ├── agent-venom
    │   └── ecc
    │
    └── dsh
        ├── agent-venom
        └── ecc
```

Determine whether this exact structure is optimal.

If not, propose a better architecture.

The important requirement is:

**Adding another runtime should not require rewriting Agent-Venom, ECC, platform detection, or the CLI core.**

Similarly:

**Adding another agent/profile should not require rewriting the runtime/platform system.**

---

# 9. OpenCode Adapter

OpenCode is the first adapter to implement properly.

The goal is:

```bash
agent-venom install opencode
```

This should install/configure BOTH:

```text
Agent-Venom
ECC
```

for OpenCode.

The user should subsequently be able to switch profiles.

Conceptually:

```bash
agent-venom profile agent-venom
```

and:

```bash
agent-venom profile ecc
```

Use whatever final CLI syntax you determine is best.

Do not assume these exact command names are final.

---

# 10. OpenCode Profile Model

There are three important configuration files:

```text
opencode.json
OR
opencode.jsonc

opencode.agent-venom.json
opencode.ecc.json
```

The `.jsonc` distinction exists because some environments/use cases use:

```text
opencode.jsonc
```

while others use:

```text
opencode.json
```

The implementation must detect and correctly handle both.

The conceptual model is:

```text
                    ┌──────────────────────┐
                    │ opencode.json(c)     │
                    │ active configuration  │
                    └──────────┬───────────┘
                               │
                     ┌─────────┴─────────┐
                     │                   │
              Agent-Venom profile      ECC profile
              definition             definition
                     │                   │
          opencode.agent-venom.json   opencode.ecc.json
```

Determine the exact implementation after inspecting the current OpenCode configuration and existing plans.

---

# 11. Profile Switching Must Preserve User Configuration

This is extremely important.

Suppose the user starts with:

```text
Agent-Venom active
```

and later manually adds another OpenCode plugin:

```text
user-plugin-X
```

The user then switches:

```text
Agent-Venom → ECC
```

and later:

```text
ECC → Agent-Venom
```

The manually installed:

```text
user-plugin-X
```

MUST NOT disappear.

Therefore the profile system must NOT simply overwrite the entire OpenCode configuration.

We need a deterministic merge/union model.

Conceptually:

```text
User configuration
        +
Agent-Venom managed configuration
        ↓
Effective opencode.json(c)
```

Agent-Venom should own only the configuration namespace/entries that it actually manages.

For plugins, the behavior should be approximately:

```text
final_plugins =
    user_plugins
    ∪
    active_profile_plugins
```

with deterministic conflict resolution for Agent-Venom-owned entries.

If:

```text
user plugin = X
```

and:

```text
Agent-Venom plugin = Y
```

then switching profiles should preserve X and replace/update Y.

If ECC uses the same managed plugin identifier, Agent-Venom should replace the managed definition rather than create duplicates.

The exact ownership/merge algorithm must be designed carefully after examining the existing implementation.

Also consider:

* comments
* JSONC formatting
* ordering
* duplicate keys
* invalid JSON
* user modifications
* partial installations
* interrupted profile switches
* backups
* rollback
* concurrent processes
* future OpenCode schema changes

---

# 12. OpenCode Plugin Ownership

Design a mechanism that clearly distinguishes:

```text
user-owned configuration
```

from:

```text
agent-venom-managed configuration
```

Do not rely solely on positional array entries.

Prefer a robust ownership model.

Possible approaches should be investigated, such as:

* deterministic plugin identifiers
* managed metadata
* generated fragments
* three-way merge
* canonical profile files
* state manifest
* backups
* configuration markers

Choose the safest maintainable solution.

---

# 13. Agent-Venom OpenCode Adapter

Agent-Venom currently works with OpenCode but the existing implementation is not truly plug-and-play.

Analyze why.

Determine:

* how Agent-Venom is currently installed
* how its agents are represented
* how its skills are represented
* how the loader works
* how OpenCode discovers them
* what is hardcoded
* what assumes OmniRoute
* what assumes specific model names
* what assumes WSL
* what assumes a particular path
* what breaks on fresh machines

The new adapter should make the installation reproducible on a clean supported system.

---

# 14. OmniRoute Model Problem

OmniRoute is deliberately outside the scope of Agent-Venom installation.

However, Agent-Venom currently has assumptions/hardcoded model names that may conflict with users changing their OmniRoute provider/combo configuration.

Do NOT blindly hardcode the current six OmniRoute combo names into Agent-Venom.

The six current names are implementation details, not a public Agent-Venom API.

A user should be able to change their OmniRoute provider configuration.

Investigate how Agent-Venom currently references models and determine a robust abstraction so that:

```text
OmniRoute configuration
```

can remain user-controlled while:

```text
Agent-Venom / ECC configuration
```

continues to work.

Analyze this separately for:

```text
OpenCode
DSH
```

and determine whether the solution should be:

* model aliases
* environment configuration
* runtime configuration
* adapter-level translation
* generated configuration
* user-defined mapping
* another mechanism

Do not choose prematurely.

---

# 15. DSH Adapter

DSH means:

```text
DeepSeek Harness
```

Agent-Venom already has a DSH integration/preset.

ECC currently does not have the required DSH adapter.

The goal is to create one.

However, ECC is large.

The upstream repository currently contains a large number of:

* agents
* skills
* commands
* hooks
* rules
* other runtime assets

Therefore, DO NOT manually create dozens of DSH YAML entries by copying the repository contents one by one.

Instead investigate a programmatic adapter.

The preferred conceptual approach is:

```text
agent-venom
    │
    ▼
ECC source repository
    │
    ▼
ECC adapter/parser/generator
    │
    ▼
DSH-compatible representation
    │
    ▼
DSH preset
```

The adapter could be implemented in JS/TS or another appropriate mechanism.

Determine the best approach after inspecting:

* ECC's actual structure
* DSH's actual structure
* existing Agent-Venom DSH integration
* ECC's OpenCode adapter
* ECC's other adapters
* metadata/frontmatter conventions
* skill format
* agent format
* command format
* hooks
* rules
* generated assets

---

# 16. ECC Source Strategy

Investigate whether ECC should be:

### Option A

Bundled into Agent-Venom.

### Option B

Downloaded dynamically.

### Option C

Cloned into a managed cache.

### Option D

Installed through an official ECC package.

### Option E

Another mechanism.

The preferred initial direction is:

```text
Agent-Venom adapter
        ↓
clone/download ECC source
        ↓
generate/install DSH representation
```

but this is NOT a final architectural decision.

The agent must evaluate alternatives.

The architecture must support changing:

```text
Venom120/ECC
```

to:

```text
affaan-m/ECC
```

without rewriting the adapter.

It should also consider:

* pinned versions/tags
* latest releases
* reproducibility
* cache
* update behavior
* network failure
* offline behavior
* corrupted checkout
* Git availability
* npm/package distribution
* security of downloaded content

---

# 17. ECC Upstream Compatibility

Do not modify the upstream ECC architecture unnecessarily.

Where possible:

```text
ECC remains ECC.
```

Agent-Venom should provide an adapter around it.

If changes are required to ECC itself for DSH compatibility, determine:

1. whether they should live in the fork
2. whether they should be proposed upstream
3. whether they should be generated externally
4. whether they can be implemented entirely in Agent-Venom

The long-term goal is that the custom Venom ECC fork can eventually disappear once the relevant upstream PRs are accepted.

---

# 18. ECC Repository vs Submodule

The current Agent-Venom documentation previously used ECC as a submodule, but that caused problems with OpenCode cloning the repository inside WSL.

Do a proper architecture comparison between:

```text
Git submodule
```

vs:

```text
separate repository + runtime clone
```

vs:

```text
npm dependency
```

vs:

```text
generated/vendor copy
```

vs:

```text
dynamic adapter-managed checkout
```

Evaluate:

* OpenCode compatibility
* WSL compatibility
* npm installation
* versioning
* updates
* Git availability
* offline use
* reproducibility
* package size
* security
* developer experience
* upstream synchronization
* contribution workflow

Recommend one.

---

# 19. Windows Native Architecture

For:

```text
Windows native
```

the package should install/manage its required CLI functionality directly on Windows.

Determine:

* installation paths
* executable resolution
* PATH handling
* startup integration
* process lifecycle
* service lifecycle
* configuration locations
* permissions
* elevation requirements
* PowerShell/cmd compatibility

Do not assume the current VBS implementation is the correct final solution.

Reuse it only where architecturally justified.

---

# 20. Windows + WSL Architecture

This is one of the most important design areas.

The likely target architecture is:

```text
Windows
│
├── Agent-Venom tray application
│
└── WSL
    │
    ├── agent-venom CLI/runtime
    ├── OpenCode
    ├── DSH
    └── other Linux-side components
```

The reason for this architecture is that Linux-side CLI/runtime management is significantly easier inside WSL, while the system tray must remain a Windows-native process.

The Windows tray should therefore be capable of:

```text
Windows
   │
   └── invoke WSL
          │
          └── invoke agent-venom
```

and potentially:

```text
start/stop/restart WSL-side components
```

However, this is still an architecture hypothesis.

Investigate whether the npm package itself should live inside WSL, Windows, or both.

Determine the cleanest approach.

Important questions:

* Where is the source of truth?
* Where is Agent-Venom state stored?
* How does Windows invoke the WSL CLI?
* How does WSL notify the Windows tray?
* What happens if WSL is stopped?
* What happens if the distro is unavailable?
* What happens if the Windows tray starts before WSL?
* How are paths translated?
* How are environment variables handled?
* Which side owns process lifecycle?
* How are upgrades performed?
* Can the same installation support both CLI and tray?

---

# 21. Linux Architecture

Linux should support:

### Desktop

```text
Agent-Venom CLI
        +
optional system tray
```

### Headless

```text
Agent-Venom CLI only
```

Detect whether a graphical environment/system tray mechanism exists.

The tray must NOT be a hard dependency for Linux.

Investigate Linux desktop compatibility across major distributions rather than targeting only one distro.

---

# 22. System Tray

The tray should eventually be the graphical alternative to the CLI.

It should expose the important Agent-Venom operations rather than creating a completely separate control plane.

Ideally:

```text
Tray
  ↓
Agent-Venom command/API layer
```

rather than:

```text
Tray
  ↓
duplicated business logic
```

The tray should be able to expose functionality such as:

```text
Current runtime
Current profile
Install
Switch profile
Start/stop
Restart
Startup enabled/disabled
Status
```

Determine the final feature set.

The tray should be automatically installed/enabled where appropriate if supported.

On unsupported/headless systems it should simply not exist.

---

# 23. Startup Management

Agent-Venom should provide an OS startup mechanism.

Conceptually:

```text
Startup: ✓
```

or:

```text
Startup: 
```

with a simple enabled/disabled state.

Startup should control whether the tray/application starts automatically at OS boot/login.

The exact mechanism must be platform-specific:

* Windows startup
* Linux desktop autostart
* macOS future

Do not force one implementation across operating systems.

The implementation should be idempotent.

Running installation multiple times must not create duplicate startup entries.

---

# 24. Existing Service Architecture

The current WSL setup uses approximately three systemd services for:

```text
OmniRoute
DSH
OpenCode web
```

with Windows-side scripts controlling them.

Do not assume these services should remain unchanged.

Investigate whether Agent-Venom should provide:

### Option A

A service manager abstraction.

### Option B

Only runtime lifecycle management.

### Option C

Native service installation.

### Option D

Continue using existing systemd services.

### Option E

Another architecture.

The key requirement is to avoid unnecessary complexity while preserving the useful functionality of the current system.

---

# 25. CLI Design

Design a coherent CLI.

Do not blindly copy the current command names.

The CLI should conceptually support operations around:

```text
install
uninstall
update
status
profile
runtime
startup
tray
doctor
```

Potential examples:

```bash
agent-venom install opencode
agent-venom install dsh

agent-venom profile agent-venom
agent-venom profile ecc

agent-venom status
agent-venom doctor

agent-venom startup
```

Determine the best final command tree.

The CLI should be:

* discoverable
* scriptable
* idempotent
* cross-platform
* clear about failures
* safe to rerun

---

# 26. State Management

Design a persistent Agent-Venom state model.

The package needs to know things such as:

```text
installed runtimes
installed adapters
active profiles
platform/environment
managed files
ECC version/source
installation version
startup state
tray state
```

Determine where state should live on:

```text
Windows
WSL
Linux
future macOS
```

Do not mix package state with user configuration unnecessarily.

---

# 27. Installation Must Be Idempotent

This is mandatory.

If the user runs:

```bash
npm install -g "@venom120/agent-venom"
```

multiple times, or runs:

```bash
agent-venom install opencode
```

multiple times:

* no duplicate plugins
* no duplicate tray processes
* no duplicate startup entries
* no duplicated services
* no corrupted configs
* no unnecessary downloads
* no repeated registrations
* no destructive overwrites

The package should safely converge toward the desired state.

---

# 28. Multiple Instances

The existing systray has had a problem where running the script twice opens two tray instances.

The new architecture MUST prevent duplicate tray instances.

Investigate appropriate single-instance mechanisms per platform.

Do not rely on a PID file alone without considering stale locks/process crashes.

---

# 29. Packaging

Design the npm package itself.

Determine:

* JavaScript vs TypeScript
* CommonJS vs ESM
* package entry point
* CLI binary
* build system
* bundled assets
* platform-specific binaries
* tray application packaging
* optional dependencies
* npm package size
* installation lifecycle scripts
* permission/elevation behavior

The core package should be as platform-independent as possible.

Platform-specific functionality should be isolated.

---

# 30. Security

Because Agent-Venom may:

* execute shell commands
* clone repositories
* install software
* modify configuration
* manipulate startup entries
* start/stop processes
* potentially require elevated privileges

security must be considered from the beginning.

Analyze:

* command injection
* untrusted repository content
* Git URLs
* shell escaping
* path traversal
* symlink attacks
* malicious generated configuration
* privilege escalation
* downloaded artifacts
* integrity/version pinning
* user-controlled configuration

Do not implement a mechanism merely because it is convenient if it creates an unnecessary security risk.

---

# 31. Fresh-Machine Test

The architecture must support a test such as:

```text
Completely fresh machine
        ↓
Install OmniRoute manually
        ↓
npm install -g "@venom120/agent-venom"
        ↓
agent-venom install opencode
        ↓
Agent-Venom detects environment
        ↓
OpenCode installed/detected
        ↓
Agent-Venom installed
        ↓
ECC installed
        ↓
Agent-Venom activated
        ↓
OpenCode works
        ↓
User adds custom plugin
        ↓
agent-venom profile ecc
        ↓
ECC works
        ↓
custom plugin still exists
        ↓
agent-venom profile agent-venom
        ↓
Agent-Venom works
        ↓
custom plugin still exists
```

This should become one of the primary acceptance tests.

---

# 32. Cross-Platform Test Matrix

Build a test matrix for:

| Environment    | CLI    | OpenCode | DSH    | Agent-Venom | ECC    | Tray   | Startup |
| -------------- | ------ | -------- | ------ | -------- | ------ | ------ | ------- |
| Windows        | ✓      | ✓        | ✓      | ✓        | ✓      | ✓      | ✓       |
| Windows + WSL  | ✓      | ✓        | ✓      | ✓        | ✓      | ✓      | ✓       |
| Linux Desktop  | ✓      | ✓        | ✓      | ✓        | ✓      | ✓      | ✓       |
| Linux Headless | ✓      | ✓        | ✓      | ✓        | ✓      | N/A    | N/A     |
| macOS          | future | future   | future | future   | future | future | future  |

Correct this table if repository analysis shows a better capability model.

---

# 33. Documentation Architecture

Determine what documentation should live where.

At minimum consider:

```text
README
INSTALLATION
ARCHITECTURE
CLI
OPENCODE
DSH
ECC
WINDOWS
WSL
LINUX
TRAY
OMNIROUTE
TROUBLESHOOTING
DEVELOPMENT
```

Do not create unnecessary documentation duplication.

OmniRoute should have a clear separate setup guide because it is intentionally outside Agent-Venom's installation scope.

---

# 34. Versioning

Design versioning for:

```text
agent-venom
```

and independently:

```text
ECC source version
Agent-Venom version/source
adapter version
```

The architecture must support:

```text
Agent-Venom v1
    → ECC fork

Agent-Venom v2
    → upstream ECC
```

without breaking installed configurations.

Determine how updates should behave.

---

# 35. Update Strategy

Investigate:

```bash
agent-venom update
```

and determine what it should update:

* Agent-Venom itself
* Agent-Venom
* ECC
* generated DSH preset
* OpenCode adapter
* configuration
* tray
* services

Updates must not destroy user-owned configuration.

Profile configuration updates must preserve user plugins and unrelated OpenCode configuration.

---

# 36. Doctor / Repair

Because this package manages multiple systems, design:

```bash
agent-venom doctor
```

or an equivalent mechanism.

It should be able to identify:

* missing dependencies
* broken paths
* invalid configuration
* missing adapters
* stale state
* missing ECC checkout
* incompatible ECC version
* broken DSH preset
* broken OpenCode configuration
* startup problems
* tray problems
* WSL problems

Consider:

```bash
agent-venom repair
```

if appropriate.

---

# 37. Failure and Rollback

Installation/configuration operations should be transactional where practical.

For example:

```text
Before modifying OpenCode config
        ↓
backup/current state
        ↓
generate new config
        ↓
validate
        ↓
replace atomically
```

If something fails:

```text
restore previous working state
```

Do not leave users with half-written configuration.

---

# 38. What NOT To Do

Do NOT:

* start coding immediately
* rewrite everything blindly
* manually duplicate ECC's hundreds of skills
* hardcode current OmniRoute combo names as public API
* assume WSL is the only environment
* assume Windows scripts are the final architecture
* overwrite user OpenCode configuration
* delete user plugins during profile switching
* tightly couple the tray to business logic
* tightly couple ECC to Agent-Venom
* make macOS-specific assumptions in core code
* create platform checks throughout the entire codebase
* introduce a submodule simply because the existing documentation used one
* preserve broken architecture solely for backwards compatibility

---

# 39. Required First Deliverable

After researching everything, DO NOT implement code yet.

Produce a detailed architecture/design document containing:

## A. Current architecture

Explain exactly how the current system works.

## B. Current problems

List every important limitation/bug discovered.

Separate:

```text
bug
```

from:

```text
architectural limitation
```

from:

```text
technical debt
```

## C. Target architecture

Provide the proposed Agent-Venom architecture.

## D. Component diagram

Show:

```text
Agent-Venom
    │
    ├── Core
    ├── CLI
    ├── State
    ├── Platform adapters
    │
    ├── OpenCode adapter
    │      ├── Agent-Venom
    │      └── ECC
    │
    └── DSH adapter
           ├── Agent-Venom
           └── ECC
```

plus the Windows/WSL/Linux relationships.

## E. Data flow

Explain how:

```text
install
profile switch
update
repair
tray
startup
```

flow through the system.

## F. Configuration ownership model

Explain exactly how user configuration and Agent-Venom configuration coexist.

## G. ECC architecture

Explain how ECC is consumed and transformed for DSH.

## H. Repository strategy

Explain what belongs in:

```text
Agent-Venoms / Agent-Venom
Venom120/ECC
affaan-m/ECC
```

## I. Package architecture

Show the proposed directory structure.

## J. CLI architecture

Show the final proposed command tree.

## K. Platform architecture

Explain Windows, WSL, Linux, and future macOS.

## L. State model

Define what Agent-Venom stores and where.

## M. Update model

Explain versioning and update behavior.

## N. Security model

Explain trust boundaries.

## O. Test strategy

Provide a complete test matrix.

## P. Migration strategy

Explain how the current Agent-Venom installation can migrate to Agent-Venom.

## Q. Open architectural decisions

List every unresolved decision.

For each:

```text
Decision
Options
Recommendation
Reason
Risk
```

---

# 40. Implementation Roadmap

After the architecture document, create an implementation roadmap.

The roadmap should be staged.

A likely structure is:

```text
Phase 0
Requirement + architecture validation

Phase 1
Agent-Venom package skeleton

Phase 2
Platform/environment detection

Phase 3
OpenCode adapter

Phase 4
Agent-Venom OpenCode integration

Phase 5
OpenCode profile switching + configuration union

Phase 6
Windows / WSL installation model

Phase 7
Linux support

Phase 8
Tray + startup

Phase 9
ECC OpenCode integration

Phase 10
ECC → DSH adapter

Phase 11
Update/doctor/repair

Phase 12
Migration + compatibility

Phase 13
macOS implementation
```

Change this order if repository research suggests a better dependency graph.

---

# 41. First Milestone

The first actual implementation milestone should be:

```text
Fresh machine
    ↓
npm install -g @venom120/agent-venom
    ↓
agent-venom install opencode
    ↓
Agent-Venom + ECC available
    ↓
profile switching works
    ↓
user plugins survive switching
```

Do NOT attempt to solve every OS/runtime/service/tray problem simultaneously.

Prove the core adapter architecture first.

Then extend it.

---

# 42. Important Architectural Principle

The final system should not be thought of as:

```text
"Agent-Venoms repo with some ECC scripts added."
```

It should be designed as:

```text
                    Agent-Venom
                         │
              ┌──────────┴──────────┐
              │                     │
          Platforms              Runtimes
              │                     │
       ┌──────┼──────┐       ┌──────┴──────┐
       │      │      │       │             │
    Windows  WSL   Linux  OpenCode        DSH
                              │             │
                       ┌──────┴──────┐ ┌────┴──────┐
                       │             │ │           │
                    Agent-Venom       ECC Agent-Venom   ECC
```

The important abstraction is:

```text
Agent/Profile
        ↓
Runtime Adapter
        ↓
Platform Adapter
```

rather than hardcoding:

```text
Agent-Venom + OpenCode + WSL
```

into one implementation.

---

# 43. Decision-Making Rule

When making architectural decisions, optimize for:

1. correctness
2. maintainability
3. user configuration safety
4. cross-platform extensibility
5. upgradeability
6. reproducibility
7. simplicity
8. performance

Do not optimize for minimum lines of code.

If a proposed solution is more complex but removes a major class of future bugs, explain why.

If a simpler solution is sufficient, prefer the simpler one.

---

# 44. Final Instruction

Do the repository research first.

Do not make implementation changes until the architecture/design phase has been completed.

Your first response should be the **complete architecture/research report and implementation roadmap**, based on the actual repositories and files—not assumptions.

Where the current documentation and the current repository implementation disagree, explicitly identify the discrepancy.

Where my requested architecture is technically suboptimal, challenge it and propose a better alternative.

Where information is missing, list it under:

```text
Open Questions
```

Do not silently invent requirements.

The goal is to arrive at a **production-quality architecture for Agent-Venom**, not merely to refactor the current scripts into an npm package.
