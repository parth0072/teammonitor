const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tm', {
  // State
  getState:  ()      => ipcRenderer.invoke('get-state'),
  onState:   (cb)    => ipcRenderer.on('state', (_, s) => cb(s)),

  // Auth
  login:  (email, pw) => ipcRenderer.invoke('login', email, pw),
  logout: ()          => ipcRenderer.invoke('logout'),

  // Tracking
  punchIn:        (taskId, jiraKey, taskName, taskColor, jiraTitle) => ipcRenderer.invoke('punch-in', taskId, jiraKey, taskName, taskColor, jiraTitle),
  punchOut:       ()       => ipcRenderer.invoke('punch-out'),
  startBreak:     ()       => ipcRenderer.invoke('start-break'),
  resumeFromBreak:()       => ipcRenderer.invoke('resume-break'),

  // Tasks
  getTasks: () => ipcRenderer.invoke('get-tasks'),

  // Notifications
  onNotify: (cb) => ipcRenderer.on('notify', (_, msg) => cb(msg)),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
