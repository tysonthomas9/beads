# Running Parallel Claude Code Agents with Beads

This document captures learnings from setting up parallel AI agent workflows using beads (`bd`) for task management and git worktrees for isolation.

## Overview

When running multiple Claude Code agents in parallel:
1. **Git worktrees** provide isolated working directories on separate branches
2. **Beads** provides shared task database with dependency management
3. **Blocking dependencies** ensure tasks are worked in correct order
4. **Priority-based selection** lets agents pick the most important ready work
5. **Human-in-the-loop review** via `[Need Review]` prefix pattern

## Two-Script Workflow

We use two separate scripts to separate planning from implementation:

| Script | Purpose | Human Review |
|--------|---------|--------------|
| `claude-plan.sh` | Creates detailed plans, marks tasks `[Need Review]` | Required before implementation |
| `claude-task.sh` | Implements tasks (skips `[Need Review]` tasks) | After completion |
| `claude-merge.sh` | Merges branches with AI conflict resolution | After merge |
| `claude-sync.sh` | Syncs worktrees with integration branch | None |

### The Review Gate Pattern

```
Task: "Add authentication"
        ↓ claude-plan.sh
[Need Review] Add authentication    ← Agent saves plan to --design field
        ↓ Human reviews & approves (removes [Need Review] prefix)
Add authentication                  ← Ready for implementation
        ↓ claude-task.sh
Closed: Add authentication
```

### Why Two Scripts?

1. **Quality control** - Humans review plans before code is written
2. **No wasted work** - Catch design issues before implementation
3. **Clear handoff** - `[Need Review]` in title = human action required
4. **Race condition prevention** - Implementation agents skip review tasks

## Setup

### 1. Create Git Worktrees

```bash
# From your main repo, create worktrees for each agent
bd worktree create falcon --branch work/falcon
bd worktree create cobalt --branch work/cobalt
bd worktree create nova --branch work/nova
bd worktree create ember --branch work/ember
bd worktree create zephyr --branch work/zephyr

# List all worktrees
bd worktree list
```

**What this does:**
- Creates a new directory for each worktree
- Sets up `.beads/redirect` so all worktrees share the same database
- Each worktree has its own branch for isolated code changes

### 2. Create Task Structure with Dependencies

#### Phase Epics

Create epics for each phase of work with appropriate priorities:

```bash
bd create "Phase 1: Setup" -t epic -p 0
bd create "Phase 2: API Layer" -t epic -p 0
bd create "Phase 3: Feature A" -t epic -p 1
bd create "Phase 4: Feature B" -t epic -p 1
# ... etc
```

#### Parent-Child Relationships

Make tasks children of their phase epic:

```bash
# Add parent-child dependency (task belongs to epic)
bd dep add <task-id> <epic-id> --type parent-child
```

#### Blocking Dependencies Between Phases

```bash
# Phase 2 blocked by Phase 1
bd dep add <phase2-epic> <phase1-epic> --type blocks

# Phase 3 blocked by Phase 2
bd dep add <phase3-epic> <phase2-epic> --type blocks
```

#### Blocking Dependencies Within Phases

For sequential tasks within a phase:

```bash
# T002 blocked by T001
bd dep add <t002-id> <t001-id> --type blocks

# T003 blocked by T001 (can run parallel with T002)
bd dep add <t003-id> <t001-id> --type blocks

# T004 blocked by T002
bd dep add <t004-id> <t002-id> --type blocks
```

### 3. Labels for Organization

Add phase labels for filtering:

```bash
bd label add <task-id> phase-1
bd label add <task-id> phase-2
# ... etc
```

## Agent Workflow Scripts

Two scripts in the repo root handle planning and implementation separately.

### Planning Script: `claude-plan.sh`

Use this to have agents create detailed plans that you review before implementation:

```bash
./claude-plan.sh falcon    # Run planning agent in falcon worktree
```

**What it does:**
1. Picks up a task (skips `[Need Review]` tasks)
2. Researches codebase and creates detailed plan
3. Saves plan to task's `--design` field
4. Renames task to `[Need Review] <original title>`
5. Sets status back to `open` and exits

**After planning agent completes:**
```bash
# Review the plan
bd show <task-id>

# If approved - remove [Need Review] prefix
bd update <task-id> --title="<original title>"

# If changes needed - add a comment
bd comment <task-id> "Please reconsider the approach for X"
bd update <task-id> --title="<original title>"  # Remove [Need Review] to let agent retry
```

### Implementation Script: `claude-task.sh`

Use this for tasks that are ready for implementation (no `[Need Review]` prefix):

```bash
./claude-task.sh falcon    # Run implementation agent in falcon worktree
```

**What it does:**
1. Picks up a task (SKIPS any with `[Need Review]` in title)
2. Checks for `--design` field and follows that plan if present
3. Implements, tests, reviews code
4. Commits and pushes
5. Closes task and exits

### Merge Script: `claude-merge.sh`

Use this to merge worktree branches into the integration branch with AI-assisted conflict resolution:

```bash
./claude-merge.sh webui/falcon                  # Merge to feature/web-ui (default target)
./claude-merge.sh webui/falcon feature/web-ui   # Explicit target branch
./claude-merge.sh webui/cobalt main             # Merge directly to main
```

**What it does:**
1. Fetches latest from origin
2. Checks out the target branch and pulls
3. Attempts merge from source branch
4. If no conflicts: commits and pushes automatically
5. If conflicts: launches Claude to resolve them

**Conflict resolution workflow:**
1. Claude reads each conflicted file to understand the conflict markers
2. Determines correct resolution (keep one side, combine both, or write new code)
3. Edits files to remove ALL conflict markers
4. Verifies code compiles and no markers remain
5. Commits and pushes the resolution

**Example branch hierarchy:**
```
main (production)
  └── feature/web-ui (integration branch - main folder)
        ├── webui/falcon  (worktree branch)
        ├── webui/cobalt  (worktree branch)
        ├── webui/nova    (worktree branch)
        ├── webui/ember   (worktree branch)
        └── webui/zephyr  (worktree branch)
```

**Workflow:**
1. Agent completes work on `webui/falcon` branch
2. Run `./claude-merge.sh webui/falcon` to merge to `feature/web-ui`
3. Repeat for other worktrees as they complete work
4. Eventually merge `feature/web-ui` to `main`

### Sync Script: `claude-sync.sh`

Use this to update worktrees with the latest changes from the integration branch:

```bash
./claude-sync.sh falcon               # Sync falcon with feature/web-ui
./claude-sync.sh falcon main          # Sync falcon with main
./claude-sync.sh all                  # Sync all worktrees with feature/web-ui
./claude-sync.sh all main             # Sync all worktrees with main
```

**What it does:**
1. Changes to the worktree directory
2. Fetches latest from origin
3. Merges the source branch into the worktree's branch
4. If conflicts: launches Claude to resolve them
5. Pushes the updated branch

**When to use:**
- After merging work into `feature/web-ui`, sync other worktrees to get those changes
- Before starting new work, ensure worktree has latest code
- After PR is merged to `main`, sync all worktrees with `main`

### Reviewing Tasks Awaiting Approval

```bash
# List all tasks waiting for your review
bd list --status=open --title-contains="Need Review"

# Review a specific task's plan
bd show <task-id>

# Approve (remove prefix, ready for implementation)
bd update <task-id> --title="Implement user authentication"

# Request changes (add comment, remove prefix to trigger re-planning)
bd comment <task-id> "Need to handle edge case X"
bd update <task-id> --title="Plan user authentication"
```

## Running Parallel Agents

### Planning Phase (Human Review Required)

Run planning agents to create plans for review:

```bash
# Terminal 1 - Planning agent
cd /path/to/repo && ./claude-plan.sh falcon

# Terminal 2 - Planning agent
cd /path/to/repo && ./claude-plan.sh cobalt
```

After agents complete, review their plans:

```bash
bd list --status=open --title-contains="Need Review"
bd show <task-id>  # Review the --design field
bd update <task-id> --title="<approved title without [Need Review]>"
```

### Implementation Phase (After Approval)

Once plans are approved, run implementation agents:

```bash
# Terminal 1
cd /path/to/repo && ./claude-task.sh falcon

# Terminal 2
cd /path/to/repo && ./claude-task.sh cobalt

# Terminal 3
cd /path/to/repo && ./claude-task.sh nova

# Terminal 4
cd /path/to/repo && ./claude-task.sh ember

# Terminal 5
cd /path/to/repo && ./claude-task.sh zephyr
```

### Mixed Workflow

You can run both types simultaneously - they won't interfere:
- Planning agents only touch tasks without `[Need Review]` prefix
- Implementation agents skip tasks with `[Need Review]` prefix

## Key Commands

### Task Selection
```bash
bd ready                     # Show unblocked tasks sorted by priority
bd ready --limit 10          # Limit results
bd list --status=in_progress # See claimed tasks
bd blocked                   # See what's waiting on dependencies
```

### Review Workflow
```bash
bd list --title-contains="Need Review"       # Tasks awaiting human review
bd show <id>                                  # View plan in --design field
bd update <id> --title="Approved title"      # Approve (remove [Need Review])
bd comment <id> "Feedback..."                # Request changes
```

### Task Management
```bash
bd update <id> --status in_progress  # Claim a task
bd close <id> --reason "Done"        # Complete a task
bd show <id>                         # View task details with dependencies
```

### Dependency Management
```bash
bd dep add <task> <blocker> --type blocks       # Task blocked by blocker
bd dep add <child> <parent> --type parent-child # Hierarchical relationship
```

### Checking Progress
```bash
bd stats                     # Overall statistics
bd list -l phase-1           # Tasks in a specific phase
bd list --status=closed      # Completed tasks
```

### Merging Completed Work
```bash
./claude-merge.sh webui/falcon              # Merge falcon to feature/web-ui
./claude-merge.sh webui/cobalt              # Merge cobalt to feature/web-ui
./claude-merge.sh feature/web-ui main       # Merge integration branch to main
```

### Syncing Worktrees
```bash
./claude-sync.sh falcon                     # Sync falcon with feature/web-ui
./claude-sync.sh all                        # Sync all worktrees
./claude-sync.sh all main                   # Sync all worktrees with main
```

## Key Learnings

### 1. Dependencies Control Flow, Not Phase Labels

Initially we tried using phase labels to control task order. This was wrong.

**Wrong approach:**
- Check phase labels manually
- Pick tasks from lowest phase number

**Right approach:**
- Use blocking dependencies between tasks
- `bd ready` automatically shows only unblocked tasks
- Agents just pick highest priority ready task

### 2. Hierarchical Structure

```
Phase Epic (P0)
  └── Task 1 (blocks Task 2)
  └── Task 2 (blocks Task 3)
  └── Task 3
```

- Tasks are children of their phase epic (parent-child)
- Tasks within a phase have blocking dependencies
- Phase epics block the next phase's epic

### 3. Priority Ordering

Beads priorities: P0 (critical) > P1 > P2 > P3 > P4 (backlog)

- Set phase epic priorities to control phase order
- Set task priorities within phases for importance
- `bd ready` returns tasks sorted by priority

### 4. Stale Task Detection

Agents should check for abandoned work:

```bash
bd list --status=in_progress --json
```

If `updated_at` is >10 hours old, the task is likely abandoned and can be reclaimed.

### 5. Shared Database, Isolated Code

- All worktrees share the same `.beads` database
- Each worktree has its own git branch
- Agents see the same tasks but commit to different branches
- Merge branches after tasks complete

## Example Dependency Structure

```
Phase 1 (Setup)
  T001 → T002, T003 (parallel)
           ↓
         T004, T005, T006 (parallel)
           ↓
         T007
           ↓
Phase 2 (API) - blocked by Phase 1
  T008 → T009-T017 (parallel)
           ↓
         T018-T022
           ↓
Phase 3, 4, 5, 6 - blocked by Phase 2, can run parallel
           ↓
Phase 7 - blocked by 3, 4, 5, 6
           ↓
Phase 8 - blocked by Phase 7
```

## Troubleshooting

### Agent picks wrong task
- Check `bd ready` - only unblocked tasks should appear
- Verify dependencies with `bd show <id>`
- Add missing blocking dependencies

### Agent keeps going after task complete
- Ensure script has explicit STOP instructions
- Use `--dangerously-skip-permissions` with clear single-task scope

### Tasks not appearing in order
- Check blocking dependencies between tasks
- Use `bd blocked` to see what's waiting
- Verify phase epic dependencies

### Merge conflicts
- Each worktree should be on its own branch
- Use `./claude-merge.sh <source> [target]` for AI-assisted conflict resolution
- Merge to integration branch (`feature/web-ui`) after task completion
- Eventually merge integration branch to `main`
- Use `bd sync` before and after merging

### Agent implements without waiting for review
- Check that agent is using `claude-plan.sh` (not `claude-task.sh`)
- `claude-plan.sh` creates plans and marks `[Need Review]`
- `claude-task.sh` skips `[Need Review]` tasks

### Plans not appearing in review queue
- Verify planning agent set title to `[Need Review] <title>`
- Check status is `open` (not `in_progress` or `deferred`)
- Use `bd list --title-contains="Need Review"` to find them

### Merge script fails
- Ensure source branch exists: `git branch -a | grep <source>`
- Ensure target branch exists and is pushed: `git checkout <target> && git pull`
- Check Claude has permission to resolve files: Use `--dangerously-skip-permissions`
- If Claude can't resolve complex conflicts, resolve manually then run `git add -A && git commit`
- For persistent issues, consider rebasing instead: `git rebase <target>` on the source branch
