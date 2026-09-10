const fs = require('node:fs');
const path = require('node:path');

function writeHealth(directory, snapshot) {
  const temporary = path.join(directory, '.health.tmp');
  fs.writeFileSync(temporary, JSON.stringify({ ...snapshot, pid: process.pid, checked_at: new Date().toISOString() }), { mode: 0o600 });
  fs.renameSync(temporary, path.join(directory, '.health'));
}

function assessHealth(snapshot, now = Date.now()) {
  const age = now - Date.parse(snapshot.checked_at);
  const checks = {
    heartbeat: Number.isFinite(age) && age >= -5000 && age <= 60000,
    mqtt: snapshot.connected === true && snapshot.stopping !== true,
    subscriptions: snapshot.subscribed === true,
    backlog_age: Number.isFinite(snapshot.oldest_age_seconds) && snapshot.oldest_age_seconds <= 180,
    spool_capacity: Number.isFinite(snapshot.bytes) && Number.isFinite(snapshot.max_bytes) && snapshot.max_bytes > 0 && snapshot.bytes < snapshot.max_bytes * 0.8,
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

module.exports = { writeHealth, assessHealth };
