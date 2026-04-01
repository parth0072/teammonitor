-- TeamMonitor Database Schema
-- Run this once in cPanel → phpMyAdmin → SQL tab

CREATE TABLE IF NOT EXISTS employees (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(100) NOT NULL,
  email               VARCHAR(150) NOT NULL UNIQUE,
  password            VARCHAR(255) NOT NULL,
  department          VARCHAR(100) DEFAULT '',
  role                ENUM('admin','employee') DEFAULT 'employee',
  is_active           TINYINT(1) DEFAULT 1,
  screenshot_interval    INT DEFAULT 300,         -- seconds between screenshots (default 5 min)
  break_enabled          TINYINT(1) DEFAULT 0,     -- show break reminder in macOS agent
  break_interval_minutes INT DEFAULT 60,           -- minutes between break reminders
  idle_warning_minutes   INT DEFAULT 2,            -- minutes of inactivity before warning
  idle_stop_minutes      INT DEFAULT 5,            -- minutes of inactivity before auto-stop
  screenshots_enabled    TINYINT(1) DEFAULT 1,     -- capture screenshots (admin can disable)
  created_at             DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- If already created, run these in phpMyAdmin:
-- ALTER TABLE employees ADD COLUMN screenshot_interval INT DEFAULT 300;
-- ALTER TABLE employees ADD COLUMN break_enabled TINYINT(1) DEFAULT 0;
-- ALTER TABLE employees ADD COLUMN break_interval_minutes INT DEFAULT 60;
-- ALTER TABLE employees ADD COLUMN idle_warning_minutes INT DEFAULT 2;
-- ALTER TABLE employees ADD COLUMN idle_stop_minutes INT DEFAULT 5;
-- ALTER TABLE employees ADD COLUMN screenshots_enabled TINYINT(1) DEFAULT 1;

CREATE TABLE IF NOT EXISTS projects (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  description  TEXT DEFAULT '',
  color        VARCHAR(7) DEFAULT '#3b82f6',
  status       ENUM('active','archived') DEFAULT 'active',
  created_by   INT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  project_id   INT NOT NULL,
  name         VARCHAR(200) NOT NULL,
  description  TEXT DEFAULT '',
  status       ENUM('todo','in_progress','done') DEFAULT 'todo',
  assigned_to  INT DEFAULT NULL,
  created_by   INT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id)  REFERENCES projects(id)  ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)  REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  employee_id    INT NOT NULL,
  task_id        INT DEFAULT NULL,
  punch_in       DATETIME NOT NULL,
  punch_out      DATETIME DEFAULT NULL,
  total_minutes  INT DEFAULT 0,
  status         ENUM('active','completed') DEFAULT 'active',
  date           DATE NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id)     REFERENCES tasks(id)     ON DELETE SET NULL
);
-- If sessions table already exists: run these two lines in phpMyAdmin:
-- ALTER TABLE sessions ADD COLUMN task_id INT DEFAULT NULL AFTER employee_id;
-- ALTER TABLE sessions ADD FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS activity_logs (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  employee_id      INT NOT NULL,
  session_id       INT NOT NULL,
  app_name         VARCHAR(200) NOT NULL,
  window_title     VARCHAR(500) DEFAULT '',
  start_time       DATETIME NOT NULL,
  end_time         DATETIME NOT NULL,
  duration_seconds INT DEFAULT 0,
  date             DATE NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id)  REFERENCES sessions(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS screenshots (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  employee_id    INT NOT NULL,
  session_id     INT DEFAULT NULL,          -- nullable: screenshot can exist without a session
  captured_at    DATETIME NOT NULL,
  file_path      VARCHAR(500) NOT NULL,
  activity_level INT DEFAULT 100,
  date           DATE NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id)  REFERENCES sessions(id)  ON DELETE SET NULL
);
-- If already created, run: ALTER TABLE screenshots MODIFY COLUMN session_id INT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS idle_logs (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  employee_id      INT NOT NULL,
  session_id       INT NOT NULL,
  idle_start       DATETIME NOT NULL,
  idle_end         DATETIME NOT NULL,
  duration_seconds INT DEFAULT 0,
  date             DATE NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id)  REFERENCES sessions(id)  ON DELETE CASCADE
);
