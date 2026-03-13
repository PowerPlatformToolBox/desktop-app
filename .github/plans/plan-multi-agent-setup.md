# Plan: Multi-agent workflow setup

## Request summary

Configure custom agents for VS Code in this repo using `.github/agents/*.agent.md`, with **Product Manager (orchestrator)** as the single entry point that routes to other agents, and a **human approval gate after Critic** before any implementation agents run.

## Goals

- Add `.github/agents/*.agent.md` profiles defining roles and a strict execution order.
- Enforce a hard gate after the Critic step requiring explicit human approval.
- Establish a repeatable convention for saving outputs to `.github/plans/plan-<slug>.md`.
- Standardize tool naming/availability per agent (planning vs execution).

## Non-goals

- Add automation that forcibly blocks code edits (this is a process convention, not an enforced runtime policy).
- Add new CI, GitHub Actions, or PR templates.
- Create org/enterprise-level agents (workspace-level only).

## Assumptions / Open questions

- Assumption: the team will follow `.github/agents/*.agent.md` as the source of truth for agent behavior.
- Open question: do you want this referenced from the root README for discoverability?

## Acceptance criteria

- `.github/agents/*.agent.md` exists for all requested roles.
- The Product Manager agent is the single entry point and explicitly routes planning work to the other agents (via the `agent` tool) and enforces the Critic → human approval gate.
- `.github/plans/_template.md` exists and includes a human approval checkpoint after Critic.
- `.github/plans/README.md` documents naming and gating.
- Each agent prompt includes an explicit `Role:` section.
- Tool configuration matches the agreed tool taxonomy, with `execute` enabled only for the App Developer.

## Plan (drafted by agents)

### Product Manager (Orchestrator)

- Define the target roles and execution order.
- Make PM the single entry point that routes to other agents using the `agent` tool.
- Enforce the Critic → human approval gate and only route execution agents after approval.
- Define the plan artifact naming convention under `.github/plans/`.

### Process Designer

- Add a hard stop after Critic and require explicit human approval.
- Define validation expectations and repo constraints.

### UI Designer

- Not applicable (documentation-only change).

### Data Architect

- Not applicable (documentation-only change).

### Tech Designer

- Choose locations for artifacts: `.github/agents/` for agent profiles; `.github/plans/` for per-request plans.
- Define a tool strategy (planning agents restricted; execution agent has `execute`) and ensure it matches the intended UX in VS Code.

### Critic

- Ensure minimal scope (docs only) and no extra workflow automation beyond what was requested.
- Check that the tool names match the requested taxonomy and that no planning agent can execute commands.

## Tooling (agreed taxonomy)

The agent profiles should use tool names from this set (scoped per role):

- `vscode`
- `execute` (execution only)
- `read`, `search`, `edit`
- `agent` (orchestration/routing)
- `web`
- `github/*`
- `microsoft-docs/*`
- `playwright/*`
- `github.vscode-pull-request-etc/*` (or the repo’s PR extension tool namespace)

---

## Human approval checkpoint

Status: **APPROVED (completed)**

- [x] Human reviewed plan
- [x] Human approved plan

---

## Execution log (only after approval)

### App Developer

- Created `.github/agents/*.agent.md` with role instructions and the hard gate after Critic.
- Moved the plan folder under `.github/plans/` (template + README + example plan).
- Created this plan file to demonstrate the convention.

### Code Reviewer

- Verified file locations and that the roles match the request.
- Verified PM orchestration and Critic gate are documented.

### Security Reviewer

- No security impact (documentation-only changes).

## Files expected to change

- `.github/agents/*.agent.md`
- `.github/plans/README.md`
- `.github/plans/_template.md`
- `.github/plans/plan-multi-agent-setup.md`

## Validation steps

- Not applicable (documentation-only change).

## Risks & rollback

- Risk: Process compliance relies on human discipline.
- Rollback: delete `.github/agents/` agent profiles and `.github/plans/` if undesired.
