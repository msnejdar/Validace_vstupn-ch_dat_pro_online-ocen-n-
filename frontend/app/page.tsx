'use client';
import { useState, useRef, useCallback } from 'react';
import styles from './page.module.css';
import { uploadFiles, startPipeline, parsePdf, type UploadResponse, type PipelineResult, type PropertyData } from '@/lib/api';
import PipelineCanvas from '@/components/PipelineCanvas';
import ResultsDashboard from '@/components/ResultsDashboard';
import { useWebSocket } from '@/hooks/useWebSocket';

const EMPTY_PROPERTY_DATA: PropertyData = {
  stavba_dokoncena: null,
  stav_rodinneho_domu: null,
  pocet_podlazi: null,
  typ_strechy: null,
  podsklepeni: null,
  celkova_podlahova_plocha: null,
  typ_vytapeni: null,
  adresa: null,
};

const DATA_LABELS: Record<keyof PropertyData, string> = {
  stavba_dokoncena: 'Stavba dokončena',
  stav_rodinneho_domu: 'Stav rodinného domu',
  pocet_podlazi: 'Počet podlaží',
  typ_strechy: 'Typ střechy',
  podsklepeni: 'Podsklepení',
  celkova_podlahova_plocha: 'Celková podlahová plocha',
  typ_vytapeni: 'Typ vytápění',
  adresa: 'Adresa',
};

export default function Home() {
  const [step, setStep] = useState<'upload' | 'pipeline' | 'results'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [yearBuilt, setYearBuilt] = useState('');
  const [yearReconstructed, setYearReconstructed] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // PDF state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDragActive, setPdfDragActive] = useState(false);
  const [extractedData, setExtractedData] = useState<PropertyData | null>(null);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [dataSource, setDataSource] = useState<'pdf' | 'manual'>('pdf');

  // Manual form state
  const [manualData, setManualData] = useState<PropertyData>({ ...EMPTY_PROPERTY_DATA });

  const ws = useWebSocket(sessionId);

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    setFiles(prev => [...prev, ...arr]);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const processPdf = useCallback(async (file: File) => {
    setPdfFile(file);
    setPdfParsing(true);
    setError(null);
    try {
      const data = await parsePdf(file);
      if (data) {
        setExtractedData(data);
      } else {
        setError('PDF bylo zpracováno, ale nepodařilo se extrahovat údaje.');
      }
    } catch {
      setError('Chyba při zpracování PDF.');
    } finally {
      setPdfParsing(false);
    }
  }, []);

  const handlePdfDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setPdfDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    const pdf = droppedFiles.find(f => f.name.toLowerCase().endsWith('.pdf'));
    if (pdf) processPdf(pdf);
  }, [processPdf]);

  const handlePdfSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.pdf')) {
      processPdf(file);
    }
  }, [processPdf]);

  const updateManualField = (field: keyof PropertyData, value: string) => {
    setManualData(prev => ({ ...prev, [field]: value || null }));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Nahrajte alespoň jednu fotografii.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Determine property data source
      const effectivePdf = dataSource === 'pdf' ? pdfFile || undefined : undefined;
      const effectiveManualData = dataSource === 'manual' ? manualData : undefined;

      // Derive year_built and address from extracted data
      const effectiveData = extractedData || (dataSource === 'manual' ? manualData : null);
      const yearBuiltVal = effectiveData?.stavba_dokoncena ? parseInt(effectiveData.stavba_dokoncena) : undefined;
      const addressVal = effectiveData?.adresa || undefined;

      const result = await uploadFiles(
        files,
        yearBuiltVal,
        undefined,
        addressVal,
        effectivePdf,
        effectiveManualData,
      );
      setUploadData(result);
      setSessionId(result.session_id);

      // Store extracted data from server response
      if (result.property_data) {
        setExtractedData(result.property_data);
      }

      setStep('pipeline');
    } catch (e: any) {
      setError(e.message || 'Chyba při nahrávání');
    } finally {
      setUploading(false);
    }
  };

  const handleStartPipeline = async () => {
    if (!sessionId) return;
    try {
      const result = await startPipeline(sessionId);
      setPipelineResult(result);
      setStep('results');
    } catch (e: any) {
      setError(e.message || 'Chyba při spuštění pipeline');
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Use WS pipeline result when available
  const finalResult = ws.pipelineResult || pipelineResult;

  if (finalResult && step !== 'results') {
    setStep('results');
    setPipelineResult(finalResult);
  }

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="3" y="6" width="22" height="16" rx="2" stroke="url(#hgrad1)" strokeWidth="2" fill="none" />
                <path d="M3 10H25" stroke="url(#hgrad1)" strokeWidth="1.5" />
                <path d="M8 15H16" stroke="url(#hgrad2)" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M8 18H12" stroke="url(#hgrad2)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
                <circle cx="21" cy="17" r="2.5" stroke="url(#hgrad2)" strokeWidth="1.5" fill="none" />
                <defs>
                  <linearGradient id="hgrad1" x1="3" y1="6" x2="25" y2="22">
                    <stop stopColor="#4a9eff" /><stop offset="1" stopColor="#1e6fd9" />
                  </linearGradient>
                  <linearGradient id="hgrad2" x1="8" y1="15" x2="22" y2="18">
                    <stop stopColor="#8fa3bf" /><stop offset="1" stopColor="#4a9eff" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div>
              <h1 className={styles.logoTitle}>Kontrola vstupních dat</h1>
              <p className={styles.logoSubtitle}>Online ocenění rodinných domů</p>
            </div>
          </div>
          <div className={styles.steps}>
            <div className={`${styles.step} ${step === 'upload' ? styles.stepActive : ''} ${step !== 'upload' ? styles.stepDone : ''}`}>
              <span className={styles.stepNum}>1</span>Nahrání
            </div>
            <div className={styles.stepLine} />
            <div className={`${styles.step} ${step === 'pipeline' ? styles.stepActive : ''} ${step === 'results' ? styles.stepDone : ''}`}>
              <span className={styles.stepNum}>2</span>Analýza
            </div>
            <div className={styles.stepLine} />
            <div className={`${styles.step} ${step === 'results' ? styles.stepActive : ''}`}>
              <span className={styles.stepNum}>3</span>Výsledky
            </div>
          </div>
        </div>
      </header>

      {/* Upload Step */}
      {step === 'upload' && (
        <section className={styles.uploadSection}>
          <div className={styles.uploadContainer}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.titleGradient}>Nahrajte fotografie</span>
              <span className={styles.titleSub}>rodinného domu</span>
            </h2>

            {/* Photo Drop Zone */}
            <div
              className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ''} ${files.length > 0 ? styles.dropZoneHasFiles : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.heic,.heif,.webp,.tiff,.bmp"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
                className={styles.fileInput}
              />
              <div className={styles.dropIcon}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <path d="M24 32V16M24 16L18 22M24 16L30 22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M8 32V36C8 38.2 9.8 40 12 40H36C38.2 40 40 38.2 40 36V32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className={styles.dropText}>
                {dragActive ? 'Přetáhněte sem' : 'Přetáhněte fotky nebo klikněte pro výběr'}
              </p>
              <p className={styles.dropHint}>JPG, PNG, HEIC, WebP • Jakákoliv velikost – automatická komprese na max 2 MB</p>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className={styles.fileList}>
                <div className={styles.fileListHeader}>
                  <span>{files.length} {files.length === 1 ? 'soubor' : files.length < 5 ? 'soubory' : 'souborů'}</span>
                  <button className={styles.clearBtn} onClick={() => setFiles([])}>Vymazat vše</button>
                </div>
                <div className={styles.fileGrid}>
                  {files.map((file, i) => (
                    <div key={i} className={styles.fileItem}>
                      <div className={styles.fileThumb}>
                        <img src={URL.createObjectURL(file)} alt={file.name} />
                      </div>
                      <div className={styles.fileInfo}>
                        <span className={styles.fileName}>{file.name}</span>
                        <span className={styles.fileSize}>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                      </div>
                      <button className={styles.fileRemove} onClick={(e) => { e.stopPropagation(); removeFile(i); }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PDF / Manual Data Section */}
            <div className={styles.pdfSection}>
              <h3 className={styles.pdfSectionTitle}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M11 1H4C3.45 1 3 1.45 3 2V16C3 16.55 3.45 17 4 17H14C14.55 17 15 16.55 15 16V5L11 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M11 1V5H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Údaje o nemovitosti
              </h3>

              {/* Toggle: PDF vs Manual */}
              <div className={styles.dataSourceToggle}>
                <button
                  className={`${styles.toggleTab} ${dataSource === 'pdf' ? styles.toggleTabActive : ''}`}
                  onClick={() => setDataSource('pdf')}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M8.5 1H3.5C3.22 1 3 1.22 3 1.5V12.5C3 12.78 3.22 13 3.5 13H10.5C10.78 13 11 12.78 11 12.5V3.5L8.5 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Z PDF formuláře
                </button>
                <button
                  className={`${styles.toggleTab} ${dataSource === 'manual' ? styles.toggleTabActive : ''}`}
                  onClick={() => setDataSource('manual')}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M10 1.5L12.5 4L4.5 12H2V9.5L10 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Zadat ručně
                </button>
              </div>

              {/* PDF Upload */}
              {dataSource === 'pdf' && (
                <>
                  {!pdfFile ? (
                    <div
                      className={`${styles.pdfDropZone} ${pdfDragActive ? styles.pdfDropZoneActive : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setPdfDragActive(true); }}
                      onDragLeave={() => setPdfDragActive(false)}
                      onDrop={handlePdfDrop}
                      onClick={() => pdfInputRef.current?.click()}
                    >
                      <input
                        ref={pdfInputRef}
                        type="file"
                        accept=".pdf"
                        onChange={handlePdfSelect}
                        className={styles.fileInput}
                      />
                      <div className={styles.pdfDropIcon}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M14 2H6C5.45 2 5 2.45 5 3V21C5 21.55 5.45 22 6 22H18C18.55 22 19 21.55 19 21V7L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M14 2V7H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M9 15H15M12 12V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <p className={styles.pdfDropText}>
                        {pdfDragActive ? 'Přetáhněte PDF sem' : 'Nahrajte PDF formulář ocenění'}
                      </p>
                      <p className={styles.pdfDropHint}>Formulář „Ocenění rodinného domu" • PDF formát</p>
                    </div>
                  ) : (
                    <div className={styles.pdfFileInfo}>
                      <div className={styles.pdfFileName}>
                        <div className={styles.pdfFileIcon}>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M10 1H4C3.45 1 3 1.45 3 2V14C3 14.55 3.45 15 4 15H12C12.55 15 13 14.55 13 14V4L10 1Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                          </svg>
                        </div>
                        <span>{pdfFile.name}</span>
                        {pdfParsing && <span className={styles.spinner} style={{ width: '14px', height: '14px', borderWidth: '2px' }} />}
                        {pdfParsing && <span style={{ fontSize: '12px', color: 'var(--accent-blue-light)' }}>Extrahuji údaje...</span>}
                      </div>
                      <button className={styles.pdfRemoveBtn} onClick={() => { setPdfFile(null); setExtractedData(null); }}>✕</button>
                    </div>
                  )}
                </>
              )}

              {/* Manual Form */}
              {dataSource === 'manual' && (
                <div className={styles.manualForm}>
                  <div className={styles.manualFormGrid}>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>Stavba dokončena (rok)</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="např. 1980"
                        value={manualData.stavba_dokoncena || ''}
                        onChange={(e) => updateManualField('stavba_dokoncena', e.target.value)}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>Stav rodinného domu</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="např. dobře udržovaný"
                        value={manualData.stav_rodinneho_domu || ''}
                        onChange={(e) => updateManualField('stav_rodinneho_domu', e.target.value)}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>Počet podlaží</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="např. 2"
                        value={manualData.pocet_podlazi || ''}
                        onChange={(e) => updateManualField('pocet_podlazi', e.target.value)}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>Typ střechy</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="např. sedlová"
                        value={manualData.typ_strechy || ''}
                        onChange={(e) => updateManualField('typ_strechy', e.target.value)}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>Podsklepení</label>
                      <select
                        className="input-field"
                        value={manualData.podsklepeni || ''}
                        onChange={(e) => updateManualField('podsklepeni', e.target.value)}
                      >
                        <option value="">Vyberte...</option>
                        <option value="ANO">ANO</option>
                        <option value="NE">NE</option>
                      </select>
                    </div>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>Celková podlahová plocha</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="např. 175 m²"
                        value={manualData.celkova_podlahova_plocha || ''}
                        onChange={(e) => updateManualField('celkova_podlahova_plocha', e.target.value)}
                      />
                    </div>
                    <div className={`${styles.inputGroup} ${styles.manualFormFull}`}>
                      <label className={styles.inputLabel}>Typ vytápění</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="např. lokální - Plynový standardní kotel"
                        value={manualData.typ_vytapeni || ''}
                        onChange={(e) => updateManualField('typ_vytapeni', e.target.value)}
                      />
                    </div>
                    <div className={`${styles.inputGroup} ${styles.manualFormFull}`}>
                      <label className={styles.inputLabel}>Adresa nemovitosti</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="např. Květná 1740, 68001 Boskovice"
                        value={manualData.adresa || ''}
                        onChange={(e) => updateManualField('adresa', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Extracted Data Display (shown after upload if PDF was parsed) */}
              {extractedData && (
                <div className={styles.extractedData}>
                  <div className={styles.extractedDataTitle}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M11.5 4L5.5 10L2.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Extrahované údaje z PDF
                  </div>
                  <div className={styles.extractedGrid}>
                    {(Object.keys(DATA_LABELS) as (keyof PropertyData)[]).map(key => (
                      <div key={key} className={styles.extractedItem}>
                        <span className={styles.extractedLabel}>{DATA_LABELS[key]}</span>
                        {extractedData[key] ? (
                          <span className={styles.extractedValue}>{extractedData[key]}</span>
                        ) : (
                          <span className={styles.extractedValueMissing}>nenalezeno</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={uploading || files.length === 0}
              style={{ width: '100%', justifyContent: 'center', padding: '16px', fontSize: '16px' }}
            >
              {uploading ? (
                <>
                  <span className={styles.spinner} />
                  Zpracovávám...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Nahrát a zpracovat ({files.length} {files.length === 1 ? 'soubor' : 'souborů'})
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* Pipeline Step */}
      {step === 'pipeline' && sessionId && (
        <PipelineCanvas
          sessionId={sessionId}
          agentStatuses={ws.agentStatuses}
          agentLogs={ws.agentLogs}
          isRunning={ws.isRunning}
          onStart={handleStartPipeline}
          uploadData={uploadData}
        />
      )}

      {/* Results Step */}
      {step === 'results' && finalResult && (
        <ResultsDashboard
          result={finalResult}
          onReset={() => {
            setStep('upload');
            setFiles([]);
            setSessionId(null);
            setUploadData(null);
            setPipelineResult(null);
            setPdfFile(null);
            setExtractedData(null);
            setManualData({ ...EMPTY_PROPERTY_DATA });
          }}
        />
      )}
    </main>
  );
}
