'use client';
import { useState } from 'react';
import styles from './ResultsDashboard.module.css';
import type { PipelineResult } from '@/lib/api';
import { API_BASE } from '@/lib/api';

interface Props {
    result: PipelineResult;
    onReset: () => void;
}

const AGENT_META: Record<string, { icon: string; label: string; color: string }> = {
    Guardian: { icon: '🛡️', label: 'Fotodokumentace', color: '#3b82f6' },
    Forensic: { icon: '🔬', label: 'Autenticita fotek', color: '#8b5cf6' },
    Historian: { icon: '📜', label: 'Věk nemovitosti', color: '#06b6d4' },
    Inspector: { icon: '🔍', label: 'Technický stav', color: '#f59e0b' },
    GeoValidator: { icon: '📍', label: 'Ověření lokace', color: '#ec4899' },
    DocumentComparator: { icon: '📄', label: 'PDF vs Fotky', color: '#f97316' },
    Strategist: { icon: '🎯', label: 'Závěrečné hodnocení', color: '#10b981' },
};

export default function ResultsDashboard({ result, onReset }: Props) {
    const [showDetails, setShowDetails] = useState(false);

    const semaphore = result.semaphore || 'UNKNOWN';
    const semaphoreColor = result.semaphore_color || 'gray';
    const finalCategory = result.final_category;
    const agents = result.agents || {};
    const strategist = agents['Strategist'];
    const humanReport = strategist?.result?.details?.human_report || strategist?.result?.summary || '';

    const semaphoreLabel = semaphoreColor === 'green'
        ? 'Proces může pokračovat online'
        : semaphoreColor === 'orange'
            ? 'Vyžaduje dohled pracovníka'
            : 'Vrátit klientovi k doplnění';

    const semaphoreIcon = semaphoreColor === 'green' ? '✅' : semaphoreColor === 'orange' ? '⚠️' : '🔴';

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'success': return { text: 'Bez nálezu', class: 'badgeSuccess' };
            case 'warn': return { text: 'Varování', class: 'badgeWarn' };
            case 'fail': return { text: 'Problém', class: 'badgeFail' };
            default: return { text: '–', class: '' };
        }
    };

    return (
        <section className={styles.section}>
            <div className={styles.container}>

                {/* ── Verdict Header ── */}
                <div className={`${styles.verdictCard} ${styles[`verdict_${semaphoreColor}`]}`}>
                    <div className={styles.verdictLeft}>
                        <span className={styles.verdictIcon}>{semaphoreIcon}</span>
                        <div>
                            <h2 className={styles.verdictTitle}>{semaphore}</h2>
                            <p className={styles.verdictSubtitle}>{semaphoreLabel}</p>
                        </div>
                    </div>
                    {finalCategory && (
                        <div className={styles.categoryChip}>
                            <span className={styles.categoryLabel}>Kategorie</span>
                            <span className={styles.categoryValue}>{finalCategory}</span>
                        </div>
                    )}
                </div>

                {/* ── Meta info ── */}
                <div className={styles.metaStrip}>
                    <span>Doba analýzy: {result.total_time?.toFixed(1)}s</span>
                    <span>•</span>
                    <span>Pipeline: {result.pipeline_id}</span>
                </div>

                {/* ── Human Report ── */}
                <div className={styles.reportCard}>
                    <div className={styles.reportHeader}>
                        <h3 className={styles.reportTitle}>Závěrečná zpráva</h3>
                    </div>
                    <div className={styles.reportBody}>
                        {humanReport.split('\n').map((line: string, i: number) => {
                            if (!line.trim()) return <br key={i} />;
                            // Bold lines that look like section headers
                            const isHeader = /^\d+\.|^\*\*|^Shrnutí|^Fotodokumentace|^Stav|^Věk|^Ověření|^Doporučení/i.test(line.trim());
                            return (
                                <p key={i} className={isHeader ? styles.reportSection : styles.reportText}>
                                    {line.replace(/\*\*/g, '')}
                                </p>
                            );
                        })}
                    </div>
                </div>

                {/* ── Agent Results Cards ── */}
                <div className={styles.overviewGrid}>
                    {['Guardian', 'Forensic', 'Historian', 'Inspector', 'GeoValidator', 'DocumentComparator'].map(name => {
                        const agent = agents[name];
                        if (!agent) return null;
                        const meta = AGENT_META[name];
                        const badge = getStatusBadge(agent.result?.status || 'idle');
                        const details = agent.result?.details || {};
                        const warnings = agent.result?.warnings || [];

                        return (
                            <div key={name} className={`${styles.overviewCard} ${styles[`ov_${agent.result?.status}`]}`}>
                                <div className={styles.ovHeader}>
                                    <span className={styles.ovIcon}>{meta.icon}</span>
                                    <span className={`${styles.ovBadge} ${styles[badge.class]}`}>{badge.text}</span>
                                </div>
                                <h4 className={styles.ovTitle}>{meta.label}</h4>
                                <p className={styles.ovSummary}>
                                    {agent.result?.summary || '–'}
                                </p>

                                {/* Key details per agent */}
                                {name === 'Guardian' && details.classifications && (
                                    <div className={styles.ovDetails}>
                                        <span>📸 {Object.keys(details.classifications).length} fotek klasifikováno</span>
                                        {details.missing_views?.length > 0 && (
                                            <span style={{ color: 'var(--accent-orange)' }}>Chybí: {details.missing_views.join(', ')}</span>
                                        )}
                                    </div>
                                )}
                                {name === 'Historian' && details.effective_age != null && (
                                    <div className={styles.ovDetails}>
                                        <span>📅 Efektivní věk: {details.effective_age} let</span>
                                        {agent.result?.category && <span>Kategorie: {agent.result.category}</span>}
                                    </div>
                                )}
                                {name === 'Inspector' && agent.result?.score != null && (
                                    <div className={styles.ovDetails}>
                                        <span>⭐ Skóre stavu: {agent.result.score}/100</span>
                                    </div>
                                )}
                                {name === 'GeoValidator' && details.visual_comparison && (
                                    <div className={styles.ovDetails}>
                                        <span>🗺️ Shoda panorama: {Math.round(details.visual_comparison.confidence * 100)}%</span>
                                    </div>
                                )}

                                {warnings.length > 0 && (
                                    <div className={styles.ovWarnings}>
                                        {warnings.slice(0, 2).map((w: string, i: number) => (
                                            <div key={i} className={styles.ovWarnLine}>⚠️ {w}</div>
                                        ))}
                                        {warnings.length > 2 && (
                                            <div className={styles.ovWarnLine}>+{warnings.length - 2} dalších varování</div>
                                        )}
                                    </div>
                                )}

                                {agent.elapsed_time != null && (
                                    <span className={styles.ovTime}>{agent.elapsed_time.toFixed(1)}s</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* ── Visual Comparison (GeoValidator) ── */}
                {(() => {
                    const geoAgent = agents['GeoValidator'];
                    const geoDetails = geoAgent?.result?.details;
                    const cmp = geoDetails?.visual_comparison;
                    const panoramaUrl = geoDetails?.panorama_url;
                    const frontPhotoId = geoDetails?.front_photo_id;

                    // Find the front photo path from the pipeline result images
                    const allImages = Object.values(agents).flatMap(
                        (a: any) => a?.result?.details?.classifications || []
                    );

                    if (!cmp || !panoramaUrl) return null;

                    const verdictColor = cmp.match_verdict === 'shoda'
                        ? '#10b981'
                        : cmp.match_verdict === 'neshoda'
                            ? '#ef4444'
                            : '#f59e0b';

                    const verdictLabel = cmp.match_verdict === 'shoda'
                        ? '✓ Shoda'
                        : cmp.match_verdict === 'neshoda'
                            ? '✗ Neshoda'
                            : '⚠ Možná shoda';

                    return (
                        <div className={styles.comparisonCard}>
                            <div className={styles.comparisonHeader}>
                                <h3 className={styles.comparisonTitle}>
                                    📍 Vizuální porovnání s panoramou
                                </h3>
                                <span
                                    className={styles.comparisonVerdictBadge}
                                    style={{ background: `${verdictColor}22`, color: verdictColor, borderColor: `${verdictColor}44` }}
                                >
                                    {verdictLabel}
                                    {cmp.confidence != null && (
                                        <span className={styles.confidenceTag}>
                                            {Math.round(cmp.confidence * 100)}%
                                        </span>
                                    )}
                                </span>
                            </div>

                            <div className={styles.comparisonImages}>
                                {frontPhotoId && (
                                    <div className={styles.comparisonImgWrap}>
                                        <span className={styles.imgLabel}>Nahrané foto</span>
                                        <div className={styles.imgFrame}>
                                            <img
                                                src={`${API_BASE}/uploads/${result.session_id}/${frontPhotoId}.jpg`}
                                                alt="Nahrané foto"
                                                className={styles.comparisonImg}
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        </div>
                                    </div>
                                )}
                                <div className={styles.comparisonImgWrap}>
                                    <span className={styles.imgLabel}>Panorama – Mapy.cz</span>
                                    <div className={styles.imgFrame}>
                                        <img
                                            src={`${API_BASE}${panoramaUrl}`}
                                            alt="Panorama z Mapy.cz"
                                            className={styles.comparisonImg}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className={styles.comparisonText}>
                                <p>{cmp.comparison_text}</p>
                            </div>

                            {(cmp.matching_features?.length > 0 || cmp.differing_features?.length > 0) && (
                                <div className={styles.featureGrid}>
                                    {cmp.matching_features?.length > 0 && (
                                        <div className={styles.featureCol}>
                                            <span className={styles.featureLabel}>✓ Shodné prvky</span>
                                            {cmp.matching_features.map((f: string, i: number) => (
                                                <span key={i} className={styles.featureTag + ' ' + styles.featureMatch}>{f}</span>
                                            ))}
                                        </div>
                                    )}
                                    {cmp.differing_features?.length > 0 && (
                                        <div className={styles.featureCol}>
                                            <span className={styles.featureLabel}>✗ Odlišné prvky</span>
                                            {cmp.differing_features.map((f: string, i: number) => (
                                                <span key={i} className={styles.featureTag + ' ' + styles.featureDiff}>{f}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {cmp.notes && (
                                <p className={styles.comparisonNote}>
                                    💡 {cmp.notes}
                                </p>
                            )}
                        </div>
                    );
                })()}

                {/* ── Document Comparator Results ── */}
                {(() => {
                    const docAgent = agents['DocumentComparator'];
                    const docDetails = docAgent?.result?.details;
                    if (!docDetails || docDetails.skipped) return null;

                    const verdict = docDetails.verdict || 'UNKNOWN';
                    const confidence = docDetails.confidence || 0;
                    const checks = docDetails.checks || [];
                    const recommendations = docDetails.recommendations || [];
                    const overallSummary = docDetails.overall_summary || '';
                    const propData = docDetails.property_data || {};

                    const verdictColor = verdict === 'SHODA'
                        ? '#10b981'
                        : verdict === 'NESHODA'
                            ? '#ef4444'
                            : '#f59e0b';

                    const verdictLabel = verdict === 'SHODA'
                        ? '✓ Shoda'
                        : verdict === 'NESHODA'
                            ? '✗ Neshoda'
                            : '⚠ Částečná shoda';

                    return (
                        <div className={styles.comparisonCard}>
                            <div className={styles.comparisonHeader}>
                                <h3 className={styles.comparisonTitle}>
                                    📄 Porovnání PDF formuláře s fotodokumentací
                                </h3>
                                <span
                                    className={styles.comparisonVerdictBadge}
                                    style={{ background: `${verdictColor}22`, color: verdictColor, borderColor: `${verdictColor}44` }}
                                >
                                    {verdictLabel}
                                    <span className={styles.confidenceTag}>
                                        {Math.round(confidence * 100)}%
                                    </span>
                                </span>
                            </div>

                            {/* Property data summary */}
                            {Object.keys(propData).length > 0 && (
                                <div className={styles.techDataSummary}>
                                    <h4 className={styles.techDataTitle}>📋 Technická data z formuláře</h4>
                                    <div className={styles.techDataGrid}>
                                        {propData.year_built && (
                                            <div className={styles.techDataItem}>
                                                <span className={styles.techDataLabel}>Rok dokončení</span>
                                                <span className={styles.techDataValue}>{propData.year_built}</span>
                                            </div>
                                        )}
                                        {propData.floor_count && (
                                            <div className={styles.techDataItem}>
                                                <span className={styles.techDataLabel}>Počet podlaží</span>
                                                <span className={styles.techDataValue}>{propData.floor_count}</span>
                                            </div>
                                        )}
                                        {propData.total_floor_area && (
                                            <div className={styles.techDataItem}>
                                                <span className={styles.techDataLabel}>Celk. podl. plocha</span>
                                                <span className={styles.techDataValue}>{propData.total_floor_area} m²</span>
                                            </div>
                                        )}
                                        {propData.roof_type && (
                                            <div className={styles.techDataItem}>
                                                <span className={styles.techDataLabel}>Typ střechy</span>
                                                <span className={styles.techDataValue}>{propData.roof_type}</span>
                                            </div>
                                        )}
                                        {propData.condition && (
                                            <div className={styles.techDataItem}>
                                                <span className={styles.techDataLabel}>Stav</span>
                                                <span className={styles.techDataValue}>{propData.condition}</span>
                                            </div>
                                        )}
                                        {propData.basement && (
                                            <div className={styles.techDataItem}>
                                                <span className={styles.techDataLabel}>Podsklepení</span>
                                                <span className={styles.techDataValue}>{propData.basement}</span>
                                            </div>
                                        )}
                                        {propData.heating && (
                                            <div className={styles.techDataItem}>
                                                <span className={styles.techDataLabel}>Vytápění</span>
                                                <span className={styles.techDataValue}>{propData.heating}</span>
                                            </div>
                                        )}
                                        {propData.property_address && (
                                            <div className={styles.techDataItem}>
                                                <span className={styles.techDataLabel}>Adresa</span>
                                                <span className={styles.techDataValue}>{propData.property_address}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {overallSummary && (
                                <div className={styles.comparisonText}>
                                    <p>{overallSummary}</p>
                                </div>
                            )}

                            {/* Checks table */}
                            {checks.length > 0 && (
                                <div className={styles.checksTable}>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Parametr</th>
                                                <th>Formulář</th>
                                                <th>Z fotek</th>
                                                <th>Shoda</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {checks.map((c: any, i: number) => (
                                                <tr key={i} className={c.match ? styles.checkMatch : styles.checkMismatch}>
                                                    <td className={styles.checkField}>{c.field}</td>
                                                    <td>{c.declared || '–'}</td>
                                                    <td>{c.observed || '–'}</td>
                                                    <td>
                                                        <span className={c.match ? styles.checkYes : styles.checkNo}>
                                                            {c.match ? '✓' : '✗'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {checks.some((c: any) => c.note) && (
                                        <div className={styles.checkNotes}>
                                            {checks.filter((c: any) => c.note).map((c: any, i: number) => (
                                                <div key={i} className={styles.checkNote}>
                                                    <strong>{c.field}:</strong> {c.note}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {recommendations.length > 0 && (
                                <div className={styles.comparisonNote}>
                                    <strong>💡 Doporučení:</strong>
                                    <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                                        {recommendations.map((r: string, i: number) => (
                                            <li key={i} style={{ fontSize: '13px', marginBottom: '4px' }}>{r}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* ── Detailed View Toggle ── */}
                <button
                    className={styles.detailsToggle}
                    onClick={() => setShowDetails(!showDetails)}
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transform: showDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {showDetails ? 'Skrýt podrobnosti' : 'Zobrazit podrobnosti'}
                </button>

                {showDetails && (
                    <div className={styles.detailsSection}>
                        {['Guardian', 'Forensic', 'Historian', 'Inspector', 'GeoValidator', 'DocumentComparator', 'Strategist'].map(name => {
                            const agent = agents[name];
                            if (!agent?.result) return null;
                            const meta = AGENT_META[name];

                            return (
                                <div key={name} className={styles.detailCard}>
                                    <div className={styles.detailHeader}>
                                        <div className={styles.detailLeft}>
                                            <span>{meta.icon}</span>
                                            <h4>{meta.label}</h4>
                                        </div>
                                        <span className={`${styles.detailStatus} status-${agent.result.status}`}>
                                            {agent.result.status === 'success' ? '✓ PASS' : agent.result.status === 'fail' ? '✕ FAIL' : '⚠ WARN'}
                                        </span>
                                    </div>

                                    <p className={styles.detailSummary}>{agent.result.summary}</p>

                                    {agent.result.warnings.length > 0 && (
                                        <div className={styles.detailWarnings}>
                                            {agent.result.warnings.map((w, i) => (
                                                <div key={i} className={styles.warnLine}>⚠️ {w}</div>
                                            ))}
                                        </div>
                                    )}

                                    {agent.result.errors.length > 0 && (
                                        <div className={styles.detailErrors}>
                                            {agent.result.errors.map((e, i) => (
                                                <div key={i} className={styles.errLine}>❌ {e}</div>
                                            ))}
                                        </div>
                                    )}

                                    {agent.result.details && name !== 'Strategist' && (
                                        <details className={styles.rawDetails}>
                                            <summary className={styles.rawToggle}>Technická data</summary>
                                            <pre className={styles.rawJson}>
                                                {JSON.stringify(agent.result.details, null, 2)}
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Action ── */}
                <div className={styles.actions}>
                    <button className="btn btn-primary" onClick={onReset}>
                        Nová analýza
                    </button>
                </div>
            </div>
        </section>
    );
}
