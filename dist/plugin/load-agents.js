import { readdirSync, readFileSync, existsSync, mkdirSync, } from "node:fs";
import { exec } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { promisify } from "node:util";
const execAsync = promisify(exec);
// ── Helpers ──────────────────────────────────────────────────────────────────
function parseScalar(raw) {
    const t = raw.trim();
    if ((t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1);
    }
    if (t === "true")
        return true;
    if (t === "false")
        return false;
    if (t === "null" || t === "~" || t === "")
        return null;
    if (/^-?\d+(\.\d+)?$/.test(t))
        return Number(t);
    return t;
}
function splitKey(text) {
    const m = text.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^:]+):(.*)$/);
    if (!m)
        return null;
    let key = m[1].trim();
    if ((key.startsWith('"') && key.endsWith('"')) ||
        (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1);
    }
    return [key, m[2].trim()];
}
function parseYaml(lines) {
    let i = 0;
    function walk(indent) {
        const obj = {};
        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) {
                i += 1;
                continue;
            }
            const cur = line.length - line.trimStart().length;
            if (cur < indent)
                break;
            const kv = splitKey(trimmed);
            if (!kv) {
                i += 1;
                continue;
            }
            const [key, rest] = kv;
            i += 1;
            obj[key] = rest === ""
                ? walk(cur + 1)
                : parseScalar(rest);
        }
        return obj;
    }
    return walk(0);
}
// ── Plugin entry ─────────────────────────────────────────────────────────────
export default async function (_input, options) {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    // The plugin only ever reads from `agents/`. The `setup/`,
    // `dsh/`, `docs/` and any other top-level directories are
    // intentionally NOT walked by this loader, so they are not
    // copied into OpenCode's package cache and do not pollute the
    // runtime. If you ever need to load more paths, do it here
    // explicitly — never walk the whole repoRoot.
    const agentsDir = join(repoRoot, "agents");
    // Hard guard: refuse to walk directories that are not the
    // canonical agent directory. This is defensive; the loop below
    // only iterates `agentsDir`, but if a future refactor adds a
    // generic `readdirSync(repoRoot)` it will fail here first.
    const allowedRoots = new Set([agentsDir]);
    // externalSkills comes from the second element of the plugin tuple:
    //
    // ["agent-venom@...", {
    //   "externalSkills": [...]
    // }]
    //
    const externalSkills = Array.isArray(options?.externalSkills)
        ? options.externalSkills
        : [];
    return {
        async config(config) {
            // ── Register agents ──────────────────────────────────────────────────
            if (existsSync(agentsDir)) {
                for (const file of readdirSync(agentsDir)) {
                    // Defensive check: the agentsDir loop is already the only
                    // place we read files from, but if `allowedRoots` is ever
                    // extended we want to fail loudly here before a wrong
                    // directory is read.
                    if (!allowedRoots.has(agentsDir)) {
                        throw new Error(`[agent-venom] refusing to walk non-agent directory: ${agentsDir}`);
                    }
                    if (!file.endsWith(".md"))
                        continue;
                    let raw = "";
                    try {
                        raw = readFileSync(join(agentsDir, file), "utf8");
                    }
                    catch (e) {
                        continue;
                    }
                    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
                    if (!fm)
                        continue;
                    const meta = parseYaml(fm[1].split(/\r?\n/));
                    const name = typeof meta.name === "string" && meta.name
                        ? meta.name
                        : file.replace(/\.md$/, "");
                    delete meta.name;
                    config.agent = {
                        ...(config.agent || {}),
                        [name]: {
                            ...meta,
                            prompt: raw.slice(fm[0].length).trim(),
                        },
                    };
                }
            }
            // ── Register external skills ─────────────────────────────────────────
            config.skills = config.skills ?? {};
            const paths = Array.isArray(config.skills.paths)
                ? config.skills.paths
                : [];
            if (externalSkills.length) {
                const cacheRoot = join(homedir(), ".cache", "opencode", "packages");
                if (!existsSync(cacheRoot)) {
                    mkdirSync(cacheRoot, {
                        recursive: true,
                    });
                }
                for (const ext of externalSkills) {
                    if (!ext?.name || !ext?.url)
                        continue;
                    const ref = ext.ref || "main";
                    const skillsPath = ext.skillsPath || "skills";
                    const cacheDir = join(cacheRoot, ext.name);
                    try {
                        // First run: clone the external repository.
                        if (!existsSync(cacheDir)) {
                            console.log(`[agent-venom] cloning ${ext.name} …`);
                            await execAsync(`git clone --depth 1 --branch "${ref}" "${ext.url}" "${cacheDir}"`, {
                                timeout: 60_000,
                            });
                        }
                        const extSkills = join(cacheDir, skillsPath);
                        if (existsSync(extSkills) &&
                            !paths.includes(extSkills)) {
                            paths.push(extSkills);
                            console.log(`[agent-venom] registered skills: ${ext.name}`);
                        }
                    }
                    catch (err) {
                        console.error(`[agent-venom] failed to clone ${ext.name}:`, err?.message || err);
                    }
                }
            }
            config.skills.paths = paths;
        },
    };
}
//# sourceMappingURL=load-agents.js.map