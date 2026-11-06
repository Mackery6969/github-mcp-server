---
description: |
  Monitors open pull requests and performs periodic reviews: checks CI status,
  reviews pending reviews, and comments on PRs that need attention. Runs on a
  schedule and can be triggered manually. The check job inspects PR state in
  code so the agent never sees raw PR content.

on:
  schedule:
    - cron: "0 */4 * * *"  # Every 4 hours
  workflow_dispatch:
    inputs:
      pr_number:
        description: "Specific PR to review (omit for all)"
        required: false
        type: number
      repo_owner:
        description: "Repository owner (defaults to current repo)"
        required: false
        type: string
      repo_name:
        description: "Repository name (defaults to current repo)"
        required: false
        type: string

run-name: "PR Monitor${{ github.event.inputs.pr_number && format(' #{}', github.event.inputs.pr_number) || '' }}"

permissions:
  contents: read
  pull-requests: read
  checks: read
  copilot-requests: write

jobs:
  # Reads PR state in code; agent only acts on the summary.
  check:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
      checks: read
    outputs:
      summary: ${{ steps.check.outputs.summary }}
      pr_count: ${{ steps.check.outputs.pr_count }}
    steps:
      - name: Collect PR status data
        id: check
        uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0
        env:
          PR_NUMBER: ${{ github.event.inputs.pr_number || '' }}
          REPO_OWNER: ${{ github.event.inputs.repo_owner || github.repository_owner }}
          REPO_NAME: ${{ github.event.inputs.repo_name || github.event.repository.name }}
        with:
          script: |
            const owner = process.env.REPO_OWNER;
            const repo = process.env.REPO_NAME;
            const prNumber = Number(process.env.PR_NUMBER || 0);

            let prs = [];
            if (prNumber > 0) {
              const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: prNumber });
              prs = [pr];
            } else {
              const pages = await github.paginate.iterator(github.rest.pulls.list, {
                owner, repo, state: 'open', sort: 'updated', direction: 'desc', per_page: 100
              });
              for await (const page of pages) {
                prs = prs.concat(page.data);
              }
            }

            const results = [];
            for (const pr of prs) {
              // Get CI status for the PR's head commit
              let ciStatus = 'unknown';
              let ciDetails = null;
              try {
                const { data: checks } = await github.rest.checks.listForRef({
                  owner, repo, ref: pr.head.sha, per_page: 20
                });
                const statuses = checks.check_runs?.map(c => c.conclusion) || [];
                const hasFailure = statuses.includes('failure');
                const hasNeutral = statuses.includes('neutral');
                const allPassed = statuses.length > 0 && !hasFailure && !hasNeutral && statuses.every(s => s === 'success');

                if (statuses.length === 0) ciStatus = 'no_checks';
                else if (hasFailure) ciStatus = 'failing';
                else if (hasNeutral) ciStatus = 'in_progress';
                else if (allPassed) ciStatus = 'passing';
                else ciStatus = 'pending';

                ciDetails = statuses;
              } catch {
                ciStatus = 'unavailable';
              }

              // Get pending review state
              const { data: reviews } = await github.rest.pulls.listReviews({
                owner, repo, pull_number: pr.number
              });
              const pendingReviews = reviews.filter(r => r.state === 'PENDING');
              const approvedReviews = reviews.filter(r => r.state === 'APPROVED');
              const changesRequested = reviews.filter(r => r.state === 'CHANGES_REQUESTED');

              // Determine if PR needs attention
              let needsAttention = false;
              let reasons = [];

              if (ciStatus === 'failing') {
                needsAttention = true;
                reasons.push('CI failing');
              }
              if (changesRequested.length > 0 && !approvedReviews.length) {
                needsAttention = true;
                reasons.push(`${changesRequested.length} change request(s)`);
              }
              if (pr.review_comments > 5) {
                needsAttention = true;
                reasons.push(`${pr.review_comments} review comments`);
              }
              if (pr.comments > 10) {
                needsAttention = true;
                reasons.push(`${pr.comments} comments`);
              }

              // Check if PR is stale (no activity in 7 days)
              const lastActivity = new Date(pr.updated_at);
              const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
              if (lastActivity < sevenDaysAgo) {
                needsAttention = true;
                reasons.push('stale (>7 days no activity)');
              }

              results.push({
                number: pr.number,
                title: pr.title,
                author: pr.user.login,
                state: pr.state,
                ci_status: ciStatus,
                ci_details: ciDetails,
                pending_reviews: pendingReviews.length,
                approved: approvedReviews.length > 0,
                changes_requested: changesRequested.length,
                review_comments: pr.review_comments,
                comments: pr.comments,
                created_at: pr.created_at,
                updated_at: pr.updated_at,
                needs_attention: needsAttention,
                reasons: reasons
              });
            }

            const output = JSON.stringify(results);
            core.setOutput('summary', output);
            core.setOutput('pr_count', results.length);

  # Agent reviews PRs that need attention
  review:
    needs: check
    if: needs.check.outputs.pr_count > 0
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      checks: read
    steps:
      - name: Review PRs
        env:
          SUMMARY: ${{ needs.check.outputs.summary }}
