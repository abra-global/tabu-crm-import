import React from 'react';
import { CheckCircle2, AlertTriangle, Copy } from 'lucide-react';

const ASSOCIATION_STATUS_META = {
  created: { label: 'נוצר', badgeClass: 'badge-success', Icon: CheckCircle2 },
  already_exists: { label: 'קיים כבר', badgeClass: 'badge-info', Icon: Copy },
  failed: { label: 'נכשל', badgeClass: 'badge-danger', Icon: AlertTriangle },
};

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
  const associationResults = summary.associationResults ?? [];

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

      {associationResults.length > 0 && (
        <>
          <h3 className="results-section-title">שיוכים ומניעת כפילויות</h3>
          <p className="results-section-hint">
            לכל שיוך (מוצר רשום ← פרויקט, דייר ← חשבון, דייר ← איש קשר) נבדק מול ה-CRM אם הוא כבר קיים לפני היצירה.
            "קיים כבר" אינו נספר כיצירה חדשה - הוא מציין ששיוך כזה כבר היה קיים ב-SAP ולא נוצר פעם נוספת.
          </p>
          <div className="progress-list">
            {associationResults.map((a, i) => {
              const meta = ASSOCIATION_STATUS_META[a.status] ?? ASSOCIATION_STATUS_META.failed;
              const Icon = meta.Icon;
              return (
                <div className="progress-row" key={`${a.label}-${i}`}>
                  <span className="status-icon">
                    <Icon size={19} />
                  </span>
                  <span className="path">{a.label}</span>
                  <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

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
