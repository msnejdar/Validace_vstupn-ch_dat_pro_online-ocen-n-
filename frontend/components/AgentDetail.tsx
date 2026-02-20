'use client';
import { useState, useRef, useEffect } from 'react';
import styles from './AgentDetail.module.css';
import type { WSMessage } from '@/hooks/useWebSocket';
import { updateAgentPrompt } from '@/lib/api';

interface AgentConfig {
    name: string;
    label: string;
    description: string;
    icon: string;
    color: string;
}

interface Props {
    name: string;
    config: AgentConfig;
    status: string;
    logs: WSMessage[];
    onClose: () => void;
    sessionId: string;
}

export default function AgentDetail({ name, config, status, logs, onClose, sessionId }: Props) {
    const [activeTab, setActiveTab] = useState<'logs' | 'prompt'>('logs');
    const [prompt, setPrompt] = useState('');
    const [saving, setSaving] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logs
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleSavePrompt = async () => {
        setSaving(true);
        try {
            await updateAgentPrompt(sessionId, name, prompt);
        } catch (e) {
            console.error(e);
        }
        setSaving(false);
    };

    const getStatusText = () => {
        switch (status) {
            case 'idle': return 'Čeká';
            case 'processing': return 'Zpracovává...';
            case 'success': return 'Úspěch';
            case 'fail': return 'Selhání';
            case 'warn': return 'Varování';
            default: return status;
        }
    };

    const formatTime = (ts: number) => {
        const d = new Date(ts * 1000);
        return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.headerIcon} style={{ background: `${config.color}15`, color: config.color }}>
                            {config.icon}
                        </div>
                        <div>
                            <h2 className={styles.headerTitle}>{config.label}</h2>
                            <p className={styles.headerDesc}>{config.description}</p>
                        </div>
                    </div>
                    <div className={styles.headerRight}>
                        <div className={`${styles.statusBadge} ${styles[`badge_${status}`]}`}>
                            <span className={`status-dot ${status}`} />
                            <span>{getStatusText()}</span>
                        </div>
                        <button className={styles.closeBtn} onClick={onClose}>✕</button>
                    </div>
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'logs' ? styles.tabActive : ''}`}
                        onClick={() => setActiveTab('logs')}
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2 3H12M2 7H9M2 11H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        Logy ({logs.length})
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'prompt' ? styles.tabActive : ''}`}
                        onClick={() => setActiveTab('prompt')}
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        System Prompt
                    </button>
                </div>

                {/* Content */}
                <div className={styles.content}>
                    {activeTab === 'logs' && (
                        <div className={styles.logsContainer}>
                            {logs.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <span className={styles.emptyIcon}>📋</span>
                                    <p>Zatím žádné logy</p>
                                    <p className={styles.emptyHint}>Logy se zobrazí po spuštění pipeline</p>
                                </div>
                            ) : (
                                <div className={styles.logsList}>
                                    {logs.map((log, i) => (
                                        <div
                                            key={i}
                                            className={`${styles.logEntry} ${styles[`log_${log.level}`]}`}
                                        >
                                            <span className={styles.logTime}>{formatTime(log.timestamp || 0)}</span>
                                            <span className={`${styles.logLevel} status-${log.level === 'error' ? 'fail' : log.level === 'warn' ? 'warn' : log.level === 'thinking' ? 'processing' : 'success'}`}>
                                                {log.level === 'thinking' ? '🧠' : log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : '✓'}
                                            </span>
                                            <span className={styles.logMessage}>{log.message}</span>
                                        </div>
                                    ))}
                                    <div ref={logsEndRef} />
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'prompt' && (
                        <div className={styles.promptContainer}>
                            <p className={styles.promptHint}>
                                Upravte system prompt agenta pro přizpůsobení jeho chování.
                            </p>
                            <textarea
                                className={styles.promptEditor}
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Zadejte system prompt pro tohoto agenta..."
                                rows={12}
                            />
                            <div className={styles.promptActions}>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSavePrompt}
                                    disabled={saving || !prompt.trim()}
                                >
                                    {saving ? 'Ukládám...' : 'Uložit Prompt'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
