import React from 'react';
import { Check } from 'lucide-react';

const STEPS = [
  { key: 'project', label: 'בחירת פרויקט' },
  { key: 'upload', label: 'העלאת נסח טאבו' },
  { key: 'preview', label: 'תצוגה מקדימה' },
  { key: 'import', label: 'קליטה ל-CRM' },
  { key: 'results', label: 'סיום' },
];

export default function StepRail({ currentKey }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentKey);
  return (
    <nav className="stepper" aria-label="שלבי התהליך">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;
        const stateClass = isActive ? 'active' : isDone ? 'done' : '';
        return (
          <div key={step.key} className={`step-item ${stateClass}`}>
            <span className={`connector ${i <= currentIndex ? 'filled' : ''}`} />
            <span className="circle">{isDone ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
            <span className="step-label">{step.label}</span>
          </div>
        );
      })}
    </nav>
  );
}
