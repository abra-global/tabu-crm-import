import { config } from './config.js';

const REDACT_KEYS = new Set(['authorization', 'password', 'crm_basic_password', 'apikey', 'api_key']);

function redact(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return obj;
}

function timestamp() {
  return new Date().toISOString();
}

export const logger = {
  info(tag, message, meta) {
    console.log(`[${timestamp()}] [INFO]${tag ? ` [${tag}]` : ''} ${message}`, meta ? redact(meta) : '');
  },
  warn(tag, message, meta) {
    console.warn(`[${timestamp()}] [WARN]${tag ? ` [${tag}]` : ''} ${message}`, meta ? redact(meta) : '');
  },
  error(tag, message, meta) {
    console.error(`[${timestamp()}] [ERROR]${tag ? ` [${tag}]` : ''} ${message}`, meta ? redact(meta) : '');
  },
  // Verbose CRM debug tracing - only emits when CRM_DEBUG=true.
  debug(tag, message, meta) {
    if (!config.crmDebug) return;
    console.log(`[${timestamp()}] [DEBUG]${tag ? ` [${tag}]` : ''} ${message}`, meta ? redact(meta) : '');
  },
};
