import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export default function Results({ summary, onStartNew }) {
  const tiles = [
    { label: 'מוצרים רשומים שנוצרו', value: summary.registeredProductsCreated, tone: 'positive' },
    { label: 'מוצרים רשומים שעודכנו', value: summary.registeredProductsUpdated, tone: '' },
    { label: 'חשבונות שנוצרו', value: summary.accountsCreated, tone: 'positive' },
    { label: 'חשבונות קיימים שנעשה בהם שימוש', value: summary.accountsReused, tone: '' },
    { label: 'אנשי קשר שנוצרו', value: summary.contactsCreated, tone: 'positive' },
    { label: 'אנשי קשר שנעשה בהם שימוש חוזר בייבוא זה', value: summary.contactsReused ?? 0, tone: '' },
    { label: 'תתי-חלקה שעובדו', value: summary.subParcelsProcessed, tone: '' },
    { label: 'רשומות שהצליחו', value: summary.successfulRecords, tone: 'positive' },
    { label: 'רשומות שנכשלו', value: summary.failedRecords, tone: summary.failedRecords > 0 ? 'negative' : '' },
    {
      label: 'בעלים שדולגו (ת"ז לא ודאי)',
      value: summary.skippedOwnersCount ?? 0,
      tone: (summary.skippedOwnersCount ?? 0) > 0 ? 'negative' : '',
    },
  ];

  const failedUnits = summary.unitResults?.filter((u) => !u.success) ?? [];
  const unitsWithSkippedOwners = summary.unitResults?.filter((u) => u.skippedOwners?.length > 0) ?? [];

  return (
    <div className="surface">
      <div className="results-hero">
        <div className="success-icon">
          <CheckCircle2 size={30} />
        </div>
        <h2>הקליטה ל-CRM הסתיימה</h2>
        <p>
          {summary.failedRecords > 0
            ? `הושלם עם ${summary.failedRecords} תתי-חלקה שדורשים תשומת לב - ראו פירוט למטה.`
            : 'כל תתי-החלקה נקלטו בהצלחה. להלן סיכום התוצאות.'}
        </p>
      </div>

      <div className="summary-grid">
        {tiles.map((t) => (
          <div className={`summary-tile ${t.tone}`} key={t.label}>
            <div className="value">{t.value}</div>
            <div className="label">{t.label}</div>
          </div>
        ))}
      </div>

      {failedUnits.length > 0 && (
        <>
          <h3 className="results-section-title">שגיאות מפורטות</h3>
          <p className="results-section-hint">תתי-חלקה אלו לא נקלטו בהצלחה.</p>
          <div className="progress-list">
            {failedUnits.map((u) => (
              <div className="progress-row error" key={u.subParcelId}>
                <span className="status-icon">
                  <AlertTriangle size={19} />
                </span>
                <span className="path">{u.label}</span>
                <span className="error-msg">{u.error}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {unitsWithSkippedOwners.length > 0 && (
        <>
          <h3 className="results-section-title">בעלים שדולגו עקב ת"ז לא ודאי</h3>
          <p className="results-section-hint">
            עבור בעלים אלו לא נוצר/אותר חשבון, שכן חיפוש חשבון מתבצע לפי מספר ת"ז בלבד ולעולם לא לפי שם בלבד. יש
            לתקן את מספר הת"ז בתצוגה המקדימה ולייבא מחדש.
          </p>
          <div className="progress-list">
            {unitsWithSkippedOwners.map((u) => (
              <div className="progress-row error" key={u.subParcelId}>
                <span className="status-icon">
                  <AlertTriangle size={19} />
                </span>
                <span className="path">{u.label}</span>
                <span className="error-msg">{u.skippedOwners.map((o) => o.name).join(', ')}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="actions-row">
        <span />
        <button className="btn btn-primary" onClick={onStartNew}>
          ייבוא חדש
        </button>
      </div>
    </div>
  );
}
