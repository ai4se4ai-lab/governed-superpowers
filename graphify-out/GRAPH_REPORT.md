# Graph Report - .  (2026-07-30)

## Corpus Check
- 174 files · ~200,345 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 677 nodes · 894 edges · 100 communities (50 shown, 50 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 42 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Visual Brainstorming Server
- Codex Plugin Sync
- GitHub Templates
- Brainstorm Server Branding Tests
- Lifecycle Management Tests
- WebSocket Server Tests
- OpenCode Integration Tests
- Root Cause Analysis
- Authentication Tests
- Codex Plugin Build
- Package Configuration
- Claude Code Test Helpers
- Shell Linting
- Codex Plugin Packaging
- SDD Fix Loop Design
- Bootstrap Caching Tests
- Task-Scoped Review
- Pi Extension
- Writing Skills Documentation
- Shell Lint Tests
- Worktree Management
- Test Infrastructure
- Session Start Hook
- SDD Implementer
- SDD Review Prompts
- Skill Infrastructure
- Platform Support
- Parallel Agents
- Gemini Integration
- Plan Execution
- Code Review Workflow
- Systematic Debugging
- TDD Workflow
- Verification Patterns
- Plan Writing
- Explicit Skill Requests
- Antigravity Tools
- Codex Tools
- Gemini Tools
- Pi Tools
- Windows Compatibility
- Visual Companion Design
- Zero-Dep Server Design
- Codex Compatibility Design
- Worktree Rototill Design
- Platform-Neutral Prose
- Positive Instruction Redesign
- Strict Cost SDD
- Visual Companion Auth
- Visual Companion Final Hardening
- SDD Workspace Design
- SDD Fix Loop Redesign
- Testing Infrastructure Docs
- Visual Companion Feature
- Finishing Dev Branch
- Receiving Code Review
- Code Reviewer Prompts
- Porting to New Harness
- Kimi Documentation
- OpenCode Documentation
- OpenCode Support Design
- Skills Improvement Plan
- Visual Brainstorming Plan
- Document Review System Plan
- Visual Refactor Plan
- Zero-Dep Server Plan
- Codex Compatibility Plan
- Worktree Rototill Plan
- Drill Lift Plan
- Pi Extension Plan
- SDD Review Dispatch Plan
- Visual Companion Issues
- Visual Auth Hardening Plan
- Final Hardening Plan
- SDD Workspace Plan
- SDD Fix Loop Plan
- Funding Config
- Pre-commit Config
- Agent Docs
- Claude Project Docs
- Code of Conduct
- Main README
- Release Notes
- Condition-Based Waiting
- Defense in Depth
- Test Pressure Cases
- Writing Good Tests
- Persuasion Principles
- Testing with Subagents
- RED-GREEN-REFACTOR
- Test Prompts
- Visual Assets
- Marketplace Config
- OpenCode Plugin
- Pi Extension TypeScript
- Version Bumping
- Gemini Extension
- Hook Scripts
- Brainstorm Helper

## God Nodes (most connected - your core abstractions)
1. `main()` - 21 edges
2. `main()` - 16 edges
3. `Governed-Superpowers Main Documentation` - 15 edges
4. `handleRequest()` - 14 edges
5. `runTests()` - 14 edges
6. `sync-to-codex-plugin.sh script` - 12 edges
7. `runTests()` - 12 edges
8. `Systematic Debugging` - 12 edges
9. `runTests()` - 11 edges
10. `assert` - 9 edges

## Surprising Connections (you probably didn't know these)
- `OpenCode Installation Guide` --semantically_similar_to--> `OpenCode Documentation`  [INFERRED] [semantically similar]
  .opencode/INSTALL.md → docs/README.opencode.md
- `Task-scoped review dispatch` --conceptually_related_to--> `Code reviewer prompt template`  [INFERRED]
  docs/superpowers/specs/2026-06-09-sdd-task-scoped-review-dispatch-design.md → skills/requesting-code-review/code-reviewer.md
- `Contributor Guidelines for AI Agents` --references--> `Brainstorming Skill`  [INFERRED]
  CLAUDE.md → README.md
- `Governed-Superpowers Main Documentation` --references--> `Kimi Code Documentation`  [EXTRACTED]
  README.md → docs/README.kimi.md
- `Visual companion auth hardening` --conceptually_related_to--> `Visual companion`  [INFERRED]
  docs/superpowers/specs/2026-06-10-visual-companion-auth-hardening-design.md → skills/brainstorming/visual-companion.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Issue Template System** — _github_issue_template_bug_report, _github_issue_template_feature_request, _github_issue_template_platform_support, _github_issue_template_config [EXTRACTED 1.00]
- **Supported Harnesses** — claude_code, codex, cursor, opencode, kimi_code, gemini_cli, antigravity [EXTRACTED 1.00]
- **Identified Skill Gaps from User Feedback** — configuration_change_verification_gap, background_process_accumulation, context_bloat_in_subagent_prompts, mock_interface_drift [EXTRACTED 1.00]
- **Visual Companion Security and Architecture Evolution** — docs_governed-superpowers_plans_2026-02-19-visual-brainstorming-refactor, docs_governed-superpowers_plans_2026-03-11-zero-dep-brainstorm-server, docs_governed-superpowers_plans_2026-06-09-visual-companion-issues, docs_governed-superpowers_plans_2026-06-10-visual-companion-auth-hardening, docs_governed-superpowers_plans_2026-06-11-visual-companion-final-hardening-fixup [INFERRED 0.85]
- **Worktree Management Cross-Platform Strategy** — docs_governed-superpowers_plans_2026-03-23-codex-app-compatibility, docs_governed-superpowers_plans_2026-04-06-worktree-rototill, concept_detect_and_defer, concept_provenance_based_cleanup [INFERRED 0.95]
- **Platform Neutralization Multi-Phase Campaign** — docs_governed-superpowers_specs_2026-05-05-platform-neutral-prose-design, docs_governed-superpowers_specs_2026-05-05-platform-neutral-config-refs-design, docs_governed-superpowers_specs_2026-05-05-platform-neutral-readme-design [EXTRACTED 1.00]
- **SDD design evolution** — docs_superpowers_specs_2026_06_09_sdd_task_scoped_review_dispatch_design_task_scoped_review, docs_superpowers_specs_2026_06_10_strict_cost_sdd_design_strict_cost_ladder, docs_superpowers_specs_2026_07_06_sdd_plan_scoped_workspace_plan_scoped_workspace, docs_superpowers_specs_2026_07_15_sdd_fix_loop_redesign_design_sdd_fix_loop_redesign [INFERRED 0.85]
- **Visual companion hardening sequence** — docs_superpowers_specs_2026_06_10_visual_companion_auth_hardening_design_visual_companion_auth_hardening, docs_superpowers_specs_2026_06_11_visual_companion_final_hardening_fixup_design_visual_companion_final_hardening, skills_brainstorming_visual_companion_visual_companion [EXTRACTED 1.00]
- **Code review workflow** — skills_requesting_code_review_skill_requesting_code_review_skill, skills_requesting_code_review_code_reviewer_prompt, skills_receiving_code_review_skill_receiving_code_review_skill [EXTRACTED 1.00]
- **Systematic Debugging Supporting Techniques** — skills_systematic_debugging_root_cause_tracing, skills_systematic_debugging_defense_in_depth, skills_systematic_debugging_condition_based_waiting [EXTRACTED 1.00]
- **Systematic Debugging Validation Tests** — skills_systematic_debugging_test_academic, skills_systematic_debugging_test_pressure_1, skills_systematic_debugging_test_pressure_2, skills_systematic_debugging_test_pressure_3 [EXTRACTED 1.00]
- **Platform-Specific Tool Mappings** — skills_using_superpowers_references_antigravity_tools, skills_using_superpowers_references_codex_tools, skills_using_superpowers_references_gemini_tools, skills_using_superpowers_references_pi_tools [EXTRACTED 1.00]
- **Seven Persuasion Principles Applied to Skills** — skills_writing_skills_cialdini_authority, skills_writing_skills_cialdini_commitment, skills_writing_skills_cialdini_scarcity, skills_writing_skills_bulletproofing [EXTRACTED 1.00]
- **Test-Driven Development Applied to Documentation** — skills_writing_skills_tdd_mapping, skills_writing_skills_red_green_refactor, skills_writing_skills_testing_subagents [EXTRACTED 1.00]
- **Explicit Skill Request Test Suite** — tests_explicit_skill_requests_action_oriented, tests_explicit_skill_requests_after_planning, tests_explicit_skill_requests_claude_suggested, tests_explicit_skill_requests_sdd_abbreviation, tests_explicit_skill_requests_mid_conversation, tests_explicit_skill_requests_brainstorming, tests_explicit_skill_requests_skip_formalities, tests_explicit_skill_requests_sdd_please, tests_explicit_skill_requests_systematic_debugging [EXTRACTED 1.00]

## Communities (100 total, 50 thin omitted)

### Community 0 - "Visual Brainstorming Server"
Cohesion: 0.06
Nodes (56): bootstrapPage(), brandMarkup(), broadcast(), browserLauncherForPlatform(), chmodOwnerOnly(), RFC-6455, clients, companionUrl() (+48 more)

### Community 1 - "Codex Plugin Sync"
Cohesion: 0.14
Nodes (25): add_openai_agent_metadata_fixture(), assert_branch_absent(), assert_contains(), assert_current_branch(), assert_equals(), assert_file_equals(), assert_matches(), assert_not_contains() (+17 more)

### Community 2 - "GitHub Templates"
Cohesion: 0.08
Nodes (27): Pull Request Template, OpenCode Installation Guide, Acceptance Test, Antigravity, Bootstrap Mechanism, Brainstorming Skill, Claude Code, Contributor Guidelines for AI Agents (+19 more)

### Community 3 - "Brainstorm Server Branding Tests"
Cohesion: 0.19
Nodes (24): assert, assertBrandedFallbackText(), assertBrandedWithLogo(), assertFramedLogoSupportsDarkTheme(), assertFramedScreenUsesBrandHeader(), assertHeaderAvoidsNarrowOverlap(), assertLogoKeepsTransparentBackground(), assertTelemetryImage() (+16 more)

### Community 4 - "Lifecycle Management Tests"
Cohesion: 0.16
Nodes (21): assert, firstServerStarted(), fs, httpStatus(), isWindowsLikeShell(), killAndWait(), makeShellTempDir(), newestSessionDir() (+13 more)

### Community 5 - "WebSocket Server Tests"
Cohesion: 0.15
Nodes (20): assert, assertStartedOnExpectedPort(), cleanup(), CONTENT_DIR, ensureSymlinkWorks(), fetch(), fs, http (+12 more)

### Community 6 - "OpenCode Integration Tests"
Cohesion: 0.12
Nodes (15): HOME, OPENCODE_CONFIG_DIR, setup.sh script, XDG_CONFIG_HOME, run_missing_file_check(), run_present_file_check(), test-bootstrap-caching.sh script, test-plugin-loading.sh script (+7 more)

### Community 7 - "Root Cause Analysis"
Cohesion: 0.14
Nodes (21): Backward Tracing to Original Trigger, Condition-Based Waiting, Condition-Based Waiting vs Arbitrary Delays, Systematic Debugging Creation Log, Defense-in-Depth Validation, Four-Layer Defense-in-Depth Validation, Root Cause Tracing, Systematic Debugging (+13 more)

### Community 8 - "Authentication Tests"
Cohesion: 0.16
Nodes (20): assert, assertSecurityHeaders(), assertStartedOnExpectedPort(), cleanup(), CONTENT_DIR, EXPECTED_SECURITY_HEADERS, fs, get() (+12 more)

### Community 9 - "Codex Plugin Build"
Cohesion: 0.21
Nodes (17): append_git_ignored_directory_excludes(), append_git_ignored_file_excludes(), apply_to_preview_checkout(), confirm(), copy_local_destination_overlay(), copy_preserved_destination_metadata(), die(), ignored_directory_has_tracked_descendants() (+9 more)

### Community 10 - "Package Configuration"
Cohesion: 0.12
Nodes (16): description, keywords, main, name, pi, extensions, skills, type (+8 more)

### Community 11 - "Claude Code Test Helpers"
Cohesion: 0.15
Nodes (8): assert_contains(), assert_order(), cleanup_test_project(), test-helpers.sh script, test-subagent-driven-development-integration.sh script, test-subagent-driven-development.sh script, run_and_check(), test-worktree-native-preference.sh script

### Community 12 - "Shell Linting"
Cohesion: 0.37
Nodes (11): add_shell_file(), collect_all_shell_files(), collect_changed_shell_files(), collect_requested_shell_files(), die(), ensure_git_work_tree(), is_shell_file(), require_tool() (+3 more)

### Community 13 - "Codex Plugin Packaging"
Cohesion: 0.32
Nodes (8): assert_contains(), assert_equals(), assert_not_matches(), extract_archive(), fail(), pass(), test-package-codex-plugin.sh script, write_metadata_fixture()

### Community 14 - "SDD Fix Loop Design"
Cohesion: 0.21
Nodes (12): Fix Loop Escalation Strategy, Fresh Subagent Per Task Pattern, Ledger-Based Recovery from Context Loss, Model Selection by Task Complexity, Task Review Loop (spec + quality), Implementer Subagent Prompt Template, Scoped Re-Review Prompt Template, Subagent-Driven Development (+4 more)

### Community 15 - "Bootstrap Caching Tests"
Cohesion: 0.17
Nodes (5): afterFirst, afterSecond, firstOutput, result, secondOutput

### Community 16 - "Task-Scoped Review"
Cohesion: 0.20
Nodes (11): Cost iteration results, Task-scoped review dispatch, Positive-instruction design doctrine, L1 Plan-side crispness, L2 Controller tier, L3 Reviewer tier, Strict-cost SDD experiment ladder, Fix loop mechanism (+3 more)

### Community 17 - "Pi Extension"
Cohesion: 0.27
Nodes (10): bootstrapSkillPath, extensionDir, firstNonCompactionSummaryIndex(), getBootstrapContent(), messageContainsBootstrap(), packageRoot, piToolMapping(), skillsDir (+2 more)

### Community 18 - "Writing Skills Documentation"
Cohesion: 0.22
Nodes (11): Anthropic Skill Authoring Best Practices, Bulletproofing Skills Against Rationalization, Authority Persuasion Principle, Commitment Persuasion Principle, CLAUDE.md Testing Methodology, Persuasion Principles for Skill Design, Progressive Disclosure Pattern, RED-GREEN-REFACTOR for Skills (+3 more)

### Community 19 - "Shell Lint Tests"
Cohesion: 0.38
Nodes (8): assert_contains(), assert_not_contains(), configure_git_identity(), fail(), make_fixture_repo(), pass(), test-lint-shell.sh script, write_stub_tool()

### Community 20 - "Worktree Management"
Cohesion: 0.20
Nodes (10): Browser Displays Terminal Commands Architecture, Per-Session Secret Key Authentication, WebSocket RFC 6455 Implementation, Visual Brainstorming Refactor Implementation Plan, Zero-Dependency Brainstorm Server Implementation Plan, Visual Companion Issue Catalog, Visual Companion Auth Hardening Implementation Plan, Visual Companion Final Hardening Fixup Implementation Plan (+2 more)

### Community 21 - "Test Infrastructure"
Cohesion: 0.31
Nodes (6): fail(), http_check(), pass(), windows-lifecycle.test.sh script, skip(), wait_for_server_info()

### Community 22 - "Session Start Hook"
Cohesion: 0.20
Nodes (5): __dirname, extensionPath, packageJsonPath, piToolsPath, repoRoot

### Community 23 - "SDD Implementer"
Cohesion: 0.39
Nodes (5): cmd_audit(), cmd_bump(), cmd_check(), bump-version.sh script, write_json_field()

### Community 24 - "SDD Review Prompts"
Cohesion: 0.42
Nodes (7): connect(), nextReconnectDelay(), reloadAfterRecovery(), sessionKey(), setStatus(), showTombstone(), websocketUrl()

### Community 25 - "Skill Infrastructure"
Cohesion: 0.33
Nodes (8): combineGraphs(), { execSync }, extractDotBlocks(), extractGraphBody(), fs, main(), path, renderToSvg()

### Community 26 - "Platform Support"
Cohesion: 0.22
Nodes (6): assert, fs, HELPER, moduleShim, path, src

### Community 27 - "Parallel Agents"
Cohesion: 0.36
Nodes (6): bad(), ok(), stop-server.test.sh script, track_dir(), track_pid(), untrack_pid()

### Community 28 - "Gemini Integration"
Cohesion: 0.39
Nodes (5): die(), metadata_root_from_dir(), prepare_metadata_root(), package-codex-plugin.sh script, usage()

### Community 29 - "Plan Execution"
Cohesion: 0.25
Nodes (7): dependencies, ws, name, scripts, test, version, ws

### Community 30 - "Code Review Workflow"
Cohesion: 0.36
Nodes (7): analyze_main_session(), calculate_cost(), format_tokens(), main(), Analyze a session file and return token usage broken down by agent., Format token count with thousands separators., Calculate estimated cost in dollars.

### Community 31 - "Systematic Debugging"
Cohesion: 0.39
Nodes (5): assert_contains(), fail(), pass(), setup_project(), test-find-polluter.sh script

### Community 32 - "TDD Workflow"
Cohesion: 0.43
Nodes (4): command_has_server_id(), is_brainstorm_server(), mark_stopped(), stop-server.sh script

### Community 33 - "Verification Patterns"
Cohesion: 0.33
Nodes (6): assert, crypto, RFC-6455, path, runTests(), SERVER_PATH

### Community 34 - "Plan Writing"
Cohesion: 0.52
Nodes (4): assert_command_output(), fail(), pass(), test-session-start.sh script

### Community 35 - "Explicit Skill Requests"
Cohesion: 0.33
Nodes (6): Detect-and-Defer Pattern, Provenance-Based Cleanup, Codex App Compatibility Implementation Plan, Worktree Rototill Implementation Plan, Codex App Compatibility Design, Worktree Rototill Design

### Community 36 - "Antigravity Tools"
Cohesion: 0.40
Nodes (6): Visual companion auth hardening, Visual companion final hardening fixup, Frame template HTML, brainstorming skill, Spec document reviewer prompt template, Visual companion

### Community 37 - "Codex Tools"
Cohesion: 0.33
Nodes (6): Antigravity CLI Tool Mapping, Codex Tool Mapping, Gemini CLI Tool Mapping, Pi Tool Mapping, Using Governed-Superpowers, Skill Invocation Priority (Process before Implementation)

### Community 38 - "Gemini Tools"
Cohesion: 0.53
Nodes (4): fail(), make_fake_uname(), pass(), start-server.test.sh script

### Community 39 - "Pi Tools"
Cohesion: 0.53
Nodes (4): fail(), main(), pass(), test-sdd-workspace.sh script

### Community 40 - "Windows Compatibility"
Cohesion: 0.60
Nodes (5): Background Process Accumulation, Configuration Change Verification Gap, Context Bloat in Subagent Prompts, Skills Improvements from User Feedback, Mock-Interface Drift

### Community 41 - "Visual Companion Design"
Cohesion: 0.40
Nodes (5): Drill (eval harness), evals/ directory, Subagent-gated verification protocol, Plugin tests (tests/ directory), Skill behavior evals (evals/ directory)

### Community 42 - "Zero-Dep Server Design"
Cohesion: 0.50
Nodes (4): Review Loop Pattern, Document Review System Implementation Plan, SDD Task-Scoped Review Dispatch Implementation Plan, Document Review System Design

### Community 43 - "Codex Compatibility Design"
Cohesion: 0.83
Nodes (4): OpenCode Support Design Plan, OpenCode Support Implementation Plan, OpenCode Plugin, Shared Skills Core Module

### Community 46 - "Platform-Neutral Prose"
Cohesion: 0.83
Nodes (3): assert_contains(), assert_not_contains(), test-worktree-path-policy.sh script

### Community 47 - "Positive Instruction Redesign"
Cohesion: 0.67
Nodes (3): Bug Report Template, Feature Request Template, Platform Support Request Template

### Community 48 - "Strict Cost SDD"
Cohesion: 1.00
Nodes (3): Platform-Neutral Config Refs Design, Platform-Neutral Prose Design, Platform-Neutral README Design

### Community 49 - "Visual Companion Auth"
Cohesion: 0.67
Nodes (3): Plan-scoped workspace eval GREEN results, Plan-scoped workspace eval RED outcome, SDD plan-scoped workspace

### Community 52 - "SDD Fix Loop Redesign"
Cohesion: 0.67
Nodes (3): Plan Document Reviewer Prompt Template, writing-plans skill, Task Right-Sizing Principle

## Knowledge Gaps
- **203 isolated node(s):** `__dirname`, `extensionDir`, `packageRoot`, `skillsDir`, `bootstrapSkillPath` (+198 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **50 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `__dirname`, `extensionDir`, `packageRoot` to the rest of the system?**
  _203 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Visual Brainstorming Server` be split into smaller, more focused modules?**
  _Cohesion score 0.055191256830601096 - nodes in this community are weakly interconnected._
- **Should `Codex Plugin Sync` be split into smaller, more focused modules?**
  _Cohesion score 0.14204545454545456 - nodes in this community are weakly interconnected._
- **Should `GitHub Templates` be split into smaller, more focused modules?**
  _Cohesion score 0.08262108262108261 - nodes in this community are weakly interconnected._
- **Should `WebSocket Server Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.1471861471861472 - nodes in this community are weakly interconnected._
- **Should `OpenCode Integration Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.12121212121212122 - nodes in this community are weakly interconnected._
- **Should `Root Cause Analysis` be split into smaller, more focused modules?**
  _Cohesion score 0.1380952380952381 - nodes in this community are weakly interconnected._