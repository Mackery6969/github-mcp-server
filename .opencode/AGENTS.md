# OpenCode Worktree Workflow

## Detecting a worktree

A **worktree** is identified by checking if `.git` is a **file** (not a directory):

```bash
# In a worktree: .git is a file → "gitdir: /path/to/main-repo/.git/worktrees/<name>"
# In the main repo: .git is a directory
# In a non-git dir: .git does not exist
```

Only apply the branch/PR workflow below when you detect you're in a worktree.
In the main repo checkout or non-git repos, work directly on the branch you're given — no auto-branching.

## Branch & PR Workflow (worktrees only)

When working in a worktree, follow this pattern:

### 1. Create a branch (do this on first task)

Check if a branch already exists for this worktree:

```bash
git branch --show-current
```

If no branch exists or you're on `main`/`master`/`upstream/main`, create one from the default branch:

```bash
git checkout -b opencode/<descriptive-name>
git push -u origin opencode/<descriptive-name>
```

### 2. Commit as you work

Use conventional commit messages. Commits are **authored by the owner** (your local git user).

If co-author is configured, add a `Co-authored-by:` line to commit bodies. If not, commit normally — no extra line needed.

### 3. When finished — push and create a PR

When you've completed all work and are done with the task:

1. **Push the branch:**
   ```bash
   git push origin opencode/<descriptive-name>
   ```

2. **Create a PR** using the GitHub tools (or CLI):
   ```bash
   gh pr create \
     --title "<conventional-commit-style title>" \
     --body "<summary of changes>" \
     --base main \
     --head opencode/<descriptive-name>
   ```

   Or use the `create_pull_request` MCP tool with:
   - `owner`: repo owner
   - `repo`: repo name
   - `base`: `main` (or default branch)
   - `title`: descriptive title
   - `body`: summary of changes

   If co-author is configured, add it via the `co-authors` input.

3. **Mention PR URL** to the user so they can review.

### Tips

- Branch naming: `opencode/<short-description>` (e.g., `opencode/fix-ci-timeout`)
- If a branch already exists, fetch and rebase: `git fetch && git rebase main`
- Always push before creating a PR
- If you're asked to continue work later, the branch already exists — skip creation
