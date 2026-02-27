'use client';
import { useState } from 'react';
import styles from './ResultsDashboard.module.css';
import type { PipelineResult } from '@/lib/api';
import { API_BASE } from '@/lib/api';

interface Props {
    result: PipelineResult;
    onReset: () => void;
    onEdit: () => void;
}

const AGENT_META: Record<string, { icon: string; label: string; color: string }> = {
    Strazce: { icon: '🛡️', label: 'Fotodokumentace', color: '#3b82f6' },
    ForenzniAnalytik: { icon: '🔬', label: 'Autenticita fotek', color: '#8b5cf6' },
    Historik: { icon: '📜', label: 'Věk nemovitosti', color: '#06b6d4' },
    Inspektor: { icon: '🔍', label: 'Technický stav', color: '#f59e0b' },
    GeoValidator: { icon: '📍', label: 'Ověření lokace', color: '#ec4899' },
    PorovnavacDokumentu: { icon: '📄', label: 'PDF vs Fotky', color: '#f97316' },
    KatastralniAnalytik: { icon: '🏛️', label: 'Katastr & LV', color: '#7c3aed' },
    Strateg: { icon: '🎯', label: 'Závěrečné hodnocení', color: '#10b981' },
};

export default function ResultsDashboard({ result, onReset, onEdit }: Props) {
    const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

    const semaphore = result.semaphore || 'UNKNOWN';
    const semaphoreColor = result.semaphore_color || 'gray';
    const finalCategory = result.final_category;
    const agents = result.agents || {};
    const strategist = agents['Strateg'];
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

                {/* ── Order 1: Verdict Header (KEPT AS IS) ── */}
                {/* ── Order 2: Visual Comparison (GeoValidator) ── */}
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

                {/* ── Order 3: Photo Completeness (Strazce) ── */}
                {(() => {
                    const guardAgent = agents['Strazce'];
                    const guardDetails = guardAgent?.result?.details;
                    if (!guardDetails) return null;

                    const missing = guardDetails.missing_views || [];
                    const classData = guardDetails.classifications || [];
                    const statusColor = missing.length === 0 ? '#10b981' : (guardAgent.result?.status === 'fail' ? '#ef4444' : '#f59e0b');
                    const statusIcon = missing.length === 0 ? '✓' : (guardAgent.result?.status === 'fail' ? '✗' : '⚠');
                    const statusText = missing.length === 0 ? 'Kompletní' : 'Neúplné';

                    return (
                        <div className={styles.comparisonCard}>
                            <div className={styles.comparisonHeader}>
                                <h3 className={styles.comparisonTitle}>
                                    📸 Kompletnost fotodokumentace
                                </h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                        {Object.keys(classData).length} fotek klasifikováno
                                    </span>
                                    <span
                                        className={styles.comparisonVerdictBadge}
                                        style={{ background: `${statusColor}22`, color: statusColor, borderColor: `${statusColor}44` }}
                                    >
                                        {statusIcon} {statusText}
                                    </span>
                                </div>
                            </div>

                            <div className={styles.comparisonText} style={{ marginBottom: '16px' }}>
                                {guardAgent.result?.summary}
                            </div>

                            {missing.length > 0 && (
                                <div style={{
                                    padding: '12px 16px',
                                    background: 'var(--accent-orange-light)',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                    borderRadius: '8px',
                                    marginBottom: '16px'
                                }}>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-orange)', marginBottom: '4px' }}>
                                        Chybějící fotodokumentace:
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {missing.map((m: string, i: number) => (
                                            <span key={i} style={{
                                                fontSize: '12px',
                                                padding: '4px 10px',
                                                background: '#fff',
                                                border: '1px solid rgba(245, 158, 11, 0.5)',
                                                borderRadius: '100px',
                                                color: 'var(--accent-orange)',
                                                fontWeight: 500
                                            }}>{m}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* ── Order 4: Property Condition (Inspektor) ── */}
                {(() => {
                    const inspAgent = agents['Inspektor'];
                    const inspDetails = inspAgent?.result?.details;
                    if (!inspDetails) return null;

                    const score = inspAgent.result?.score || 0;
                    const scoreColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

                    return (
                        <div className={styles.comparisonCard}>
                            <div className={styles.comparisonHeader} style={{ marginBottom: '8px' }}>
                                <h3 className={styles.comparisonTitle}>
                                    🔍 Stav nemovitosti a vhodnost pro online ocenění
                                </h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                        Skóre stavu:
                                    </span>
                                    <span style={{
                                        fontWeight: 800,
                                        fontSize: '20px',
                                        color: scoreColor,
                                        background: `${scoreColor}15`,
                                        padding: '4px 12px',
                                        borderRadius: '8px'
                                    }}>
                                        {score}/100
                                    </span>
                                </div>
                            </div>

                            <div className={styles.comparisonText} style={{ marginBottom: '16px' }}>
                                <strong>Vizuální hodnocení:</strong> {inspAgent.result?.summary}
                            </div>

                            {inspDetails.overall_condition && (
                                <div style={{
                                    padding: '16px',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '8px',
                                    borderLeft: '4px solid var(--accent-blue)',
                                    marginBottom: '16px'
                                }}>
                                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                                        {inspDetails.overall_condition}
                                    </p>
                                </div>
                            )}

                            {inspDetails.defects && inspDetails.defects.length > 0 && (
                                <div className={styles.featureCol}>
                                    <span className={styles.featureLabel}>Zjištěné vady a nedostatky</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {inspDetails.defects.map((f: string, i: number) => (
                                            <span key={i} className={styles.featureTag + ' ' + styles.featureDiff}>{f}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* ── Order 5: Document Comparator Results (MOVED UP) ── */}

                {/* ── Order 6: KatastralniAnalytik: Ortofoto + Risks (MOVED UP) ── */}
                {(() => {
                    const cadAgent = agents['KatastralniAnalytik'];
                    const cadDetails = cadAgent?.result?.details;
                    if (!cadDetails || cadDetails.skipped) return null;

                    const ortofotoUrl = cadDetails.ortofoto_annotated_url || cadDetails.ortofoto_url;
                    const originalUrl = cadDetails.ortofoto_url;
                    const risks = cadDetails.risks || [];
                    const analysis = cadDetails.ortofoto_analysis;
                    const lvData = cadDetails.lv_data;

                    const riskColors: Record<string, string> = {
                        'vysoké': '#ef4444',
                        'střední': '#f59e0b',
                        'nízké': '#22c55e',
                    };

                    return (
                        <div className={styles.comparisonCard}>
                            <div className={styles.comparisonHeader}>
                                <h3 className={styles.comparisonTitle}>
                                    🏛️ Katastr & LV — ortofoto funkčního celku
                                </h3>
                                {lvData && (
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        LV {lvData.lv_number} · k.ú. {lvData.kat_uzemi_nazev}
                                    </span>
                                )}
                            </div>

                            {/* Ortofoto image */}
                            {ortofotoUrl && (
                                <div style={{ margin: '16px 0' }}>
                                    <div style={{
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '12px',
                                        overflow: 'hidden',
                                        background: 'var(--bg-secondary)',
                                    }}>
                                        <img
                                            src={`${API_BASE}${ortofotoUrl}`}
                                            alt="Ortofoto funkčního celku"
                                            style={{ width: '100%', display: 'block' }}
                                            onError={(e) => {
                                                // Fallback to original if annotated fails
                                                if (originalUrl && (e.target as HTMLImageElement).src.includes('annotated')) {
                                                    (e.target as HTMLImageElement).src = `${API_BASE}${originalUrl}`;
                                                }
                                            }}
                                        />
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'center' }}>
                                        Ortofoto ČÚZK — {cadDetails.ortofoto_annotated_url ? 'se zvýrazněnými stavbami' : 'funkční celek'}
                                    </div>
                                </div>
                            )}

                            {/* Overall assessment from AI */}
                            {analysis?.overall_assessment && (
                                <div className={styles.comparisonText}>
                                    <p>{analysis.overall_assessment}</p>
                                </div>
                            )}

                            {/* LV Risk summary */}
                            {cadDetails.lv_risk_summary && (
                                <div className={styles.comparisonText} style={{ marginTop: '8px' }}>
                                    <p>📋 {cadDetails.lv_risk_summary}</p>
                                </div>
                            )}

                            {/* Access assessment */}
                            {cadDetails.access_assessment && (() => {
                                const access = cadDetails.access_assessment;
                                const aColor = access.status === 'zajištěný' ? '#22c55e'
                                    : access.status === 'nezajištěný' ? '#ef4444' : '#f59e0b';
                                const aIcon = access.status === 'zajištěný' ? '✓'
                                    : access.status === 'nezajištěný' ? '✗' : '?';
                                return (
                                    <div style={{
                                        marginTop: '10px',
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        border: `1px solid ${aColor}33`,
                                        background: `${aColor}08`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                    }}>
                                        <span style={{
                                            fontSize: '16px',
                                            fontWeight: 700,
                                            color: aColor,
                                            width: '24px',
                                            textAlign: 'center',
                                        }}>{aIcon}</span>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: aColor }}>
                                                Přístup k nemovitosti: {access.status}
                                            </div>
                                            {access.reason && (
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    {access.reason}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Risks table */}
                            {risks.length > 0 && (
                                <div style={{ marginTop: '16px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                                        Nalezená rizika
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {risks.map((r: any, i: number) => (
                                            <div key={i} style={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: '10px',
                                                padding: '10px 12px',
                                                background: 'var(--bg-secondary)',
                                                border: `1px solid ${riskColors[r.severity] || '#ccc'}44`,
                                                borderRadius: '8px',
                                            }}>
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    padding: '2px 8px',
                                                    borderRadius: '128px',
                                                    background: `${riskColors[r.severity] || '#ccc'}15`,
                                                    color: riskColors[r.severity] || '#666',
                                                    textTransform: 'uppercase',
                                                    whiteSpace: 'nowrap',
                                                    flexShrink: 0,
                                                }}>
                                                    {r.severity}
                                                </span>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                                                        {r.description}
                                                    </div>
                                                    {r.recommendation && (
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                            💡 {r.recommendation}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {risks.length === 0 && !cadDetails.skipped && (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '16px',
                                    color: '#22c55e',
                                    fontSize: '14px',
                                }}>
                                    ✓ Žádná rizika v katastru nezjištěna
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* ── Order 7: Summary Report (MOVED DOWN) ── */}
                <div className={styles.reportCard}>
                    <div className={styles.reportHeader}>
                        <h3 className={styles.reportTitle}>Souhrnná zpráva</h3>
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

                {/* ── Order 8: Agent Results Grid (MOVED DOWN) ── */}
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '32px 0 16px', color: 'var(--text-primary)' }}>
                    Výsledky jednotlivých agentů
                </h3>
                <div className={styles.overviewGrid}>
                    {['Strazce', 'ForenzniAnalytik', 'Historik', 'Inspektor', 'GeoValidator', 'PorovnavacDokumentu', 'KatastralniAnalytik'].map(name => {
                        const agent = agents[name];
                        if (!agent) return null;
                        const meta = AGENT_META[name];
                        const badge = getStatusBadge(agent.result?.status || 'idle');
                        const details = agent.result?.details || {};
                        const warnings = agent.result?.warnings || [];
                        const isExpanded = expandedAgent === name;

                        return (
                            <div
                                key={name}
                                className={`${styles.overviewCard} ${styles[`ov_${agent.result?.status}`]} ${isExpanded ? styles.ovExpanded : ''}`}
                                onClick={() => setExpandedAgent(isExpanded ? null : name)}
                            >
                                <div className={styles.ovHeader}>
                                    <span className={styles.ovIcon}>{meta.icon}</span>
                                    <span className={`${styles.ovBadge} ${styles[badge.class]}`}>{badge.text}</span>
                                </div>
                                <h4 className={styles.ovTitle}>{meta.label}</h4>
                                <p className={styles.ovSummary}>
                                    {agent.result?.summary || '–'}
                                </p>

                                {/* Key details per agent */}
                                {name === 'Strazce' && details.classifications && (
                                    <div className={styles.ovDetails}>
                                        <span>📸 {Object.keys(details.classifications).length} fotek klasifikováno</span>
                                    </div>
                                )}
                                {name === 'Historik' && details.effective_age != null && (
                                    <div className={styles.ovDetails}>
                                        <span>📅 Efektivní věk: {details.effective_age} let</span>
                                        {agent.result?.category && <span>Kategorie: {agent.result.category}</span>}
                                    </div>
                                )}
                                {name === 'Inspektor' && details.verdikt && (
                                    <div className={styles.ovDetails}>
                                        <span>🔍 Online ocenění: {details.verdikt}</span>
                                    </div>
                                )}
                                {name === 'GeoValidator' && details.visual_comparison && (
                                    <div className={styles.ovDetails}>
                                        <span>🗺️ Shoda panorama: {Math.round(details.visual_comparison.confidence * 100)}%</span>
                                    </div>
                                )}
                                {name === 'KatastralniAnalytik' && details.risks && (
                                    <div className={styles.ovDetails}>
                                        <span>📋 {details.risks.length} rizik(a) nalezeno</span>
                                        {details.ortofoto_url && <span>🛰️ Ortofoto staženo</span>}
                                    </div>
                                )}

                                {agent.elapsed_time != null && (
                                    <span className={styles.ovTime}>{agent.elapsed_time.toFixed(1)}s</span>
                                )}

                                {isExpanded && agent.result && (
                                    <div className={styles.ovExpandedRaw} onClick={(e) => e.stopPropagation()}>
                                        {agent.result.warnings?.length > 0 && (
                                            <div className={styles.detailWarnings} style={{ marginBottom: 12 }}>
                                                {agent.result.warnings.map((w: string, i: number) => (
                                                    <div key={i} className={styles.warnLine}>⚠️ {w}</div>
                                                ))}
                                            </div>
                                        )}
                                        {agent.result.errors?.length > 0 && (
                                            <div className={styles.detailErrors} style={{ marginBottom: 12 }}>
                                                {agent.result.errors.map((e: string, i: number) => (
                                                    <div key={i} className={styles.errLine}>❌ {e}</div>
                                                ))}
                                            </div>
                                        )}
                                        {agent.result.details && name !== 'Strateg' && (
                                            <details className={styles.rawDetails} open>
                                                <summary className={styles.rawToggle}>Technická data</summary>
                                                <pre className={styles.rawJson}>
                                                    {JSON.stringify(agent.result.details, null, 2)}
                                                </pre>
                                            </details>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {(() => {
                    const docAgent = agents['PorovnavacDokumentu'];
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



                <div className={styles.actions}>
                    <button
                        className="btn"
                        onClick={onEdit}
                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M10 2L13 5L5 13H2V10L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Upravit a spustit znovu
                    </button>
                    <button className="btn btn-primary" onClick={onReset}>
                        Nová analýza
                    </button>
                </div>
            </div>
        </section>
    );
}
