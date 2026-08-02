import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findSkill, loadSkills, searchSkills } from "../src/skills.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "..", "..", "skills");

const EXPECTED_SKILL_NAMES = [
  "brainstorming",
  "dispatching-parallel-agents",
  "executing-plans",
  "finishing-a-development-branch",
  "receiving-code-review",
  "requesting-code-review",
  "subagent-driven-development",
  "systematic-debugging",
  "test-driven-development",
  "using-git-worktrees",
  "using-governed-superpowers",
  "verification-before-completion",
  "writing-plans",
  "writing-skills",
].sort();

test("loadSkills finds all 14 governed-superpowers skills with name + description", () => {
  const skills = loadSkills(SKILLS_DIR);
  assert.deepEqual(
    skills.map((skill) => skill.name).sort(),
    EXPECTED_SKILL_NAMES
  );
  for (const skill of skills) {
    assert.ok(skill.description.length > 0, `${skill.name} has an empty description`);
    assert.ok(skill.body.length > 0, `${skill.name} has an empty body`);
    assert.ok(
      skill.files.some((file) => file.relativePath === "SKILL.md"),
      `${skill.name} is missing SKILL.md in its file list`
    );
  }
});

test("using-governed-superpowers/SKILL.md loads under its frontmatter name", () => {
  const skills = loadSkills(SKILLS_DIR);
  const bootstrap = findSkill(skills, "using-governed-superpowers");
  assert.ok(bootstrap, "expected a skill named 'using-governed-superpowers'");
  assert.equal(bootstrap!.dir, join(SKILLS_DIR, "using-governed-superpowers"));
});

test("skill reference files are indexed with forward-slash relative paths", () => {
  const skills = loadSkills(SKILLS_DIR);
  const debugging = findSkill(skills, "systematic-debugging");
  assert.ok(debugging);
  const referencePaths = debugging!.files.map((file) => file.relativePath);
  assert.ok(referencePaths.includes("root-cause-tracing.md"));
  assert.ok(!referencePaths.some((path) => path.includes("\\")), "no backslashes in relative paths");
});

test("searchSkills matches on name, description, and body", () => {
  const skills = loadSkills(SKILLS_DIR);
  const results = searchSkills(skills, "root cause");
  assert.ok(results.some((skill) => skill.name === "systematic-debugging"));
});

test("findSkill returns undefined for an unknown skill", () => {
  const skills = loadSkills(SKILLS_DIR);
  assert.equal(findSkill(skills, "does-not-exist"), undefined);
});
