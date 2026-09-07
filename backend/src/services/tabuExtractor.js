import { GoogleGenAI } from '@google/genai';
import crypto from 'node:crypto';
import { config, isGovernmentAuthorityName } from '../config.js';
import { logger } from '../logger.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

const SYSTEM_PROMPT = `
You are extracting structured data from an Israeli Tabu (Land Registry) PDF.
You MUST base your reading on the actual visual/page structure of the document,
not only on raw text order, because Block/Parcel/Sub-Parcel and ownership
tables are layout-dependent.

For each relevant page / ownership section, extract one "unit" per
Sub-Parcel (תת חלקה), with these fields:
- block (גוש): usually at the top of the page
- parcel (חלקה): usually at the top of the page
- subParcel (תת חלקה): appears above the ownership table
- area, floor, entrance: if present for that unit
- commonPropertyShare (חלק ברכוש המשותף): if present
- owners: an array of ONLY actual ownership/resident entries in the
  ownership table for that Sub-Parcel

STRICT RULES:
- IGNORE COMPLETELY: heirs, mortgages, banks, liens, warnings, legal
  notices, unrelated encumbrances, and any other non-ownership parties.
  Never list an heir as an owner.
- Never invent or guess a missing value. If a value is not present, or
  cannot be confidently read, set it to null (for text fields) and, for
  the Israeli ID specifically, also set idNumberConfident to false.
- If the Israeli ID is present but you are not fully confident it was read
  correctly, still return your best reading AND set idNumberConfident to
  false.
- The special public owner value "רשות הפתוח" (also sometimes appearing as
  "רשות הפיתוח") is a government authority, NOT a private resident. If an
  owner's name matches this, set isGovernmentAuthority: true, and set
  idNumber to null / idNumberConfident to true (an ID is simply not
  applicable to it, this is not an uncertainty).
- Do not compute or derive an apartment number. Always leave it out - it is
  handled separately and must remain empty at this stage.
- If something about a page is ambiguous or only partially legible, add a
  short note to that unit's "issues" array (or to the top-level
  "documentWarnings" array if it applies to the whole document) instead of
  guessing.

Respond with ONLY minified JSON (no markdown fences, no prose) matching
exactly this shape:
{
  "documentWarnings": string[],
  "units": [
    {
      "block": string | null,
      "parcel": string | null,
      "subParcel": string | null,
      "area": string | null,
      "floor": string | null,
      "entrance": string | null,
      "commonPropertyShare": string | null,
      "issues": string[],
      "owners": [
        {
          "name": string,
          "idNumber": string | null,
          "idNumberConfident": boolean,
          "ownershipShare": string | null,
          "isGovernmentAuthority": boolean
        }
      ]
    }
  ]
}
`.trim();

function stripJsonFences(text) {
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
}

/**
 * Runs multimodal extraction over the uploaded Tabu PDF using Google Gemini
 * (via @google/genai / GoogleGenAI) and returns the data in exactly the
 * shape the frontend Preview screen expects.
 */
export async function extractTabuPdf(pdfBuffer) {
  if (!config.gemini.apiKey) {
    throw new Error('Tabu extraction is not configured (GEMINI_API_KEY missing).');
  }
  if (!config.gemini.model) {
    throw new Error('Tabu extraction is not configured (GEMINI_MODEL missing).');
  }

  const base64 = pdfBuffer.toString('base64');

  const response = await ai.models.generateContent({
    model: config.gemini.model,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
          { text: 'Extract the Tabu data from this document, following the system instructions exactly.' },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Tabu extraction failed: Gemini returned no text content.');
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(text));
  } catch (err) {
    logger.error('tabuExtractor', 'Failed to parse model output as JSON', { snippet: text.slice(0, 300) });
    throw new Error('Tabu extraction failed: could not parse structured data from the document.');
  }

  const units = Array.isArray(parsed.units) ? parsed.units : [];

  const subParcels = units.map((unit) => ({
    id: crypto.randomUUID(),
    block: unit.block ?? '',
    parcel: unit.parcel ?? '',
    subParcel: unit.subParcel ?? '',
    // Apartment Number is never derived - always starts empty (spec section 4/10).
    apartmentNumber: '',
    area: unit.area ?? '',
    floor: unit.floor ?? '',
    entrance: unit.entrance ?? '',
    commonPropertyShare: unit.commonPropertyShare ?? '',
    issues: Array.isArray(unit.issues) ? unit.issues : [],
    owners: (Array.isArray(unit.owners) ? unit.owners : []).map((owner) => ({
      id: crypto.randomUUID(),
      name: owner.name ?? '',
      idNumber: owner.idNumber ?? '',
      idNumberConfident: owner.isGovernmentAuthority ? true : Boolean(owner.idNumberConfident) && Boolean(owner.idNumber),
      ownershipShare: owner.ownershipShare ?? '',
      isGovernmentAuthority: Boolean(owner.isGovernmentAuthority) || isGovernmentAuthorityName(owner.name),
    })),
  }));

  logger.info('tabuExtractor', `Extracted ${subParcels.length} unit(s) from Tabu PDF`);

  return {
    documentWarnings: Array.isArray(parsed.documentWarnings) ? parsed.documentWarnings : [],
    subParcels,
  };
}
