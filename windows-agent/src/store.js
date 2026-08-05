const Store = require('electron-store');

const store = new Store({
  name: 'teammonitor',
  encryptionKey: 'tm-local-v1',
});

module.exports = {
  get: (key, def) => store.get(key, def),
  set: (key, val) => store.set(key, val),
  delete: (key) => store.delete(key),

  // Auth
  getToken:    ()    => store.get('auth_token', null),
  setToken:    (t)   => store.set('auth_token', t),
  clearToken:  ()    => store.delete('auth_token'),
  getEmployee: ()    => store.get('employee', null),
  setEmployee: (emp) => store.set('employee', emp),

  // Persisted session (survives restart within the same day)
  getSession:    ()  => store.get('active_session', null),
  setSession:    (s) => store.set('active_session', s),
  clearSession:  ()  => store.delete('active_session'),

  // Today minutes accumulator
  getTodayMinutes: ()    => store.get('today_minutes', 0),
  setTodayMinutes: (m)   => store.set('today_minutes', m),
  getTodayDate:    ()    => store.get('today_date', ''),
  setTodayDate:    (d)   => store.set('today_date', d),
};
