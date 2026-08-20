---
name: TeamMonitor — Database Schema
description: All tables, columns, and relationships. Keep this updated when schema changes.
type: reference
---

# Database Schema

Full schema file: `server/schema.sql`
Auto-migration: `server/index.js → runMigrations()`

---

## Tables

### `employees`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO_INCREMENT | |
| name | VARCHAR(100) | |
| email | VARCHAR(150) UNIQUE | login |
| password | VARCHAR(255) | bcrypt hash |
| department | VARCHAR(100) | optional |
| role | ENUM('admin','employee') | default 'employee' |
| is_active | TINYINT(1) | default 1 |
| screenshot_interval | INT | seconds, default 300 (5 min) |
| break_enabled | TINYINT(1) | default 0 |
| break_interval_minutes | INT | default 60 |
| idle_warning_minutes | INT | default 2 |
| idle_stop_minutes | INT | default 5 |
| screenshots_enabled | TINYINT(1) | default 1 |
| created_at | DATETIME | |

### `projects`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO_INCREMENT | |
| name | VARCHAR(200) | |
| description | TEXT | |
| color | VARCHAR(7) | hex color, default #3b82f6 |
| status | ENUM('active','archived') | soft delete via archived |
| created_by | INT FK→employees | |
| created_at | DATETIME | |

### `tasks`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO_INCREMENT | |
| project_id | INT FK→projects | CASCADE delete |
| name | VARCHAR(200) | Jira-imported tasks prefixed with [KEY-123] |
| description | TEXT | |
| status | ENUM('todo','in_progress','done') | |
| assigned_to | INT FK→employees | nullable |
| created_by | INT FK→employees | |
| jira_issue_key | VARCHAR(50) | e.g. "PROJ-42", NULL if native task |
| created_at | DATETIME | |

### `sessions`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO_INCREMENT | |
| employee_id | INT FK→employees | |
| task_id | INT FK→tasks | nullable |
| punch_in | DATETIME | |
| punch_out | DATETIME | nullable (active session) |
| total_minutes | INT | |
| status | ENUM('active','completed') | |
| date | DATE | |

### `activity_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO_INCREMENT | |
| employee_id | INT FK→employees | |
| session_id | INT FK→sessions | |
| app_name | VARCHAR(200) | |
| window_title | VARCHAR(500) | |
| start_time | DATETIME | |
| end_time | DATETIME | |
| duration_seconds | INT | |
| date | DATE | |

### `screenshots`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO_INCREMENT | |
| employee_id | INT FK→employees | |
| session_id | INT FK→sessions | nullable |
| captured_at | DATETIME | |
| file_path | VARCHAR(500) | URL or encrypted path |
| activity_level | INT | 0–100 |
| date | DATE | |

### `idle_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO_INCREMENT | |
| employee_id | INT FK→employees | |
| session_id | INT FK→sessions | |
| idle_start | DATETIME | |
| idle_end | DATETIME | |
| duration_seconds | INT | |
| date | DATE | |

### `jira_credentials`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO_INCREMENT | |
| employee_id | INT FK→employees UNIQUE | one row per employee |
| site_url | VARCHAR(255) | e.g. https://company.atlassian.net |
| email | VARCHAR(150) | Atlassian account email |
| api_token | TEXT | Jira API token (plaintext for now) |
| jira_account_id | VARCHAR(100) | accountId from Jira /myself |
| display_name | VARCHAR(150) | display name from Jira |
| connected_at | DATETIME | |

---

## How to Add a New Column/Table

1. Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` to `runMigrations()` in `server/index.js`
2. Add the column to `server/schema.sql` for fresh installs
3. The migration runs automatically on next server startup — no manual SQL needed
4. For new tables, use `CREATE TABLE IF NOT EXISTS` in migrations
