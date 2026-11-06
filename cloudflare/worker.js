// GitHub App Webhook → Cloudflare Worker
//
// Receives webhook events from your GitHub App and dispatches the
// PR monitor workflow for real-time, event-driven monitoring.
//
// Deploy: wrangler deploy
// Then set your GitHub App webhook to: https://your-worker.workers.dev/webhook

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    if (!url.pathname.endsWith('/webhook')) {
      return new Response('Not found', { status: 404 });
    }

    // ── Verify signature ──────────────────────────────────────────
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      return new Response('Missing signature', { status: 401 });
    }

    const payload = await request.text();
    const valid = await verifySignature(payload, signature, env.WEBHOOK_SECRET);
    if (!valid) {
      return new Response('Invalid signature', { status: 403 });
    }

    const event = JSON.parse(payload);
    const action = request.headers.get('X-GitHub-Event') || event.action;

    // GitHub pings the webhook URL on setup — just acknowledge
    if (action === 'ping') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // ── Events we care about ──────────────────────────────────────
    // Only dispatch for events that should trigger a PR review
    const shouldDispatch = (
      (action === 'pull_request' && ['opened', 'synchronize', 'ready_for_review', 'reopened'].includes(event.action)) ||
      (action === 'pull_request_review' && ['APPROVED', 'CHANGES_REQUESTED'].includes(event.review?.state)) ||
      (action === 'check_run' && ['success', 'failure'].includes(event.check_run?.conclusion))
    );

    if (!shouldDispatch) {
      return new Response('OK', { status: 200 }); // Silently skip irrelevant events
    }

    // ── Dispatch PR monitor workflow ──────────────────────────────
    const repo = event.repository;
    const prNumber = event.pull_request?.number;

    try {
      await fetch(
        `https://api.github.com/repos/${repo.full_name}/actions/workflows/pr-monitor-dispatch.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: repo.default_branch,
            inputs: { pr_number: String(prNumber) },
          }),
        }
      );
    } catch (e) {
      console.error('Dispatch failed:', e.message);
    }

    return new Response('OK', { status: 200 });
  },
};

async function verifySignature(payload, signature, secret) {
  const hash = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(secret + payload)
  );
  const hex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `sha256=${hex}` === signature;
}
