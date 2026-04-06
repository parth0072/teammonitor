-- ============================================================
--  TeamMonitor — Database Reset Script
--  WARNING: This permanently deletes ALL data.
--  Table structure is preserved. Run on a fresh start.
--
--  How to run:
--    phpMyAdmin → select your DB → SQL tab → paste ALL of this → Go
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE activity_logs;
TRUNCATE TABLE idle_logs;
TRUNCATE TABLE screenshots;
TRUNCATE TABLE sessions;
TRUNCATE TABLE productivity_rules;
TRUNCATE TABLE bug_reports;
TRUNCATE TABLE tasks;
TRUNCATE TABLE projects;
TRUNCATE TABLE jira_credentials;
TRUNCATE TABLE employees;

-- Leave tables (may or may not exist — safe to ignore errors)
DROP TABLE IF EXISTS leave_requests;
DROP TABLE IF EXISTS leave_balances;
DROP TABLE IF EXISTS leave_types;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  OPTIONAL: Full drop + recreate (uncomment below if you want
--  a completely clean slate including table structure)
-- ============================================================
-- DROP TABLE IF EXISTS activity_logs;
-- DROP TABLE IF EXISTS idle_logs;
-- DROP TABLE IF EXISTS screenshots;
-- DROP TABLE IF EXISTS sessions;
-- DROP TABLE IF EXISTS productivity_rules;
-- DROP TABLE IF EXISTS bug_reports;
-- DROP TABLE IF EXISTS tasks;
-- DROP TABLE IF EXISTS projects;
-- DROP TABLE IF EXISTS jira_credentials;
-- DROP TABLE IF EXISTS employees;
-- After dropping, restart the Node server — runMigrations() will recreate all tables automatically.
