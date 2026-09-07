export function assertPatchIsSafe({ targetId, etag, patchUrl, ifMatch }) {
  if (!targetId || typeof targetId !== 'string') {
    throw new Error('Refusing PATCH: target technical ID is empty.');
  }
  if (!etag || typeof etag !== 'string') {
    throw new Error('Refusing PATCH: current ETag is empty.');
  }
  if (!patchUrl.includes(targetId)) {
    throw new Error('Refusing PATCH: PATCH URL does not contain the exact target technical ID.');
  }
  if (ifMatch !== etag) {
    throw new Error('Refusing PATCH: If-Match does not equal the ETag retrieved immediately before this PATCH.');
  }
}

export function assertContactCreationIsSafe({ accountId, idNumber, duplicateLookupPerformed }) {
  if (!accountId) throw new Error('Refusing Contact creation: Account ID is missing.');
  if (!idNumber) throw new Error('Refusing Contact creation: Contact Israeli ID number is missing.');
  if (!duplicateLookupPerformed) {
    throw new Error('Refusing Contact creation: duplicate lookup (Z_ID_Number + Account ID) was not performed.');
  }
}

export function assertRegisteredProductInputIsSafe({ serialId, block, parcel, subParcel }) {
  if (!serialId) throw new Error('Refusing Registered Product operation: serialId is missing.');
  if (!block) throw new Error('Refusing Registered Product operation: Block (גוש) is missing.');
  if (!parcel) throw new Error('Refusing Registered Product operation: Parcel (חלקה) is missing.');
  if (!subParcel) throw new Error('Refusing Registered Product operation: Sub-Parcel (תת חלקה) is missing.');
}

export function assertImportCanStart({ projectId, subParcels }) {
  if (!projectId) throw new Error('Cannot start import: Project ID is missing.');
  if (!Array.isArray(subParcels) || subParcels.length === 0) {
    throw new Error('Cannot start import: no extracted Sub-Parcels were provided.');
  }
}
