# GitHub App Setup for GitHub MCP Server

This guide walks you through setting up the GitHub MCP Server with your own GitHub App — ideal for non-interactive agent use (OpenCode, CI, bots) without manual OAuth logins.

## Prerequisites

- A [GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps) installed on the repository(ies) you want the agent to access
- The app's **private key PEM file** (download from the app settings)
- The app's **App ID** (visible in app settings URL or settings page)
- The app's **Installation ID** (see how to find it below)

## 1. Create the GitHub App

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**
2. Configure:
   - **App name**: anything (e.g. `opencode-agent`)
   - **Homepage URL**: your repo URL
   - **Webhook URL**: leave blank (not needed for stdio)
   - **Repository permissions** — set to what you need:
     | Permission | Level | Why |
     |------------|-------|-----|
     | Contents | Read & write | Read/write files |
     | Pull requests | Read & write | Create/review PRs |
     | Issues | Read & write | Manage issues |
     | Metadata | Read-only | Required for most API calls |
     | Actions | Read & write | View/trigger workflows |
     | Code scanning | Read | View alerts |
     | Administration | Read & write | Repo settings, branches |
     | Contents | Read & write | File operations |
3. **Where can this GitHub App be installed?**: Choose "Only on this account" or "All repositories"
4. **Install the app** on your repository/organization
5. **Generate a private key**: Scroll down to "Private keys" → "Generate a private key" → download the `.pem` file

## 2. Find Your Installation ID

```bash
gh api user/installations \
  --jq '.[] | select(.account.login == "YOUR_ORG_OR_USER") | .id'
```

Or find it manually:
1. Go to your GitHub App settings page
2. The URL contains `app/<APP_ID>`
3. Use the API call above to list installations and find the `id`

## 3. Environment Variables

Set these in your shell (or in a `.env` file that's gitignored):

```bash
export GITHUB_APP_ID=123456
export GITHUB_APP_INSTALLATION_ID=7891011
export GITHUB_APP_PRIVATE_KEY_PATH=/path/to/app.private-key.pem
```

Or use the inline key variant (not recommended for production):

```bash
export GITHUB_APP_PRIVATE_KEY="$(cat /path/to/app.private-key.pem)"
```

## 4. Using with OpenCode

Copy `.github/opencode.jsonc` to your OpenCode config and configure the `github-app` section:

```jsonc
{
  "mcp": {
    "github-app": {
      "type": "local",
      "command": [
        "docker", "run", "-i", "--rm",
        "--mount", "type=bind,source=/path/to/app.private-key.pem,destination=/app/key.pem,read-only",
        "-e", "GITHUB_APP_ID",
        "-e", "GITHUB_APP_INSTALLATION_ID",
        "-e", "GITHUB_APP_PRIVATE_KEY_PATH",
        "ghcr.io/github/github-mcp-server"
      ],
      "args": ["stdio", "--app-private-key-path", "/app/key.pem"],
      "enabled": true,
      "environment": {
        "GITHUB_APP_PRIVATE_KEY_PATH": "/app/key.pem"
      }
    }
  }
}
```

Then start OpenCode — the GitHub tools will be available in your agent sessions.

## 5. Using with Docker (standalone)

```bash
docker run -i --rm \
  --mount "type=bind,source=/path/to/app.private-key.pem,destination=/app/key.pem,read-only" \
  -e GITHUB_APP_ID=123456 \
  -e GITHUB_APP_INSTALLATION_ID=7891011 \
  -e GITHUB_APP_PRIVATE_KEY_PATH=/app/key.pem \
  ghcr.io/github/github-mcp-server stdio
```

## 6. Using with the Go binary (local build)

```bash
go build -o github-mcp-server ./cmd/github-mcp-server

./github-mcp-server stdio \
  --app-id 123456 \
  --app-installation-id 7891011 \
  --app-private-key-path /path/to/app.private-key.pem
```

## 7. GitHub Enterprise (GHE / ghe.com)

Add `--gh-host` or set `GITHUB_HOST`:

```bash
export GITHUB_HOST="https://your-enterprise.ghe.com"

docker run -i --rm \
  -e GITHUB_HOST \
  -e GITHUB_APP_ID \
  -e GITHUB_APP_INSTALLATION_ID \
  -e GITHUB_APP_PRIVATE_KEY_PATH \
  ghcr.io/github/github-mcp-server stdio
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `401 Unauthorized` | Verify App ID, Installation ID, and private key match |
| `404 Installation not found` | Install the app on the target org/repo; verify Installation ID |
| Permission denied on specific repo | Install the app on that repo (or the parent org) |
| Private key rejected | Ensure you downloaded the PEM from GitHub App settings; PKCS#1 and PKCS#8 are both supported |
| Token expires after ~1 hour | The server auto-refreshes; if it doesn't, check your system clock |

## Security Notes

- **Never commit** the private key PEM to version control
- Keep the PEM file permissions restricted: `chmod 600 app.private-key.pem`
- Install the GitHub App only on the repositories it needs access to
- Use the `--toolsets` flag to limit which GitHub API capabilities are exposed
- Consider using `--read-only` if the agent only needs read access

## FAQ

**Q: Can I use this with multiple repositories?**
A: Yes — install the app on each repo, or install it on the organization. The Installation ID is per-installation (org-level or repo-level).

**Q: What if I need access to a private repo the app isn't installed on?**
A: Set `GITHUB_PERSONAL_ACCESS_TOKEN` as a fallback — it takes precedence over OAuth but is overridden by GitHub App auth. Actually, the App token will only work for repos the app is installed on. For cross-repo access, consider installing on the org.

**Q: Can I use my existing GitHub App that I already have with all scopes?**
A: Absolutely — just grab its App ID, Installation ID, and private key from settings. The MCP server will work with any GitHub App that has the `public_key` permission.
