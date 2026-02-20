'use client';
import { useState, useEffect } from 'react';
import styles from './PipelineCanvas.module.css';
import AgentDetail from './AgentDetail';
import type { UploadResponse } from '@/lib/api';
import type { WSMessage } from '@/hooks/useWebSocket';

interface Props {
    sessionId: string;
    agentStatuses: Record<string, string>;
    agentLogs: Record<string, WSMessage[]>;
    isRunning: boolean;
    onStart: () => void;
    uploadData: UploadResponse | null;
}

const AGENTS_CONFIG = [
    {
        name: 'Guardian',
        label: 'Guardian',
        description: 'Kontrola úplnosti fotodokumentace (BR-G4)',
        icon: '🛡️',
        color: '#1e6fd9',
    },
    {
        name: 'Forensic',
        label: 'Forensic',
        description: 'Detekce manipulace a úprav fotografií',
        icon: '🔬',
        color: '#6366f1',
    },
    {
        name: 'Historian',
        label: 'Historian',
        description: 'Určení věku a kategorizace nemovitosti',
        icon: '📜',
        color: '#0891b2',
    },
    {
        name: 'Inspector',
        label: 'Inspector',
        description: 'Hodnocení technického stavu objektu',
        icon: '🔍',
        color: '#d97706',
    },
    {
        name: 'GeoValidator',
        label: 'GeoValidator',
        description: 'Ověření GPS lokace (Mapy.cz panorama)',
        icon: '📍',
        color: '#db2777',
    },
    {
        name: 'DocumentComparator',
        label: 'DocComparator',
        description: 'Porovnání dat z formuláře vs fotky',
        icon: '📄',
        color: '#ea580c',
    },
    {
        name: 'Strategist',
        label: 'Strategist',
        description: 'Agregace výsledků a finální verdikt',
        icon: '🎯',
        color: '#059669',
    },
];

const STATUS_LABELS: Record<string, string> = {
    idle: 'Čeká',
    processing: 'Zpracovává se',
    success: 'Hotovo',
    fail: 'Chyba',
    warn: 'Upozornění',
};

export default function PipelineCanvas({
    sessionId,
    agentStatuses,
    agentLogs,
    isRunning,
    onStart,
    uploadData,
}: Props) {
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
    const [started, setStarted] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    // Timer
    useEffect(() => {
        if (!isRunning) return;
        const timer = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => clearInterval(timer);
    }, [isRunning]);

    const handleStart = () => {
        setStarted(true);
        setElapsed(0);
        onStart();
    };

    const completedCount = AGENTS_CONFIG.filter(a =>
        ['success', 'fail', 'warn'].includes(agentStatuses[a.name] || '')
    ).length;

    const processingAgent = AGENTS_CONFIG.find(a => agentStatuses[a.name] === 'processing');

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
    };

    return (
        <section className={styles.section}>
            <div className={styles.container}>
                {/* Header */}
                <div className={styles.topBar}>
                    <div>
                        <h2 className={styles.title}>Validační agenti</h2>
                        <p className={styles.subtitle}>
                            {uploadData ? `${uploadData.files_processed} fotek` : 'Připraveno'} • Session {sessionId}
                        </p>
                    </div>
                    <div className={styles.topBarRight}>
                        {started && (
                            <div className={styles.progressInfo}>
                                <span className={styles.progressCounter}>{completedCount}/{AGENTS_CONFIG.length}</span>
                                <span className={styles.progressTime}>{formatTime(elapsed)}</span>
                            </div>
                        )}
                        {!started && (
                            <button className="btn btn-primary" onClick={handleStart}>
                                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                    <path d="M4 2.5L15 9L4 15.5V2.5Z" fill="currentColor" />
                                </svg>
                                Spustit analýzu
                            </button>
                        )}
                        {isRunning && (
                            <div className={styles.runningBadge}>
                                <span className={styles.runningDot} />
                                Analýza probíhá...
                            </div>
                        )}
                    </div>
                </div>

                {/* Global progress bar */}
                {started && (
                    <div className={styles.globalProgress}>
                        <div
                            className={styles.globalProgressFill}
                            style={{ width: `${(completedCount / AGENTS_CONFIG.length) * 100}%` }}
                        />
                    </div>
                )}

                {/* Currently processing indicator */}
                {processingAgent && (
                    <div className={styles.currentlyProcessing}>
                        <div className={styles.currentSpinner}>
                            <svg viewBox="0 0 24 24" width="20" height="20">
                                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" fill="none" />
                                <circle cx="12" cy="12" r="10" stroke={processingAgent.color} strokeWidth="2.5" fill="none"
                                    strokeDasharray="31 32" strokeLinecap="round" />
                            </svg>
                        </div>
                        <span className={styles.currentLabel}>
                            <span style={{ color: processingAgent.color }}>{processingAgent.icon}</span>
                            {' '}{processingAgent.label} – {processingAgent.description}
                        </span>
                    </div>
                )}

                {/* Agents Grid */}
                <div className={styles.agentsGrid}>
                    {AGENTS_CONFIG.map((agent, idx) => {
                        const status = agentStatuses[agent.name] || 'idle';
                        const isProcessing = status === 'processing';
                        const isDone = ['success', 'fail', 'warn'].includes(status);
                        const lastLog = (agentLogs[agent.name] || []).slice(-1)[0];

                        return (
                            <div
                                key={agent.name}
                                className={`${styles.agentRow} ${styles[`row_${status}`]} ${selectedAgent === agent.name ? styles.rowSelected : ''}`}
                                onClick={() => setSelectedAgent(agent.name)}
                                style={{
                                    animationDelay: `${idx * 50}ms`,
                                    '--agent-color': agent.color,
                                } as React.CSSProperties}
                            >
                                {/* Order number */}
                                <div className={styles.rowOrder}>
                                    {isDone ? (
                                        status === 'success' ? (
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                                <path d="M3 8.5L6.5 12L13 4" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        ) : status === 'fail' ? (
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                                <path d="M4 4L12 12M12 4L4 12" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" />
                                            </svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                                <path d="M8 4V9M8 11.5V12" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" />
                                            </svg>
                                        )
                                    ) : isProcessing ? (
                                        <div className={styles.rowSpinner}>
                                            <svg viewBox="0 0 18 18" width="16" height="16">
                                                <circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.1)" strokeWidth="2" fill="none" />
                                                <circle cx="9" cy="9" r="7" stroke={agent.color} strokeWidth="2" fill="none"
                                                    strokeDasharray="22 22" strokeLinecap="round" />
                                            </svg>
                                        </div>
                                    ) : (
                                        <span className={styles.rowNum}>{idx + 1}</span>
                                    )}
                                </div>

                                {/* Icon */}
                                <div className={styles.rowIcon} style={{ background: `${agent.color}15`, color: agent.color }}>
                                    {agent.icon}
                                </div>

                                {/* Info */}
                                <div className={styles.rowInfo}>
                                    <div className={styles.rowName}>{agent.label}</div>
                                    <div className={styles.rowDesc}>
                                        {isProcessing && lastLog ? lastLog.message?.substring(0, 60) : agent.description}
                                    </div>
                                </div>

                                {/* Status */}
                                <div className={`${styles.rowStatus} ${styles[`status_${status}`]}`}>
                                    {STATUS_LABELS[status] || status}
                                </div>

                                {/* Processing bar */}
                                {isProcessing && (
                                    <div className={styles.rowProgressBar}>
                                        <div className={styles.rowProgressFill} style={{ background: agent.color }} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Agent Detail Panel */}
            {selectedAgent && (
                <AgentDetail
                    name={selectedAgent}
                    config={AGENTS_CONFIG.find(a => a.name === selectedAgent)!}
                    status={agentStatuses[selectedAgent] || 'idle'}
                    logs={agentLogs[selectedAgent] || []}
                    onClose={() => setSelectedAgent(null)}
                    sessionId={sessionId}
                />
            )}
        </section>
    );
}
