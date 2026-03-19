# Plans

This folder contains one plan per user request.

Naming: `plan-<slug>.md`

Examples:

- `plan-dark-mode.md`
- `plan-add-connection-import.md`

Workflow gate:

- Default workflow uses **Product Manager (gateway)** to create a plan file.
- Agents collaborate as a **mesh** (only the relevant specialists are invoked).

Checkpointing (risk-based):

- `Fast` (small, low-risk): proceed on **GO** after scope + acceptance criteria are confirmed.
- `Standard`: Critic review is recommended; explicit user approval is encouraged.
- `High-risk` (IPC/preload, auth, encryption, updates, tool isolation, CSP): require explicit **APPROVED** before implementation.
