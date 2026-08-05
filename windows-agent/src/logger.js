const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let logPath = null;

function getLogPath() {
  if (!logPath) {
    logPath = path.join(app.getPath('userData'), 'teammonitor.log');
  }
  return logPath;
}

function log(tag, msg) {
  const line = `[${new Date().toISOString()}] [${tag}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(getLogPath(), line + '\n');
  } catch (_) {}
}

module.exports = { log };
