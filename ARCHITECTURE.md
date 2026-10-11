# ARCHITECTURE.md: Orchestrator Contract & Specification

## 1. Project Goal
Orchestrator is a personal multi-model AI agent web application (React + Node.js Express). The app stores task state, orchestrator models discuss plans with the user, isolated branch executors perform steps strictly according to versioned plan specifications, an intelligent router manages models, keys, and failovers, a reviewer AI verifies work, and an interactive n8n-style canvas visualizes the workflow.

---

## 2. Core Principles (Contract 6.1–6.14)
1. **App Stores State (6.1):** The app stores the task state in `/data`, not the model. Any model can take over mid-task.
2. **Plan is a Contract (6.2):** The plan changes ONLY via the "Create plan" button, a confirmed directive, or manual user edits/uploads. Orchestrator chat never silently alters the plan.
3. **Scoped Executor Context (6.3):** Executors see only their current step, branch goal, project goal, branch decisions log, previous step outputs of their branch, and existing project file paths.
4. **Executor Contract (6.4):** Executors return strictly `DONE` (result, decisions, files) or `BLOCKED` (reason). No skipping or inventing steps.
5. **Branch Isolation (6.5):** Branches never read or write another branch's internal state. Directives only affect selected branches.
6. **Key Security (6.6):** API keys live server-side, masked as `****XXXX`, and never appear in git, logs, exchanges, canvas, prompts, or UI. `/data` is gitignored.
7. **Assembly Rules (6.7):** Relative paths only (no `..` or absolute paths). First branch to write a path owns it.
8. **Sandboxed Code (6.8):** Generated code runs in an isolated iframe sandbox (`allow-scripts`, no `allow-same-origin`).
9. **No Hardcoded Models (6.9):** Model names are never hardcoded in presets, tests, or fallbacks. Validated dynamically via provider endpoints.
10. **Provider Boundary (6.10):** Failover stays within the branch's provider by default. Other providers used only if explicitly enabled.
11. **Canvas Read/Assign Scope (6.11):** Canvas visualizes flow and allows model slot assignments with confirmation. Never alters execution state directly.
12. **Chat Safety (6.12):** Orchestrator chat only converses; execution starts only via explicit user action.
13. **Comprehensive Logging (6.13):** Every call logs `caller -> target` for tracing and visualization.
14. **Simulated Failures (6.14):** Testing aids mark actions as `simulated` without calling external providers.

---

## 3. Plan Specification Format
```markdown
# Project plan v<N>
Goal: <text>
## Branch: <name> (role: code | ui | images | text | other)
Branch goal: <text>
### Step <n>: <title>
- Description: <text>
- Acceptance criteria: <text>
- Complexity: low | medium | high
- Type: code | ui | image | text | other
- Status: todo | in_progress | done | blocked
```

---

## 4. Stage Roadmap
- [x] **Stage 0: Skeleton** — Express + React scaffold, `/data` setup, health endpoint, minimal UI. (DONE)
- [x] **Stage 1: Model Core** — Provider adapter, registry, connection tests, test chat, masked keys. (DONE)
- [x] **Stage 2A: Orchestrator Chat** — Planning chat, system prompt, chat history. (DONE)
- [x] **Stage 3A: Branches, State & Executor** — Branch runners, state persistence, step execution. (DONE)
- [x] **Stage 3B: Execution Mode & Directives** — Execution dashboard, directives, selective branch rewrites. (DONE)


- [x] **Stage 4A: Project Assembly** — File tree, file ownership, ZIP export, sandboxed preview. (DONE)
- [x] **Stage 4B: Image Generation** — Image model adapter, prompts, assets storage. (DONE)
- [x] **Stage 5A: Live Canvas** — React Flow diagram, live status, exchanges inspector. (DONE)
- [x] **Stage 5B: Canvas Slots** — Model and tool assignments from canvas. (DONE)

- [x] **Stage 6A: Router within Provider** — Tier mapping, automatic failover, cooldowns. (DONE)
- [x] **Stage 6B: Multi-Key & Cross-Provider** — Multiple keys per provider, last-resort fallback. (DONE)
- [x] **Stage 7A: Reviewer Loop** — Automatic verification, rework loop, escalation. (DONE)
- [x] **Stage 7B: Execution Checks & Project Review** — Static syntax validation, local run checks. (DONE)
- [x] **Stage 8A: Notifications** — In-app alerts, chat system messages. (DONE)
- [x] **Stage 8B: Telegram Messenger** — Bot connector, commands, remote approvals. (DONE)
- [x] **Stage 8C: Plugins** — Instruction packs for planner and roles. (DONE)
- [x] **Stage 9A: Hardening & Auth** — Single-user login, data export/import. (DONE)
- [x] **Stage 9B: Deployment & Desktop** — Server deployment, desktop wrapper / PWA. (DONE)

---

## 5. Decisions (Section 13 Questionnaire Answers)
- 1. Tool: Google AI Studio Build
- 2. Existing code: No, clean start
- 3. GitHub: New private repository
- 4. Local OS / Node: PC guide provided for Node.js 22 when deploying locally
- 5. Verification device: PC browser
- 6. Providers: Gemini (free tier) initially
- 7. Role distribution: Strongest available model for planning/review, cheapest/sufficient for code/UI
- 8. Image models: None initially, skip image generation until key is added
- 9. Keys per provider: 1 initially
- 10. Autonomy: Mode B (checkpoint groups with automatic tests and stop on error)
- 11. Token economy: Yes (concise messages, lean repository audits)
- 12. Verification method: Both (user checklist + automated check table)
- 13. UI Language: English
- 14. Theme: Dark only
- 15. Messengers: Telegram at Stage 8
- 16. Target environment: Local PC first, server deployment at the very end in Stage 9
- 17. Desktop wrapper: Decide later
- 18. Local code execution: Allowed in Stage 7B with safety controls
- 19. Requirements / Scope: Standard R1–R20, Stages 0–9
- 20. Architecture: Fullstack Express + Vite React on port 3000
