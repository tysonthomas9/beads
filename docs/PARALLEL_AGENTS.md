# Running Parallel Claude Code Agents with Beads

This document captures learnings from setting up parallel AI agent workflows using beads (`bd`) for task management and git worktrees for isolation.

## Overview

When running multiple Claude Code agents in parallel:
1. **Git worktrees** provide isolated working directories on separate branches
2. **Beads** provides shared task database with dependency management
3. **Blocking dependencies** ensure tasks are worked in correct order
4. **Priority-based selection** lets agents pick the most important ready work

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

## Agent Workflow Script

Create `claude-task.sh` in your repo root:

```bash
#!/bin/bash
# claude-task.sh - Run a disciplined single-task Claude agent

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -n "$1" ]; then
    if [[ "$1" != /* ]]; then
        TARGET_DIR="$SCRIPT_DIR/$1"
    else
        TARGET_DIR="$1"
    fi
    cd "$TARGET_DIR" || { echo "Error: Cannot cd to $TARGET_DIR"; exit 1; }
fi

echo "Running Claude agent in: $(pwd)"
echo "---"

claude --dangerously-skip-permissions "
## WORKFLOW: Single Task Execution

You are a disciplined software engineer. Follow this workflow EXACTLY for ONE task.

### Step 1: Select ONE Task
- Run 'bd ready --limit 10' to see available tasks (sorted by priority, only unblocked tasks shown)
- Run 'bd list --status=in_progress --json' to check for stale tasks (updated_at >10 hours ago = abandoned, reclaim with 'bd update <id> --status in_progress')
- Pick the HIGHEST PRIORITY task (P0 > P1 > P2 > P3 > P4) that is not already in_progress
- Run 'bd show <id>' to understand the task requirements
- Run 'bd update <id> --status in_progress' to claim it
- REMEMBER this task ID - you will work ONLY on this task

### Step 2: Plan (DO NOT CODE YET)
Before writing any code:
- Read relevant existing code to understand patterns and conventions
- Identify what files need to be created or modified
- Write a brief plan as a comment explaining your approach
- Consider edge cases and potential issues
- Identify any dependencies or blockers
- ONLY proceed to Step 3 after planning is complete

### Step 3: Implement
- Follow the plan from Step 2
- Keep changes minimal and focused ONLY on this task
- Follow existing code patterns in the codebase
- Do not refactor unrelated code
- Do not add features beyond the task scope

### Step 4: Manual Testing
- Run/build the code to verify it compiles
- Test the functionality manually to verify it works
- Test edge cases you identified in planning
- If it fails: debug, fix, and re-test before proceeding
- Do NOT proceed until manual testing passes

### Step 5: Write Tests (spawn agent)
- Use the Task tool to spawn an agent to write tests
- Prompt: 'Write unit tests for the changes made in [files]. Follow existing test patterns in the codebase.'
- Verify tests pass by running the test command (e.g., 'go test ./...' or 'npm test')
- If tests fail, fix the code or tests until they pass

### Step 6: Code Review (spawn agent)
- Use the Task tool with subagent_type='feature-dev:code-reviewer'
- Prompt: 'Review the changes for this task. Check for bugs, security issues, code quality, and adherence to project conventions.'
- Document all issues found

### Step 7: Fix Review Issues
- Address ALL issues identified in code review
- Re-run tests after making fixes
- If changes were significant, spawn another code review agent
- Repeat until review passes with no major issues

### Step 8: Complete
- Run the full test suite one final time
- Ensure all tests pass
- Run 'bd close <id> --reason \"Completed with tests and code review\"'
- Run 'bd sync'
- Stage and commit: git add -A && git commit -m \"<brief description> (<task-id>)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>\"
- Push: git push origin HEAD

### CRITICAL: STOP
After completing Step 8, you are DONE.
- Do NOT run 'bd ready' again
- Do NOT pick up another task
- Do NOT continue working
- Simply EXIT

You have completed ONE task through the full workflow. The human will run you again for the next task.
"
```

## Running Parallel Agents

Open 5 terminal windows and run:

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

## Key Commands

### Task Selection
```bash
bd ready                     # Show unblocked tasks sorted by priority
bd ready --limit 10          # Limit results
bd list --status=in_progress # See claimed tasks
bd blocked                   # See what's waiting on dependencies
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
- Merge to main after task completion
- Use `bd sync` before and after merging
