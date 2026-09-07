import { config } from '../config.js';
import { logger } from '../logger.js';

// -----------------------------------------------------------------------
// A single, small HTTP client wrapping every call to the SAP C4C API.
//
// Authentication: HTTP Basic Auth (username + password), per the fixed
// integration requirement. There is no token acquisition, no token cache,
// and no OAuth flow anywhere in this codebase - the Basic Auth header is
// computed fresh from CRM_BASIC_USERNAME / CRM_BASIC_PASSWORD on every
// request. Credentials never leave the backend process.
//
// Responsibilities:
//  - attach the Basic Auth header
//  - surface the real SAP error body on failure, never a generic message
//  - expose the ETag from GET responses so callers can do a correct,
//    fresh If-Match PATCH (see registeredProductService / opportunityService)
//  - structured debug logging (method, url, status; never credentials)
//
// This client intentionally has NO caching of any kind. Every call is a
// live HTTP request. Caching (ETags, entity lookups) is exactly the class
// of bug the rebuild spec calls out, so it is not implemented here.
// -----------------------------------------------------------------------

class CrmApiError extends Error {
  constructor(message, { status, url, method, body } = {}) {
    super(message);
    this.name = 'CrmApiError';
    this.status = status;
    this.url = url;
    this.method = method;
    this.body = body;
  }
}

function buildUrl(path) {
  if (path.startsWith('http')) return path;
  return `${config.sap.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

function buildBasicAuthHeader() {
  if (!config.sap.basicUsername || !config.sap.basicPassword) {
    throw new Error('CRM authentication is not configured (CRM_BASIC_USERNAME / CRM_BASIC_PASSWORD missing).');
  }
  const encoded = Buffer.from(`${config.sap.basicUsername}:${config.sap.basicPassword}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

function extractErrorMessage(status, bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    // OData/SAP error shapes vary; try the common ones without inventing
    // fields that don't exist - fall back to the raw body if unrecognized.
    const msg =
      parsed?.error?.message?.value ||
      parsed?.error?.message ||
      parsed?.message ||
      null;
    if (msg) return msg;
  } catch {
    // not JSON - fall through
  }
  return bodyText && bodyText.length < 500 ? bodyText : `SAP request failed with status ${status}`;
}

/**
 * Normalizes an ETag exactly as returned by SAP: strips one pair of
 * surrounding double-quote characters, if present. Nothing else about the
 * value is touched (no hardcoding, no reformatting of the timestamp/opaque
 * value itself) - this only removes the quoting that caused SAP to treat
 * our own quoted ETag as not matching the server's unquoted value on
 * PATCH (HTTP 412 "Update request ... is outdated").
 */
function normalizeEtag(rawEtag) {
  if (typeof rawEtag !== 'string') return rawEtag;
  if (rawEtag.startsWith('"') && rawEtag.endsWith('"') && rawEtag.length >= 2) {
    return rawEtag.slice(1, -1);
  }
  return rawEtag;
}

async function rawRequest(method, path, { headers = {}, body } = {}) {
  const url = buildUrl(path);

  const finalHeaders = {
    Authorization: buildBasicAuthHeader(),
    Accept: 'application/json',
    ...headers,
  };
  if (body !== undefined && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  logger.debug('crmClient', `${method} ${url}`, {
    headers: { ...finalHeaders, Authorization: '[REDACTED]' },
    body,
  });

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const etag = normalizeEtag(res.headers.get('etag') || null);

  if (!res.ok) {
    const message = extractErrorMessage(res.status, text);
    logger.debug('crmClient', `${method} ${url} -> ${res.status}`, { errorBody: text });
    throw new CrmApiError(message, { status: res.status, url, method, body: text });
  }

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  logger.debug('crmClient', `${method} ${url} -> ${res.status}`, { etag });

  return { data, etag, status: res.status };
}

export const crmClient = {
  async get(path, opts) {
    return rawRequest('GET', path, opts);
  },
  async post(path, body, opts = {}) {
    return rawRequest('POST', path, { ...opts, body });
  },
  /**
   * PATCH with a mandatory If-Match ETag. This is intentionally required
   * (not optional) so no call site can accidentally PATCH without one -
   * see the global ETag rule in the specification.
   */
  async patch(path, body, etag, opts = {}) {
    if (!etag) {
      throw new Error(`Refusing to PATCH ${path} without an If-Match ETag.`);
    }
    return rawRequest('PATCH', path, {
      ...opts,
      body,
      headers: {
        'If-Match': etag,
        'Content-Type': 'application/merge-patch+json',
        ...(opts.headers || {}),
      },
    });
  },
};

export { CrmApiError };
