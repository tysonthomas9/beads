#!/bin/bash
# claude-merge.sh - Use Claude to merge a branch and resolve conflicts
#
# Usage:
#   ./claude-merge.sh <source-branch> [target-branch]
#
# Examples:
#   ./claude-merge.sh webui/falcon                    # Merge to feature/web-ui (default)
#   ./claude-merge.sh webui/falcon feature/web-ui     # Explicit target
#   ./claude-merge.sh webui/falcon main               # Merge to main
#
# The script will:
#   1. Checkout target branch
#   2. Attempt merge from source branch
#   3. If conflicts, launch Claude to resolve them
#   4. Complete the merge and push

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SOURCE_BRANCH="$1"
TARGET_BRANCH="${2:-feature/web-ui}"

if [ -z "$SOURCE_BRANCH" ]; then
    echo "Usage: ./claude-merge.sh <source-branch> [target-branch]"
    echo ""
    echo "Examples:"
    echo "  ./claude-merge.sh webui/falcon                  # Merge to feature/web-ui"
    echo "  ./claude-merge.sh webui/falcon main             # Merge to main"
    exit 1
fi

echo "========================================="
echo "Merge: $SOURCE_BRANCH → $TARGET_BRANCH"
echo "========================================="

# Fetch latest
git fetch origin

# Checkout target branch
echo "Checking out $TARGET_BRANCH..."
git checkout "$TARGET_BRANCH"
git pull origin "$TARGET_BRANCH"

# Attempt merge
echo "Attempting merge from $SOURCE_BRANCH..."
if git merge "$SOURCE_BRANCH" -m "Merge $SOURCE_BRANCH into $TARGET_BRANCH

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"; then
    echo "✓ Merge completed successfully (no conflicts)"
    git push origin "$TARGET_BRANCH"
    echo "✓ Pushed to origin/$TARGET_BRANCH"
    exit 0
fi

# If we get here, there are conflicts
echo ""
echo "⚠ Merge conflicts detected. Launching Claude to resolve..."
echo ""

# Get list of conflicted files
CONFLICTS=$(git diff --name-only --diff-filter=U)
echo "Conflicted files:"
echo "$CONFLICTS"
echo ""

claude --dangerously-skip-permissions "
## WORKFLOW: Resolve Merge Conflicts

You are resolving merge conflicts for: $SOURCE_BRANCH → $TARGET_BRANCH

### Conflicted Files
The following files have conflicts:
$CONFLICTS

### Step 1: Understand the Conflict
For each conflicted file:
- Read the file to see the conflict markers (<<<<<<, =======, >>>>>>>)
- Understand what changes came from each branch
- The HEAD section is from $TARGET_BRANCH (current branch)
- The incoming section is from $SOURCE_BRANCH (being merged)

### Step 2: Resolve Each Conflict
For each conflicted file:
- Determine the correct resolution (keep one side, combine both, or write new code)
- Edit the file to remove ALL conflict markers
- Ensure the resulting code is syntactically correct
- Ensure the logic makes sense with both sets of changes integrated

### Step 3: Verify Resolution
- Run any relevant build commands to ensure code compiles
- Run tests if available
- Check that no conflict markers remain: grep -r '<<<<<<' . or grep -r '>>>>>>>' .

### Step 4: Complete the Merge
Once all conflicts are resolved:
\`\`\`bash
git add -A
git commit -m \"Resolve merge conflicts: $SOURCE_BRANCH → $TARGET_BRANCH

Conflicts resolved in:
$CONFLICTS

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>\"
git push origin $TARGET_BRANCH
\`\`\`

### Step 5: Verify
- Run 'git status' to confirm clean working tree
- Confirm push succeeded

### CRITICAL: Do Not Leave Conflicts
- Every conflict marker must be removed
- The code must compile/build
- If you cannot resolve a conflict, explain why and do NOT commit
"
