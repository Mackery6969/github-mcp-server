# GitHub MCP Server — Quick Start

## Event-driven PR monitoring

### 1. Set up your GitHub App credentials

```bash
cp .env.example .env
# Fill in GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY_PATH
```

### 2. Configure OpenCode

Copy `.github/opencode.jsonc` to `~/.config/opencode/opencode.json` and set your env vars.
The `github-app` server block is enabled by default.

### 3. Deploy the Cloudflare webhook (real-time triggers)

```bash
cd cloudflare
wrangler deploy
```

Then in your GitHub App settings:
- **Payload URL**: `https://your-worker.workers.dev/webhook`
- **Webhook secret**: value from `cloudflare/wrangler.toml`
- **Events**: `pull_request`, `pull_request_review`, `check_run`

### How it works

```
GitHub → (webhook) → Cloudflare Worker → (API call) → GitHub Actions PR Monitor
```

When a PR is opened, updated, reviewed, or CI completes, the webhook triggers the
monitor workflow which checks CI status, reviews, and flags what needs attention.

### Permissions → Tools

The server auto-filters tools by granted scopes. Your App has all permissions,
so all tools are available. See `.github/opencode.jsonc` for the full mapping.
