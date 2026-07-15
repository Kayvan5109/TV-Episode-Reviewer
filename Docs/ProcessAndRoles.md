# Episode Ranker — Process & Roles

## Quick Reference — the whole system in one place

Everything below this point is detail and reasoning — useful if you need to know *why*, not
required to operate the project day to day.

**Roles**: Kayvan is the sole human decision-maker on taste/spend/scope. PM Claude (whichever
session is active) owns planning, the `Docs/` files, and orchestrating agents — never writes Swift
directly. Implementer agents build; independent reviewer agents fresh-eyes-check correctness-
critical work before it's called done.

**The doc set, and what each one actually owns**:
- `STATUS.md` — the **dashboard**. Read first, every session.
- `DevelopmentPlan.md` — **the plan**. The idea, current ranking-algorithm design, a running
  discussion space for open questions, detailed development phases, and unresolved issues.
- `AppSpec.md` — **the design content**. What each screen/flow/feature actually is.
- `Risks.md` — the risk/gotcha log, plus resolved technical risks.
- `TechArchitecture.md` — the chosen stack and why.
- `ProcessAndRoles.md` (this file) — **the operating system itself**.
- `Testing.md` — **the manual-test runbook**: how to actually test a build, what to check, where
  feedback gets logged. `STATUS.md`'s Punch List tracks *that* a hands-on check is outstanding;
  this doc holds *how*.

Cross-link between these, don't duplicate content.

**How work actually gets built**:

| Kind of work | Pattern |
|---|---|
| Feel-based (UI layout, animation, visual polish, onboarding copy) | Implementer agent, self-verified → hands-on check on Simulator/device is the real test |
| Correctness-critical (ranking algorithm, persistence/migrations, any networking/API integration, concurrency) | Implementer agent → independent reviewer agent (fresh eyes) → hands-on confirmation |
| Research/open questions | One read-only research agent → PM Claude synthesizes into `Docs/` |

Real code changes get `isolation: "worktree"` (a separate git worktree per agent, so parallel
agents never collide on the same working tree); doc-only/read-only work doesn't need it.

**Xcode project file conflicts**: if using XcodeGen/Tuist (see `TechArchitecture.md`), resolve any
apparent `.xcodeproj`/`project.pbxproj` conflict by regenerating from the source config
(`xcodegen generate` / `tuist generate`) rather than hand-editing the generated file — same
principle as never hand-patching a compiled artifact.

**How ideas/decisions get tracked**: every open item is classified into one of 5 buckets (Blocking
/ Bug / Design decision / Backlog / Rework) the moment it surfaces, tagged with the
`DevelopmentPlan.md` phase it needs deciding by. Defaults to "log it, don't chase it" unless it's
small or actually blocking. Whenever a new phase starts, proactively review the Backlog for
anything tagged to it — a **Phase-Entry Decision Review** — rather than waiting to notice it in a
table.

**How git/commits work**: `main` only ever gets reviewed, verified, completed-milestone commits.
Unfinished/unreviewed work still gets committed and pushed (if a remote exists), just to a separate
branch (worktree or `wip/*`), never left only uncommitted on local disk. Commit at meaningful
completed checkpoints, not continuously mid-task.

**Session continuity (solo version)**: no multi-contributor relay to worry about, but the same
discipline applies for a different reason — a session can get cleared, or you might not touch this
project for months. Any judgment call made solo without time to sit on it gets logged in
`STATUS.md`'s Deviations Awaiting Review and gets a deliberate second look at the start of the next
session, rather than being silently treated as final. Claude's own persistent memory may carry
useful context forward between sessions, but the repo's docs are the authoritative record — if
memory and the docs ever disagree, fix the docs (or the mismatch) rather than trusting memory.

**Usage/budget discipline**: default agents to a cheap model tier; reserve stronger models for
genuine debugging/design-judgment tasks. Prefer doing small things directly over spawning an agent
for them. At high cumulative session usage, avoid starting new agent spawns or scope-expanding
follow-ups without pausing to check in first — better to end a session cleanly with `STATUS.md`
updated than to get force-stopped mid-task.

**If you're a fresh Claude instance picking this project up cold**: read `CLAUDE.md`, then
`STATUS.md` top to bottom (its Punch List first), then this Quick Reference, then whichever detail
section your task actually touches.

## Punch List Triage

Every open item gets exactly one bucket, decided the moment it surfaces:

1. **Blocking / next in sequence** — actually stops forward progress; work it next.
2. **Bugs/features needing hands-on verification or fixing** — real, known, not yet closed.
3. **Design decisions needing human input** — doesn't block code, but needs a decision eventually.
4. **Backlog** — logged, deliberately not being chased right now.
5. **Rework flagged for a later phase** — known future work, not worth doing yet.

Resist the pull to "just quickly fix" something that hasn't been triaged — log it in the right
bucket first, even if you fix it two minutes later. This is what keeps a solo project from
accumulating silent scope creep.

## Agent Workflow Rules

- Correctness-critical work always gets a second, independent agent pass before being called done
  — a fresh-eyes reviewer that re-derives the expected behavior from source/docs rather than just
  reading the implementer's own reasoning, then actually re-runs the tests itself. The ranking
  algorithm is the clearest example of this in this project.
- Real code changes happen in an isolated git worktree per agent (`isolation: "worktree"`), never
  directly against the main working tree, so agent work-in-progress never collides with whatever
  you're doing by hand.
- Continuously-felt/rendered UI work (animations, transitions, gesture feel) always needs a real
  hands-on check on Simulator or device before being called "DONE" — passing unit tests is
  necessary, not sufficient, for anything a human actually perceives.
- Never let an agent take a destructive or unauthorized git action (force-push, deleting a remote
  branch, `git reset --hard`) without your explicit go-ahead for that specific action — don't bake
  that authorization into a subagent's brief in advance.
- To resume a stalled/incomplete agent, use `SendMessage` to its existing session — never spawn a
  fresh `Agent` call when the intent is "continue what's already running." A fresh agent has no
  memory of the stalled one's progress and will silently duplicate work.

## Session-Limit & Forced-Handoff Protocol

Near the top of a session's usage budget: stop starting new agent spawns or scope-expanding
follow-ups. Finish or cleanly pause whatever's in flight, make sure it's committed (and pushed, if
a remote exists), and update `STATUS.md` with exactly what state things are in — so a forced stop
never leaves in-flight work invisible to the next session.
