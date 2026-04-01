// utils/encrypt.js — AES-256-GCM encrypt/decrypt for sensitive fields (Jira tokens)
// Uses the same SCREENSHOT_ENCRYPTION_KEY already in .env

const crypto = require('crypto');

const KEY = Buffer.from(process.env.SCREENSHOT_ENCRYPTION_KEY || '', 'hex');
const ALG = 'aes-256-gcm';

function encrypt(plaintext) {
  const iv         = crypto.randomBytes(12);
  const cipher     = crypto.createCipheriv(ALG, KEY, iv);
  const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag    = cipher.getAuthTag();
  // Store as iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(stored) {
  const [ivHex, tagHex, ctHex] = stored.split(':');
  const iv         = Buffer.from(ivHex, 'hex');
  const authTag    = Buffer.from(tagHex, 'hex');
  const ct         = Buffer.from(ctHex, 'hex');
  const decipher   = crypto.createDecipheriv(ALG, KEY, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ct) + decipher.final('utf8');
}

module.exports = { encrypt, decrypt };
