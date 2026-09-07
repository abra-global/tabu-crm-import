import React, { useRef, useState } from 'react';
import { Loader2, UploadCloud, FileText, AlertTriangle } from 'lucide-react';
import { uploadTabuPdf } from '../api/client.js';

export default function UploadTabu({ projectName, onExtracted, onBack }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | uploading | error
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  function pickFile(f) {
    if (!f) return;
    if (f.type !== 'application/pdf') {
      setError('יש להעלות קובץ PDF בלבד');
      return;
    }
    setError(null);
    setFile(f);
  }

  async function startExtraction() {
    if (!file) return;
    setStatus('uploading');
    setError(null);
    try {
      const data = await uploadTabuPdf(file);
      onExtracted(data);
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  }

  if (status === 'uploading') {
    return (
      <div className="surface">
        <div className="page-head">
          <h2>עיבוד המסמך</h2>
          <p>המערכת מנתחת את נסח הטאבו ומחלצת גושים, חלקות, תתי-חלקה ובעלים...</p>
        </div>
        <div className="center-loading">
          <Loader2 size={26} className="spin" />
          <span>מעבד את המסמך. התהליך עשוי להימשך מספר דקות...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="surface">
      <div className="page-head">
        <h2>העלאת נסח טאבו</h2>
        <p>
          פרויקט נבחר: <strong>{projectName}</strong>. יש להעלות קובץ PDF של נסח הטאבו הרלוונטי.
        </p>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertTriangle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div
        className={`dropzone ${dragOver ? 'drag-over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="upload-icon">
          <UploadCloud size={24} />
        </div>
        <div className="drop-label">גררו לכאן קובץ PDF של נסח הטאבו, או לחצו לבחירת קובץ</div>
        {file && (
          <div className="file-chip">
            <FileText size={15} />
            {file.name}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
      </div>

      <div className="actions-row">
        <button className="btn btn-secondary" onClick={onBack}>
          חזרה לבחירת פרויקט
        </button>
        <button className="btn btn-primary" disabled={!file} onClick={startExtraction}>
          נתח מסמך והמשך לתצוגה מקדימה
        </button>
      </div>
    </div>
  );
}
