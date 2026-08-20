# Memory Index

## Platform Decisions
- [Windows Agent](project_windows_agent.md) — Swift macOS app stays; Windows agent = Electron (separate codebase)

## Project Context
- [Project Overview](PROJECT_OVERVIEW.md) — what TeamMonitor is, stack, repo URL, conventions, roles
- [Database Schema](DATABASE_SCHEMA.md) — all tables, columns, relationships; update when schema changes
- [API Routes](API_ROUTES.md) — all backend endpoints, auth requirements, request/response shapes
- [Admin Panel Pages](ADMIN_PANEL_PAGES.md) — all React routes, who can access them, Jira panel details
- [macOS Agent](MACOS_AGENT.md) — Swift services/views structure, APIService patterns, Jira integration

## Deployment
- [Deployment & Build Process](DEPLOYMENT.md) — cPanel deploy, MUST rebuild frontend, 503 causes/fixes
- [macOS Agent Releases](MACOS_RELEASES.md) — push a git tag `v*` → GitHub Actions builds + creates GitHub Release automatically

## Testing
- [Testing Checklist](feedback_testing_checklist.md) — MUST verify relevant sections pass before every push; full checklist at /Users/coda/Desktop/worklog/TeamMonitor/TESTING_CHECKLIST.md

## Behaviour Rules
- **When asked a question or to investigate something — explain what is happening and wait for the user to decide what to do. Do NOT start fixing or implementing anything unless explicitly told to.**

## Feedback (rules to follow)
- [No local preview/testing](feedback_no_local_preview.md) — Don't start dev server or use preview_* tools; push to git, user checks on cPanel
- [Rebuild admin panel before committing](feedback_build_before_commit.md) — Always npm build + copy to server/public/ when editing admin-panel/src/**
- [Commit all required files](feedback_commit_all_files.md) — Never leave require()d files untracked; caused 503 outage on 2026-04-01
- [Work on main branch only](feedback_work_on_main.md) — Always commit and push directly on main from /Users/coda/Desktop/worklog/TeamMonitor
- [Don't auto-commit/push](feedback_no_auto_commit.md) — Never commit or push until user explicitly says to
- [When to build admin panel](feedback_no_build.md) — Default: commit source only. Build when user says yes/deploy. cPanel needs server/public/ rebuilt to reflect UI changes.
- [Check GUIDELINES.md before implementing anything new](feedback_check_guidelines_first.md) — Always check /Users/coda/Desktop/worklog/TeamMonitor/GUIDELINES.md for existing formatters, API calls, calculations, and patterns before creating new ones. Update it when new shared utilities are added.
