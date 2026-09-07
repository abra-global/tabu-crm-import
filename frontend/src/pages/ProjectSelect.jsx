import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { fetchProjects } from '../api/client.js';

export default function ProjectSelect({ selectedProjectId, onSelect, onNext }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProjects()
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="surface">
      <div className="page-head">
        <h2>בחירת פרויקט</h2>
        <p>בחרו את ההזדמנות (פרויקט) אליה ייקלטו הנתונים מנסח הטאבו.</p>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertTriangle size={17} />
          <span>שגיאה בטעינת רשימת הפרויקטים: {error}</span>
        </div>
      )}

      {loading ? (
        <div className="center-loading">
          <Loader2 size={22} className="spin" />
          <span>טוען רשימת פרויקטים...</span>
        </div>
      ) : (
        <div className="project-list">
          {projects.length === 0 && !error && <p>לא נמצאו פרויקטים תואמים.</p>}
          {projects.map((p) => (
            <div
              key={p.id}
              className={`project-row ${selectedProjectId === p.id ? 'selected' : ''}`}
              onClick={() => onSelect(p)}
              role="button"
              tabIndex={0}
            >
              <span className="name">{p.name}</span>
              <span className="id">{p.id}</span>
            </div>
          ))}
        </div>
      )}

      <div className="actions-row">
        <span />
        <button className="btn btn-primary" disabled={!selectedProjectId} onClick={onNext}>
          המשך להעלאת נסח טאבו
        </button>
      </div>
    </div>
  );
}
