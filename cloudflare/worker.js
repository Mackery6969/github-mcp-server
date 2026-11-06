// GitHub App Webhook → Cloudflare Worker
//
// Receives GitHub App webhook events (PR opened, reviewed, CI updated, etc.)
// and fans them out to your PR monitoring system.
//
// Deploy to Cloudflare Workers:
//   wrangler deploy
//
// Then configure your GitHub App webhook:
//   Payload URL: https://your-worker-domain.workers.dev/webhook
//   Secret: same value as WEBHOOK_SECRET in wrangler.toml

export default {
  async fetch(request, env, ctx) {
    // Only accept POST at /webhook
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    if (!url.pathname.endsWith('/webhook')) {
      return new Response('Not found', { status: 404 });
    }

    // ── Verify webhook signature ──────────────────────────────────
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      return new Response('Missing signature', { status: 401 });
    }

    const payload = await request.text();
    const valid = await verifySignature(payload, signature, env.WEBHOOK_SECRET);
    if (!valid) {
      return new Response('Invalid signature', { status: 403 });
    }

    // ── Parse event ──────────────────────────────────────────────
    const event = JSON.parse(payload);
    const action = request.headers.get('x-github-event') || 'ping';

    // Handle ping from GitHub
    if (action === 'ping') {
      return new Response(JSON.stringify({ message: 'Webhook configured successfully' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Log the event (replace with your dispatch logic) ─────────
    console.log(`[${action}]`, JSON.stringify(event, null, 2));

    // ── Fan-out: trigger PR monitor workflow ──────────────────────
    if (action === 'pull_request') {
      const prAction = event.action;
      const prNumber = event.pull_request?.number;
      const repo = event.repository;

      if (prNumber && ['opened', 'synchronize', 'ready_for_review', 'reopened'].includes(prAction)) {
        // Dispatch the PR monitor workflow for this specific PR
        try {
          const resp = await fetch(
            `https://api.github.com/repos/${repo.full_name}/actions/workflows/pr-monitor.yml/dispatches`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ref: repo.default_branch,
                inputs: {
                  pr_number: String(prNumber),
                  repo_owner: repo.owner?.login || repo.owner?.name,
                  repo_name: repo.name,
                },
              }),
            }
          );

          if (!resp.ok) {
            console.error('Failed to dispatch PR monitor:', await resp.text());
          }
        } catch (e) {
          console.error('Error dispatching PR monitor:', e.message);
        }
      }
    }

    // Handle PR review events
    if (action === 'pull_request_review') {
      const prNumber = event.pull_request?.number;
      const repo = event.repository;
      const reviewState = event.review?.state;

      if (prNumber && ['CHANGES_REQUESTED', 'APPROVED'].includes(reviewState)) {
        try {
          await fetch(
            `https://api.github.com/repos/${repo.full_name}/actions/workflows/pr-monitor.yml/dispatches`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ref: repo.default_branch,
                inputs: {
                  pr_number: String(prNumber),
                  repo_owner: repo.owner?.login || repo.owner?.name,
                  repo_name: repo.name,
                },
              }),
            }
          );
        } catch (e) {
          console.error('Error dispatching PR monitor after review:', e.message);
        }
      }
    }

    // Handle check run events (CI status changes)
    if (action === 'check_run') {
      const checkConclusion = event.check_run?.conclusion;
      const repo = event.repository;

      if (['failure', 'success'].includes(checkConclusion)) {
        // Could trigger PR monitor or notify via email/slack
        console.log(`CI check ${checkConclusion}: ${event.check_run.name}`);
      }
    }

    return new Response('OK', { status: 200 });
  },
};

/**
 * Verify HMAC signature of webhook payload.
 */
async function verifySignature(payload, signature, secret) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret + payload)
  );
  const hashHex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256=${hashHex}` === signature;
}
