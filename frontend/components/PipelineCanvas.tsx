'use client';
import { useState, useEffect, useRef } from 'react';
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
    onEdit: () => void;
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
    idle: 'ČEKÁ',
    queued: 'VE FRONTĚ',
    processing: 'ZPRACOVÁVÁ',
    success: 'HOTOVO',
    fail: 'CHYBA',
    warn: 'UPOZORNĚNÍ',
};

export default function PipelineCanvas({
    sessionId,
    agentStatuses,
    agentLogs,
    isRunning,
    onStart,
    onEdit,
    uploadData,
}: Props) {
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
    const [started, setStarted] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [simulatedIdx, setSimulatedIdx] = useState(-1);
    const startTimeRef = useRef<number | null>(null);

    // Timer — starts immediately on click, independent of WebSocket
    useEffect(() => {
        if (!started) return;
        startTimeRef.current = Date.now();
        const timer = setInterval(() => {
            if (startTimeRef.current) {
                setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }
        }, 100);
        return () => clearInterval(timer);
    }, [started]);

    // Simulate agent progression if WebSocket isn't delivering statuses
    useEffect(() => {
        if (!started) return;
        // Check if we have any WS statuses at all
        const hasWsStatuses = Object.values(agentStatuses).some(s => s !== 'idle');
        if (hasWsStatuses) {
            setSimulatedIdx(-1); // WS is working, don't simulate
            return;
        }
        // No WS statuses — simulate progression
        const interval = setInterval(() => {
            setSimulatedIdx(prev => {
                if (prev >= AGENTS_CONFIG.length - 1) {
                    clearInterval(interval);
                    return prev;
                }
                return prev + 1;
            });
        }, 8000); // Estimate ~8s per agent
        // Start first agent immediately
        setSimulatedIdx(0);
        return () => clearInterval(interval);
    }, [started, agentStatuses]);

    const handleStart = () => {
        setStarted(true);
        setElapsed(0);
        onStart();
    };

    // Merge WS statuses with simulated ones
    const getEffectiveStatus = (name: string, idx: number): string => {
        const wsStatus = agentStatuses[name];
        if (wsStatus && wsStatus !== 'idle') return wsStatus;
        if (!started) return 'idle';
        if (simulatedIdx < 0) return wsStatus || 'idle'; // WS is active
        // Simulated
        if (idx < simulatedIdx) return 'success';
        if (idx === simulatedIdx) return 'processing';
        return 'queued';
    };

    const completedCount = AGENTS_CONFIG.filter((a, i) => {
        const s = getEffectiveStatus(a.name, i);
        return ['success', 'fail', 'warn'].includes(s);
    }).length;

    const processingAgent = AGENTS_CONFIG.find((a, i) =>
        getEffectiveStatus(a.name, i) === 'processing'
    );

    const allDone = completedCount >= AGENTS_CONFIG.length;

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
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    className="btn"
                                    onClick={onEdit}
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <path d="M10 2L13 5L5 13H2V10L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    Upravit vstup
                                </button>
                                <button className="btn btn-primary" onClick={handleStart}>
                                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                        <path d="M4 2.5L15 9L4 15.5V2.5Z" fill="currentColor" />
                                    </svg>
                                    Spustit analýzu
                                </button>
                            </div>
                        )}
                        {started && !allDone && (
                            <div className={styles.runningBadge}>
                                <span className={styles.runningDot} />
                                Analýza probíhá...
                            </div>
                        )}
                        {started && allDone && (
                            <div className={styles.runningBadge} style={{ borderColor: 'rgba(5,150,105,0.4)', color: 'var(--accent-green)', background: 'rgba(5,150,105,0.08)' }}>
                                ✓ Dokončeno
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
                        <span className={styles.currentDots}>
                            <span className={styles.dot1}>.</span>
                            <span className={styles.dot2}>.</span>
                            <span className={styles.dot3}>.</span>
                        </span>
                    </div>
                )}

                {/* Agents Grid */}
                <div className={styles.agentsGrid}>
                    {AGENTS_CONFIG.map((agent, idx) => {
                        const status = getEffectiveStatus(agent.name, idx);
                        const isProcessing = status === 'processing';
                        const isDone = ['success', 'fail', 'warn'].includes(status);
                        const isQueued = status === 'queued';
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
                                {/* Order number / status icon */}
                                <div className={styles.rowOrder}>
                                    {isDone ? (
                                        status === 'success' ? (
                                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                                <circle cx="10" cy="10" r="9" fill="rgba(5,150,105,0.15)" />
                                                <path d="M6 10.5L8.5 13L14 7" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        ) : status === 'fail' ? (
                                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                                <circle cx="10" cy="10" r="9" fill="rgba(220,38,38,0.15)" />
                                                <path d="M7 7L13 13M13 7L7 13" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" />
                                            </svg>
                                        ) : (
                                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                                <circle cx="10" cy="10" r="9" fill="rgba(217,119,6,0.15)" />
                                                <path d="M10 6V11M10 13.5V14" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" />
                                            </svg>
                                        )
                                    ) : isProcessing ? (
                                        <div className={styles.rowSpinner}>
                                            <svg viewBox="0 0 20 20" width="20" height="20">
                                                <circle cx="10" cy="10" r="8" stroke="rgba(255,255,255,0.08)" strokeWidth="2" fill="none" />
                                                <circle cx="10" cy="10" r="8" stroke={agent.color} strokeWidth="2" fill="none"
                                                    strokeDasharray="25 26" strokeLinecap="round" />
                                            </svg>
                                        </div>
                                    ) : (
                                        <span className={`${styles.rowNum} ${isQueued ? styles.rowNumQueued : ''}`}>{idx + 1}</span>
                                    )}
                                </div>

                                {/* Icon */}
                                <div className={`${styles.rowIcon} ${isProcessing ? styles.rowIconPulse : ''}`}
                                    style={{ background: `${agent.color}${isProcessing ? '25' : '15'}`, color: agent.color }}>
                                    {agent.icon}
                                </div>

                                {/* Info */}
                                <div className={styles.rowInfo}>
                                    <div className={styles.rowName}>{agent.label}</div>
                                    <div className={styles.rowDesc}>
                                        {isProcessing && lastLog ? lastLog.message?.substring(0, 60)
                                            : isProcessing ? 'Analyzuji...'
                                                : agent.description}
                                    </div>
                                </div>

                                {/* Status */}
                                <div className={`${styles.rowStatus} ${styles[`status_${status}`]}`}>
                                    {STATUS_LABELS[status] || status}
                                </div>

                                {/* Processing bar at bottom */}
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
