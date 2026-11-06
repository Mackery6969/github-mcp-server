# GitHub MCP Server — Quick Start

This repo is a fork of the [GitHub MCP Server](https://github.com/github/github-mcp-server) configured for GitHub App authentication and PR monitoring.

## Setup (5 minutes)

### 1. Find your GitHub App credentials

```bash
# App ID — visible in app settings: https://github.com/settings/apps/<app-name>
# Installation ID — run:
gh api user/installations --jq '.[] | select(.account.login == "YOUR_ORG_OR_USER") | .id'

# Private key — download from app settings > Private keys > Generate a private key
```

### 2. Set environment variables

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Use with OpenCode

Copy `.github/opencode.jsonc` to your OpenCode config:

```bash
# Project-level (in this repo):
cp .github/opencode.jsonc opencode.jsonc

# Or user-level (affects all projects):
# Copy to ~/.config/opencode/opencode.json
```

The `github-app` server block is enabled by default. Set your env vars in your shell, start OpenCode, and GitHub tools will be available.

### 4. Use with Docker (standalone)

```bash
docker run -i --rm \
  --mount "type=bind,source=$(pwd)/app.private-key.pem,destination=/app/key.pem,read-only" \
  -e GITHUB_APP_ID=123456 \
  -e GITHUB_APP_INSTALLATION_ID=7891011 \
  -e GITHUB_APP_PRIVATE_KEY_PATH=/app/key.pem \
  ghcr.io/github/github-mcp-server stdio
```

### 5. Set up Cloudflare webhook (optional, for real-time PR monitoring)

```bash
# Install wrangler:
npm install -g wrangler

# Deploy:
cd cloudflare
wrangler deploy

# Configure your GitHub App webhook settings in GitHub:
#   Payload URL: https://your-worker.workers.dev/webhook
#   Secret: value from cloudflare/wrangler.toml
#   Events: pull_request, pull_request_review, check_run
```

## How Permissions → Tools Work

The server auto-filters tools based on granted permissions (from `pkg/scopes/scopes.go`). Your App has all scopes, so all tools are available. If you restrict scopes later, tools needing missing scopes are hidden.

| Permission/Scope | Tools Exposed |
|---|---|
| `repo` | PRs, issues, code, commits, branches, deployments, code scanning |
| `security_events` | Code scanning alerts, dependabot alerts |
| `workflow` | Actions workflows, runs, jobs, artifacts, logs |
| `notifications` | List, search, mark, dismiss notifications |
| `codespace` | Codespace operations |
| `read:org` | Teams, org membership, org projects |
| `write:org` | Manage org memberships and teams |
| `admin:enterprise` | Enterprise settings, custom properties |
| `gist` | Create, update, delete gists |
| `project` | Full project board control |

## PR Monitoring

Three systems for watching PRs:

1. **OpenCode agent** — The GitHub tools (`pr_monitor`, `pull_request_*` tools) let the agent watch and interact with PRs in real-time during your session.

2. **Scheduled workflow** (`.github/workflows/pr-monitor.yml`) — Runs every 4 hours, checks CI status, reviews, and stale PRs. Uses a Copilot agent to review PRs automatically.

3. **Event-driven** (`pr-monitor-dispatch.yml` + Cloudflare worker) — Real-time webhook triggers on PR opened, reviewed, or CI updated. The Cloudflare worker receives webhooks and dispatches the monitoring workflow.

## Directory Structure

```
.github/
  opencode.jsonc          # OpenCode config template (all 4 auth methods)
  workflows/
    pr-monitor.yml        # PR monitor (Copilot agent review)
    pr-monitor-dispatch.yml # Event-triggered dispatch
    pr-triage.md          # PR triage (existing)
    pr-triage-dispatch.yml # PR triage dispatcher (existing)
docs/
  setup-github-app.md     # Detailed GitHub App setup guide
cloudflare/
  worker.js               # Webhook handler → triggers PR monitoring
  wrangler.toml           # Cloudflare Workers config
.env.example              # All env vars (copy to .env)
```

## Troubleshooting

- **401 errors**: Verify App ID, Installation ID, and private key match
- **Permission denied on repos**: Install the app on those repos/org
- **Private key rejected**: Use PEM from GitHub App settings (PKCS#1 and PKCS#8 both work)
- **OpenCode tools missing**: Check `enabled: true` on the server block

## Security

- Never commit `.env` or the private key PEM
- Use `--toolsets` to limit exposed tools
- Keep the PEM file permissions at `600`
