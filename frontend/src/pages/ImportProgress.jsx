import React, { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Circle, AlertTriangle } from 'lucide-react';
import { runImportStream } from '../api/client.js';

function StatusIcon({ status }) {
  if (status === 'done') return <CheckCircle2 size={19} />;
  if (status === 'error') return <XCircle size={19} />;
  if (status === 'running') return <Loader2 size={19} className="spin" />;
  return <Circle size={19} />;
}

export default function ImportProgress({ projectId, subParcels, separateAccountPerResident, onDone }) {
  const [unitStates, setUnitStates] = useState(() =>
    subParcels.map((u) => ({
      subParcelId: u.id,
      label: `גוש ${u.block} · חלקה ${u.parcel} · תת חלקה ${u.subParcel}`,
      status: 'pending', // pending | running | done | error
      message: 'ממתין...',
      error: null,
    }))
  );
  const [fatalError, setFatalError] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    runImportStream({ projectId, subParcels, separateAccountPerResident }, (event) => {
      if (event.type === 'unit_start') {
        setUnitStates((prev) =>
          prev.map((u) => (u.subParcelId === event.subParcelId ? { ...u, status: 'running', message: 'מתחיל עיבוד...' } : u))
        );
      } else if (event.type === 'unit_status') {
        setUnitStates((prev) =>
          prev.map((u) => (u.subParcelId === event.subParcelId ? { ...u, message: event.message } : u))
        );
      } else if (event.type === 'unit_done') {
        setUnitStates((prev) =>
          prev.map((u) =>
            u.subParcelId === event.subParcelId
              ? {
                  ...u,
                  status: event.success ? 'done' : 'error',
                  message: event.success ? 'הושלם בהצלחה' : 'נכשל',
                  error: event.error,
                }
              : u
          )
        );
      } else if (event.type === 'import_done') {
        onDone(event.summary);
      } else if (event.type === 'fatal_error') {
        setFatalError(event.message);
      }
    }).catch((err) => setFatalError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = unitStates.length;
  const completed = unitStates.filter((u) => u.status === 'done' || u.status === 'error').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="surface">
      <div className="page-head">
        <h2>תהליך קליטה ל-CRM</h2>
        <p>הנתונים נקלטים כעת ל-SAP Sales Cloud. נא לא לסגור את הדף.</p>
      </div>

      {fatalError && (
        <div className="alert alert-danger">
          <AlertTriangle size={17} />
          <span>שגיאה כללית בתהליך הקליטה: {fatalError}</span>
        </div>
      )}

      <div className="overall-progress">
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="bar-label">
          <span>
            {completed} מתוך {total} תתי-חלקה
          </span>
          <span>{percent}%</span>
        </div>
      </div>

      <div className="progress-list">
        {unitStates.map((u) => (
          <div key={u.subParcelId} className={`progress-row ${u.status}`}>
            <span className="status-icon">
              <StatusIcon status={u.status} />
            </span>
            <span className="path">{u.label}</span>
            <span className={u.status === 'error' ? 'error-msg' : 'msg'}>
              {u.status === 'error' ? u.error : u.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
