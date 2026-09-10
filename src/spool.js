const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Un répertoire par instance. Les fichiers restent présents jusqu'à l'acquittement HTTP.
class Spool {
  constructor(directory, maxBytes = 256 * 1024 * 1024) {
    this.directory = path.resolve(directory);
    this.maxBytes = maxBytes;
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.lock = path.join(this.directory, 'owner.lock');
    try {
      const fd = fs.openSync(this.lock, 'wx', 0o600);
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(fs.readFileSync(this.lock, 'utf8'));
      if (!Number.isInteger(pid) || pid <= 0) throw new Error('Verrou du journal invalide');
      try { process.kill(pid, 0); throw new Error('Journal déjà utilisé'); }
      catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
      fs.unlinkSync(this.lock);
      const fd = fs.openSync(this.lock, 'wx', 0o600);
      fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd);
    }
    this.items = new Map();
    this.bytes = 0;
    for (const file of fs.readdirSync(this.directory)) {
      if (!file.endsWith('.json')) continue;
      const body = fs.readFileSync(path.join(this.directory, file));
      const item = JSON.parse(body.toString());
      this.items.set(file, item); this.bytes += body.length;
    }
  }

  syncDirectory() {
    if (process.platform === 'win32') return;
    const fd = fs.openSync(this.directory, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }

  put(topic, payload, receivedAt = new Date().toISOString()) {
    const key = crypto.createHash('sha256').update(topic).update('\0').update(payload).digest('hex') + '.json';
    if (this.items.has(key)) return key;
    const item = { key, topic, payload: payload.toString('base64'), receivedAt, attempts: 0, nextAt: 0 };
    const body = JSON.stringify(item);
    if (this.bytes + Buffer.byteLength(body) > this.maxBytes) throw new Error('Journal plein : acquisition suspendue');
    const target = path.join(this.directory, key);
    const temporary = target + '.tmp';
    const fd = fs.openSync(temporary, 'w', 0o600);
    try { fs.writeFileSync(fd, body); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, target); this.syncDirectory();
    this.items.set(key, item); this.bytes += Buffer.byteLength(body);
    return key;
  }

  acknowledge(key) {
    const target = path.join(this.directory, key);
    const size = fs.statSync(target).size;
    fs.unlinkSync(target); this.syncDirectory();
    this.items.delete(key); this.bytes -= size;
  }

  pending(now = Date.now(), limit = 4) {
    return [...this.items.values()].filter(item => !item.inFlight && item.nextAt <= now).slice(0, limit);
  }

  failed(item, now = Date.now()) {
    item.attempts++;
    item.inFlight = false;
    item.nextAt = now + Math.min(300000, 1000 * 2 ** Math.min(item.attempts, 8)) + Math.floor(Math.random() * 500);
  }

  stats() {
    let oldest = Date.now();
    for (const item of this.items.values()) oldest = Math.min(oldest, Date.parse(item.receivedAt));
    return { pending: this.items.size, bytes: this.bytes, oldest_age_seconds: Math.floor((Date.now() - oldest) / 1000) };
  }

  close() { fs.unlinkSync(this.lock); }
}

module.exports = { Spool };
