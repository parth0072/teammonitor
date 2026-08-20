---
name: TeamMonitor — macOS Agent Release Process
description: How to release a new version of the macOS agent via GitHub tag — triggers CI build and GitHub Release automatically
type: reference
---

# macOS Agent Release Process

## How It Works

Pushing a git tag matching `v*` to GitHub **automatically**:
1. Triggers the GitHub Actions workflow (`.github/workflows/build-macos-agent.yml`)
2. Builds `TeamMonitorAgent.app` on `macos-latest` (ad-hoc signed, no Apple Developer account needed)
3. Strips the quarantine attribute and zips to `TeamMonitorAgent.zip`
4. Creates a GitHub Release at `github.com/parth0072/teammonitor/releases` with the zip attached
5. Auto-generates release notes from commit messages since the last tag

## To Release a New Version

```bash
# 1. Make sure main is up to date and all changes are committed
git checkout main && git pull origin main

# 2. Tag the release (use semver)
git tag v1.2.0

# 3. Push the tag — this triggers the workflow
git push origin v1.2.0
```

That's it. The build takes ~5–10 minutes. The `.zip` appears on the GitHub Releases page automatically.

## Version Stamping

The workflow patches `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` directly in `project.pbxproj` before building:
```
sed -i '' "s/MARKETING_VERSION = [^;]*/MARKETING_VERSION = $VERSION/" ...
```
The version shown in the macOS app comes from the git tag (e.g. tag `v1.2.0` → app version `1.2.0`).

## Workflow File
`.github/workflows/build-macos-agent.yml`
- Triggered by: `push` to tags matching `v*`, or manual `workflow_dispatch` from GitHub UI
- Permissions: `contents: write` (needed to create the Release)
- Uses: `softprops/action-gh-release@v2` for the Release creation
- Artifact retained 30 days even on non-tag builds (workflow_dispatch)

## Local Build Script (with Apple signing)
`macos-agent/scripts/build_and_export.sh`
- For local/manual builds with proper Apple Developer signing
- Produces a `.dmg` (not used in CI)
- Requires valid Apple Developer signing identity in Keychain
- Run from `macos-agent/` directory: `./scripts/build_and_export.sh`

## Auto-Update in the App
`UpdateService.swift` checks GitHub Releases API for new versions.
When a newer tag is found, it prompts the user to update.
The install script (`macos-agent/install.sh`) handles downloading and replacing the app.

## Important Notes
- **Never manually edit** `MARKETING_VERSION` in `project.pbxproj` — the CI workflow overwrites it from the tag anyway
- The build is **ad-hoc signed** (`CODE_SIGN_IDENTITY="-"`) — employees may need to right-click → Open the first time on some macOS versions
- The zip contains `TeamMonitorAgent.app` directly (no DMG in CI releases)
- GitHub Releases URL: `https://github.com/parth0072/teammonitor/releases`
