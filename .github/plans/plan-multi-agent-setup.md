# Plan: Multi-agent workflow setup

## Request summary

Configure custom agents for VS Code in this repo using `.github/agents/*.agent.md`, using a **mesh collaboration** pattern. **Product Manager (gateway)** remains the default entry point for user prompts, but the user can invoke other agents directly when needed. Add a risk-based checkpoint model with a fast path for small fixes.

## Goals

- Add `.github/agents/*.agent.md` profiles defining roles and mesh collaboration norms.
- Keep Product Manager as the primary input gateway while allowing direct invocation of other agents.
- Replace the universal Critic→human gate with a **risk-based checkpoint** (Fast/Standard/High-risk) and a **GO fast path**.
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
- The Product Manager agent is the default user gateway and can route to other agents (via the `agent` tool) based on need.
- Other agents can be invoked directly and do not block the user.
- The plan template supports Fast/Standard/High-risk triage and a checkpoint status (`GO` / `APPROVED`).
- `.github/plans/_template.md` includes triage + a risk-based checkpoint section that supports fast-path `GO`.
- `.github/plans/README.md` documents naming and gating.
- Each agent prompt includes an explicit `Role:` section.
- Tool configuration matches the agreed tool taxonomy, with `execute` enabled only for the App Developer.

## Plan (drafted by agents)

### Product Manager (Orchestrator)

- Define the target roles and mesh collaboration norms.
- Keep PM as the default gateway; allow direct invocation of other agents.
- Define the triage + checkpointing model to enable a fast path for low-risk work.
- Define the plan artifact naming convention under `.github/plans/`.

### Process Designer

- Define Fast/Standard/High-risk workflow checkpoints.
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
- Check that the mesh workflow is demand-driven and that fast-path still captures acceptance criteria.

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

## Checkpoint

Status: **APPROVED (completed)**

- [x] Human reviewed plan
- [x] Human approved plan

---

## Execution log (only after GO/APPROVED)

### App Developer

- Created `.github/agents/*.agent.md` with mesh collaboration norms and risk-based checkpoint guidance.
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
