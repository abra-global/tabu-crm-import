# Tabu → SAP C4C Import — Clean Rebuild

Hebrew/RTL web app that imports Israeli Tabu (Land Registry) PDFs into SAP
Sales and Service Cloud V2 (C4C). Rebuilt from scratch against the business
spec; the old frontend was inspected for UI/UX only — no old backend logic,
caches, or workarounds were carried over.

**Fixed integration requirements implemented exactly as specified:**
- AI extraction uses **Google Gemini** via `@google/genai` (`GoogleGenAI`),
  reading the PDF as an actual multimodal document part. No Anthropic/Claude/
  OpenAI dependency exists anywhere in the project.
- SAP CRM authentication is **HTTP Basic Auth** (`CRM_BASIC_USERNAME` /
  `CRM_BASIC_PASSWORD`). No OAuth2, no client credentials, no token
  acquisition, no token cache.

## 1. Architecture overview

```
frontend (React + Vite)          backend (Node + Express)
--------------------------       ------------------------------------------
Project select                   crmClient    -> Basic Auth header per request
Upload Tabu PDF        --/api--> projectService  -> Opportunity list/GET
Editable preview                 tabuExtractor    -> Gemini multimodal PDF read
Confirm + import                 accountService   -> Z_IdNum lookup/create
Progress (SSE)                   contactService   -> Z_ID_Number+Account dup
Results                          productService   -> reference Product 999
                                  registeredProductService -> create/update
                                  opportunityService -> safe PATCH + verify
                                  importService    -> per-Sub-Parcel orchestration
```

The frontend never talks to SAP directly and holds no credentials — every
CRM call is server-side, behind `/api/*`.

## 2. File structure

```
backend/
  .env.example
  package.json
  src/
    config.js            # env-derived settings, fixed Government Account ID
    logger.js             # structured, credential-redacting logger
    server.js              # Express app / route mounting
    crm/
      crmClient.js           # single HTTP client; Basic Auth; ETag extraction; real errors
    utils/
      resolveId.js            # technical-ID resolution helper (throws, never silent)
      validation.js            # pre-flight / pre-PATCH assertions
    services/
      projectService.js        # Opportunity list + GET+ETag
      productService.js         # reference Product (displayId 999) lookup
      accountService.js         # Account lookup/create (Z_IdNum)
      contactService.js         # Contact lookup/create (Z_ID_Number + Account)
      registeredProductService.js # RP create/update, strict ETag flow
      opportunityService.js     # safe Opportunity PATCH (no subnodes)
      tabuExtractor.js          # Gemini multimodal PDF -> structured JSON
      importService.js          # per-Sub-Parcel orchestration
    routes/
      projects.js, upload.js, import.js (SSE)
frontend/
  src/App.jsx, pages/*, components/StepRail.jsx, api/client.js, styles/global.css
```

## 3. Main CRM flow

`POST /api/import` streams Server-Sent Events while `importService.runImport`
processes each Sub-Parcel **independently**:

1. Resolve owner(s): Government Authority check → fixed Account, no lookup,
   no Contact. Otherwise resolve Account (by `Z_IdNum`) and, depending on the
   "יצירת חשבון נפרד לכל דייר" checkbox, either one Account per owner or one
   shared Account (first valid owner) with the rest as Contacts.
2. Build the Registered Product payload (`serialId = {Block}-{Parcel}-{SubParcel}`).
3. Look up the Registered Product by `serialId`; create if missing, update
   (fresh GET → ETag → PATCH) if it exists.
4. Associate the resolved Account and the selected Opportunity.
5. Record a per-unit result (success/failure, real SAP error, skipped owners).
6. One failed unit never stops the rest — `import_done` always fires with a
   complete summary at the end.

## 4. Exact SAP endpoints used

- `GET /sap/c4c/api/v1/opportunity-service/opportunities?$filter=extensions/Z_opp_group eq '2'`
- `GET /sap/c4c/api/v1/opportunity-service/opportunities/{id}`
- `PATCH /sap/c4c/api/v1/opportunity-service/opportunities/{id}` (`application/merge-patch+json`, guarded — see §9)
- `GET /sap/c4c/api/v1/account-service/accounts?$filter=extensions/Z_IdNum eq '{id}'`
- `POST /sap/c4c/api/v1/account-service/accounts`
- `GET /sap/c4c/api/v1/contact-person-service/contactPersons?$filter=extensions/Z_ID_Number eq '{id}' and isContactPersonFor/accountId eq '{accountId}'`
- `POST /sap/c4c/api/v1/contact-person-service/contactPersons`
- `GET /sap/c4c/api/v1/product-service/products?$filter=displayId eq '999'`
- `GET /sap/c4c/api/v1/registered-product-service/registeredProducts?$filter=serialId eq '{serialId}'`
- `POST /sap/c4c/api/v1/registered-product-service/registeredProducts`
- `GET /sap/c4c/api/v1/registered-product-service/registeredProducts/{id}`
- `PATCH /sap/c4c/api/v1/registered-product-service/registeredProducts/{id}`

Every request authenticates with `Authorization: Basic base64(username:password)`,
computed fresh per request from `CRM_BASIC_USERNAME` / `CRM_BASIC_PASSWORD` —
no token endpoint is ever called.

## 5. Exact PATCH/ETag flow

Every PATCH (`registeredProductService.updateRegisteredProduct`,
`opportunityService.patchOpportunity`) follows, with no exceptions:

```
GET  /{resource}/{technicalId}        -> read ETag from THIS response
assert: target ID non-empty, ETag non-empty, PATCH URL contains that ID
PATCH /{resource}/{technicalId}       -> If-Match: <that exact ETag>
                                          Authorization: Basic <...> (same as every request)
```

On a `412` from the Registered Product PATCH, exactly **one** fresh
GET→ETag→PATCH retry cycle runs; a second `412` stops and the real SAP
error is returned — no infinite retries, no cached/hardcoded ETags anywhere
in the codebase (verified — see §10).

## 6. Government Authority handling

If any owner on a Sub-Parcel matches `"רשות הפתוח"` (defensively also
`"רשות הפיתוח"`), the unit uses the fixed technical Account
`01a076e8-3e32-7003-a320-fc6b22fcd359` directly — no Account lookup, no
Account creation, no Contact creation, and this path is logged explicitly.
Errors are never re-labeled as "Government Authority" errors unless the
actual failure is about that fixed Account's association — a `412` or `400`
from an unrelated cause always shows the real SAP error.

## 7. Account/Contact duplicate logic

- **Account**: matched only by `extensions/Z_IdNum`; never by name.
- **Contact**: matched by `extensions/Z_ID_Number` **and** the Account ID
  together (never ID alone) — the same person can legitimately be a Contact
  under multiple Accounts. SAP's live GET is the sole authority for this
  check; there is no in-memory cache to go stale or diverge across runs.
- Owners with a missing/unconfident Israeli ID are never guessed — they're
  recorded as `skippedOwners` on that unit's result and the rest of the unit
  still proceeds if at least one owner has a confident ID.

## 8. Registered Product creation/update logic

One Registered Product per Sub-Parcel, `serialId = {Block}-{Parcel}-{SubParcel}`
(e.g. `7215-5-7`). Looked up by `serialId`; created if absent, updated
in-place if present — never duplicated. `Z_ApartmentNumber` always starts
empty and is never derived from Sub-Parcel. `Common Property Share` is
preview-only (no SAP extension invented for it). The reference Product's
technical ID is resolved live via the Product API (displayId `999`) on every
import run, never hardcoded.

## 9. Opportunity association logic

The Registered Product carries `opportunity: { id: PROJECT_ID }` directly —
this is the **one** supported mechanism. `opportunityService.patchOpportunity`
exists as a generic, correctly-ETagged primitive for other Opportunity field
updates, but hard-refuses any payload containing a `registeredProducts` key,
since SAP has been observed to reject that shape (`opportunity.2042`). No
second/artificial association mechanism was implemented.

## 10. Verification against the clean-rebuild checklist

Searched the delivered codebase for every disallowed pattern:

```
grep -rniE "oauth|client_credentials|tokenUrl|access_token|Bearer|ANTHROPIC|Claude" backend/
  -> only two comment lines stating that OAuth/Bearer is NOT used; no code, no imports
grep -rn "registeredProducts: \[{}\]" backend/src        -> no matches
grep -rniE "בדיקה|פז טסט|test" backend/src               -> no matches
grep -rn "@anthropic-ai" backend/                        -> no matches
```

No RP/ETag/Contact caches, no OAuth/token code, no Anthropic dependency, no
name-only Account matching, no fake test data, and no Government-Authority-
by-status-code inference exist anywhere in the backend.

## 11. Assumptions that remain unresolved

These were **not** specified in the business spec and had to be assumed to
produce a runnable backend — please confirm/adjust before production use:

1. **SAP entity technical-ID field name**: `resolveTechnicalId` checks
   `id` / `ID` / `ObjectID` / `objectId` on any response envelope. This is a
   generic, defensive helper (explicitly requested by spec §13) — it does
   not invent business fields.
2. **Gemini model string**: `GEMINI_MODEL` is left blank in `.env.example`
   intentionally — set it to the multimodal Gemini model available on your
   Google AI account before running.
3. **Mixed Government + private owners on one Sub-Parcel**: not addressed
   by the spec (in practice a public authority parcel has no private
   co-owners). If any owner on a unit matches the Government Authority
   name, the whole unit uses the fixed Account and no Contacts are created
   for that unit — private co-owners in that edge case are not otherwise
   processed. Flag if this should differ.
4. **RP↔single-Account cardinality when "separate account per resident" is
   checked**: each owner still gets their own Account+Contact (per spec
   §7), but the Registered Product's single `account`/`accountCustomParties`
   link uses the **first** valid owner's Account, since the spec describes
   the Account association on the Registered Product in the singular.

## Running locally

```bash
cd backend && cp .env.example .env   # fill in CRM Basic Auth + Gemini credentials
npm install && npm start             # listens on :8787

cd ../frontend
npm install && npm run dev           # Vite dev server on :5173, proxies /api -> :8787
```
