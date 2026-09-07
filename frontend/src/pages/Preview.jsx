import React from 'react';
import { AlertTriangle } from 'lucide-react';

const UNIT_FIELDS = [
  { key: 'block', label: 'גוש' },
  { key: 'parcel', label: 'חלקה' },
  { key: 'subParcel', label: 'תת חלקה' },
  { key: 'apartmentNumber', label: 'מספר דירה' },
  { key: 'area', label: 'שטח' },
  { key: 'floor', label: 'קומה' },
  { key: 'entrance', label: 'כניסה' },
  { key: 'commonPropertyShare', label: 'חלק ברכוש המשותף' },
];

function updateUnit(tabuData, setTabuData, unitId, patch) {
  setTabuData({
    ...tabuData,
    subParcels: tabuData.subParcels.map((u) => (u.id === unitId ? { ...u, ...patch } : u)),
  });
}

function updateOwner(tabuData, setTabuData, unitId, ownerId, patch) {
  setTabuData({
    ...tabuData,
    subParcels: tabuData.subParcels.map((u) =>
      u.id === unitId
        ? {
            ...u,
            owners: u.owners.map((o) => (o.id === ownerId ? { ...o, ...patch } : o)),
          }
        : u
    ),
  });
}

export default function Preview({
  tabuData,
  setTabuData,
  separateAccountPerResident,
  setSeparateAccountPerResident,
  onConfirm,
  onBack,
}) {
  const totalUnits = tabuData.subParcels.length;
  const totalOwners = tabuData.subParcels.reduce((sum, u) => sum + u.owners.length, 0);
  const flaggedOwners = tabuData.subParcels.reduce(
    (sum, u) => sum + u.owners.filter((o) => !o.idNumberConfident).length,
    0
  );
  const unitsWithIssues = tabuData.subParcels.filter((u) => u.issues?.length > 0).length;

  return (
    <div className="surface">
      <div className="page-head">
        <h2>תצוגה מקדימה ואישור</h2>
        <p>
          נמצאו {totalUnits} תתי-חלקה ו-{totalOwners} בעלים. יש לבדוק את הנתונים ולתקן במידת הצורך לפני הקליטה ל-CRM.
        </p>
      </div>

      {tabuData.documentWarnings?.length > 0 && (
        <div className="alert alert-warning">
          <AlertTriangle size={17} />
          <span>אזהרות כלליות מהמסמך: {tabuData.documentWarnings.join(' | ')}</span>
        </div>
      )}

      {(flaggedOwners > 0 || unitsWithIssues > 0) && (
        <div className="alert alert-warning">
          <AlertTriangle size={17} />
          <span>
            {flaggedOwners > 0 && `${flaggedOwners} מספרי ת"ז אינם ודאיים ומחייבים בדיקה. `}
            {unitsWithIssues > 0 && `${unitsWithIssues} תתי-חלקה עם הערות חילוץ.`}
          </span>
        </div>
      )}

      {tabuData.subParcels.map((unit) => (
        <div className="unit-group" key={unit.id}>
          <div className="unit-group-head">
            <span className="path">
              גוש {unit.block} · חלקה {unit.parcel} · תת חלקה {unit.subParcel}
            </span>
            <span className="owner-count">{unit.owners.length} בעלים</span>
          </div>

          <div className="field-grid">
            {UNIT_FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <span className="mini-label">{f.label}</span>
                <input
                  value={unit[f.key] ?? ''}
                  onChange={(e) => updateUnit(tabuData, setTabuData, unit.id, { [f.key]: e.target.value })}
                  placeholder="—"
                />
              </div>
            ))}
          </div>

          {unit.owners.length === 0 ? (
            <p className="no-owners-note">
              לא נמצאו בעלים פרטיים עבור תת-חלקה זו — ייווצר מוצר רשום בלבד, ללא חשבון וללא איש קשר.
            </p>
          ) : (
            <div className="owners-table-wrap">
              <table className="owners-table">
                <thead>
                  <tr>
                    <th>שם בעלים</th>
                    <th>מספר ת"ז</th>
                    <th>חלק בבעלות</th>
                  </tr>
                </thead>
                <tbody>
                  {unit.owners.map((owner) => (
                    <tr key={owner.id} className={!owner.idNumberConfident ? 'flagged' : ''}>
                      <td>
                        <input
                          value={owner.name}
                          onChange={(e) => updateOwner(tabuData, setTabuData, unit.id, owner.id, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={owner.idNumber ?? ''}
                          onChange={(e) =>
                            updateOwner(tabuData, setTabuData, unit.id, owner.id, {
                              idNumber: e.target.value,
                              idNumberConfident: true,
                            })
                          }
                        />
                        {!owner.idNumberConfident && <span className="badge badge-warning">לבדיקה</span>}
                      </td>
                      <td>
                        <input
                          value={owner.ownershipShare ?? ''}
                          onChange={(e) =>
                            updateOwner(tabuData, setTabuData, unit.id, owner.id, { ownershipShare: e.target.value })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {unit.issues?.length > 0 && (
            <div className="unit-issues">
              {unit.issues.map((issue, i) => (
                <span className="badge badge-warning" key={i}>
                  {issue}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="checkbox-row">
        <input
          type="checkbox"
          id="separate-account"
          checked={separateAccountPerResident}
          onChange={(e) => setSeparateAccountPerResident(e.target.checked)}
        />
        <div>
          <label htmlFor="separate-account">יצירת חשבון נפרד לכל דייר</label>
          <div className="desc">
            כאשר מסומן: לכל בעלים ייווצר/ישויך חשבון נפרד. כאשר לא מסומן: כל בעלי אותה תת-חלקה ישותפו תחת חשבון
            אחד, כאשר הבעלים הראשון הוא זהות החשבון והשאר יתווספו כאנשי קשר.
          </div>
        </div>
      </div>

      <div className="actions-row">
        <button className="btn btn-secondary" onClick={onBack}>
          חזרה להעלאת קובץ
        </button>
        <button className="btn btn-accent" onClick={onConfirm} disabled={totalUnits === 0}>
          אישור וקליטה ל-CRM
        </button>
      </div>
    </div>
  );
}
