import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface SkillFile {
  /** Path relative to the skill's own directory, using forward slashes. */
  relativePath: string;
  /** Absolute path on disk. */
  absolutePath: string;
}

export interface Skill {
  name: string;
  description: string;
  /** Absolute path to the skill's directory. */
  dir: string;
  /** Full SKILL.md body with YAML frontmatter stripped. */
  body: string;
  /** Every file under the skill's directory, including SKILL.md itself. */
  files: SkillFile[];
}

interface Frontmatter {
  name?: string;
  description?: string;
}

/**
 * Minimal parser for the flat `key: value` YAML frontmatter every SKILL.md
 * in this repo uses (confirmed by direct inspection - no nested structures,
 * no lists). Values may be wrapped in double quotes.
 */
function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("SKILL.md is missing YAML frontmatter delimited by '---'");
  }
  const [, frontmatterBlock, body] = match;
  const frontmatter: Frontmatter = {};
  for (const line of frontmatterBlock.split(/\r?\n/)) {
    const lineMatch = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!lineMatch) continue;
    const [, key, rawValue] = lineMatch;
    const value = rawValue.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (key === "name" || key === "description") {
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body: body.trim() };
}

function listFilesRecursive(dir: string, baseDir: string): SkillFile[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: SkillFile[] = [];
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(absolutePath, baseDir));
    } else if (entry.isFile()) {
      const relativePath = relative(baseDir, absolutePath).split(sep).join("/");
      files.push({ relativePath, absolutePath });
    }
  }
  return files;
}

/**
 * Scans `skillsDir` for `<name>/SKILL.md` directories and loads each one:
 * frontmatter (name/description), body, and the full file listing (so
 * reference/script/template files can be exposed as MCP resources).
 */
export function loadSkills(skillsDir: string): Skill[] {
  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(skillsDir, entry.name);
    const skillMdPath = join(skillDir, "SKILL.md");
    try {
      if (!statSync(skillMdPath).isFile()) continue;
    } catch {
      continue;
    }

    const raw = readFileSync(skillMdPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(raw);

    if (!frontmatter.name || !frontmatter.description) {
      throw new Error(`${skillMdPath} is missing 'name' or 'description' in frontmatter`);
    }
    if (frontmatter.name !== entry.name) {
      // using-superpowers/SKILL.md declares name: using-governed-superpowers,
      // deliberately different from its directory name (see
      // docs/governed-superpowers/hooks-and-skill-discovery.md) - trust the
      // frontmatter name, not the directory name, as the canonical id.
    }

    skills.push({
      name: frontmatter.name,
      description: frontmatter.description,
      dir: skillDir,
      body,
      files: listFilesRecursive(skillDir, skillDir),
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function findSkill(skills: Skill[], name: string): Skill | undefined {
  return skills.find((skill) => skill.name === name);
}

export function searchSkills(skills: Skill[], query: string): Skill[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return skills.filter((skill) =>
    skill.name.toLowerCase().includes(needle) ||
    skill.description.toLowerCase().includes(needle) ||
    skill.body.toLowerCase().includes(needle)
  );
}
