# GitHub Security Hardening

This repository is public, so GitHub settings must prevent untrusted users from
writing to protected branches or getting privileged workflow tokens.

## Branch protection for `main`

Enable a branch protection rule or ruleset for `main` with:

- Require a pull request before merging.
- Require at least 1 approval.
- Require review from Code Owners.
- Dismiss stale pull request approvals when new commits are pushed.
- Require status checks to pass before merging.
- Require branches to be up to date before merging.
- Required status check: `Build FlyWith (Xcode)`.
- Require conversation resolution before merging.
- Block force pushes.
- Block deletions.
- Do not allow bypassing the above settings unless you explicitly need an
  administrator emergency path.

Personal-account repositories do not support user/team push restrictions through
GitHub branch protection. The protection above still blocks random strangers
because non-collaborators cannot push to the repository, and protected `main`
requires PR review and passing checks.

For a single-maintainer personal repository, the strictest setting can make
normal owner-authored PRs hard to merge because GitHub does not count
self-approval. If that becomes a problem, add a second trusted maintainer or
explicitly allow an administrator bypass after accepting that tradeoff.

## Actions settings

Use these repository settings under **Settings -> Actions -> General**:

- Actions permissions: selected actions only.
- Allowed actions: GitHub-owned actions and verified Marketplace actions.
- Require actions to be pinned to a full-length commit SHA.
- Workflow permissions: read repository contents only.
- Disable "Allow GitHub Actions to create and approve pull requests".
- Fork pull request workflows: require approval for all outside collaborators.

## Secrets

- Do not put production secrets in workflows that run on `pull_request`.
- Prefer GitHub Environments with required reviewers for deployments.
- Keep app API keys out of source code and out of sample Xcode schemes.
- Keep secret scanning, push protection, Dependabot security updates, and private
  vulnerability reporting enabled.
