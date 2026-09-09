import React, { useState } from 'react';
import StepRail from './components/StepRail.jsx';
import ProjectSelect from './pages/ProjectSelect.jsx';
import UploadTabu from './pages/UploadTabu.jsx';
import Preview from './pages/Preview.jsx';
import ImportProgress from './pages/ImportProgress.jsx';
import Results from './pages/Results.jsx';

export default function App() {
  const [step, setStep] = useState('project');
  const [project, setProject] = useState(null); // { id, name }
  const [tabuData, setTabuData] = useState(null); // { subParcels, documentWarnings }
  const [separateAccountPerResident, setSeparateAccountPerResident] = useState(false);
  const [summary, setSummary] = useState(null);

  function resetAll() {
    setProject(null);
    setTabuData(null);
    setSeparateAccountPerResident(false);
    setSummary(null);
    setStep('project');
  }

  return (
    <div className="app-shell">
      <header className="masthead">
        <div className="brand">
          <div className="brand-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4h16v16H4V4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M8 9h8M8 13h8M8 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1>קליטת נסח טאבו ל-CRM</h1>
            <div className="subtitle">SAP Sales Cloud</div>
          </div>
        </div>
      </header>

      <StepRail currentKey={step} />

      {step === 'project' && (
        <ProjectSelect
          selectedProjectId={project?.id ?? null}
          onSelect={(p) => setProject(p)}
          onNext={() => setStep('upload')}
        />
      )}

      {step === 'upload' && (
        <UploadTabu
          projectName={project?.name}
          onExtracted={(data) => {
            setTabuData(data);
            setStep('preview');
          }}
          onBack={() => setStep('project')}
        />
      )}

      {step === 'preview' && tabuData && (
        <Preview
          tabuData={tabuData}
          setTabuData={setTabuData}
          separateAccountPerResident={separateAccountPerResident}
          setSeparateAccountPerResident={setSeparateAccountPerResident}
          onConfirm={() => setStep('import')}
          onBack={() => setStep('upload')}
        />
      )}

      {step === 'import' && tabuData && (
        <ImportProgress
          projectId={project.id}
          subParcels={tabuData.subParcels}
          separateAccountPerResident={separateAccountPerResident}
          onDone={(finalSummary) => {
            setSummary(finalSummary);
            setStep('results');
          }}
        />
      )}

      {step === 'results' && summary && <Results summary={summary} onStartNew={resetAll} />}
    </div>
  );
}
