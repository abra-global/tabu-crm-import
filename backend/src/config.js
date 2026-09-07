import 'dotenv/config';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  return value;
}

export const config = {
  port: Number(process.env.PORT || 8787),
  crmDebug: String(process.env.CRM_DEBUG || 'false').toLowerCase() === 'true',

  sap: {
    baseUrl: required('CRM_BASE_URL', 'https://my1002519.de1.crm.cloud.sap').replace(/\/+$/, ''),
    authMode: required('CRM_AUTH_MODE', 'basic_auth'),
    basicUsername: required('CRM_BASIC_USERNAME', ''),
    basicPassword: required('CRM_BASIC_PASSWORD', ''),
    governmentAccountId: required('SAP_GOVERNMENT_ACCOUNT_ID', '01a076e8-3e32-7003-a320-fc6b22fcd359'),
    referenceProductDisplayId: required('SAP_REFERENCE_PRODUCT_DISPLAY_ID', '999'),
  },

  gemini: {
    apiKey: required('GEMINI_API_KEY', ''),
    model: required('GEMINI_MODEL', 'gemini-3.1-flash-lite'),
  },
};

// Fixed, spec-mandated constant. Never derive this dynamically.
// Defensive matching also recognizes the "רשות הפיתוח" spelling, but the
// authoritative Tabu value is "רשות הפתוח".
export const GOVERNMENT_AUTHORITY_NAMES = ['רשות הפתוח', 'רשות הפיתוח'];

export function isGovernmentAuthorityName(name) {
  if (!name) return false;
  const trimmed = String(name).trim();
  return GOVERNMENT_AUTHORITY_NAMES.some((n) => trimmed === n);
}
