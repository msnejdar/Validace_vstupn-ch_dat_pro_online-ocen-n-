'use client';
import styles from './AgentCard.module.css';
import type { WSMessage } from '@/hooks/useWebSocket';

interface Props {
    name: string;
    label: string;
    description: string;
    icon: string;
    color: string;
    status: string;
    logs: WSMessage[];
    position: { x: number; y: number };
    onClick: () => void;
    isSelected: boolean;
}

export default function AgentCard({
    name,
    label,
    description,
    icon,
    color,
    status,
    logs,
    position,
    onClick,
    isSelected,
}: Props) {
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;

    return (
        <div
            className={`${styles.card} ${styles[`status_${status}`]} ${isSelected ? styles.selected : ''}`}
            style={{
                left: position.x,
                top: position.y,
                '--agent-color': color,
                '--agent-color-glow': `${color}33`,
            } as React.CSSProperties}
            onClick={onClick}
        >
            {/* Processing ring animation */}
            {status === 'processing' && <div className={styles.processingRing} />}

            <div className={styles.cardHeader}>
                <div className={styles.iconWrap} style={{ background: `${color}15`, color }}>
                    <span>{icon}</span>
                </div>
                <div className={styles.statusIndicator}>
                    {status === 'processing' ? (
                        <div className={styles.spinnerWrap}>
                            <svg className={styles.spinner} viewBox="0 0 20 20" width="18" height="18">
                                <circle cx="10" cy="10" r="8" stroke="rgba(255,255,255,0.1)" strokeWidth="2" fill="none" />
                                <circle cx="10" cy="10" r="8" stroke={color} strokeWidth="2" fill="none"
                                    strokeDasharray="25 26" strokeLinecap="round" />
                            </svg>
                        </div>
                    ) : (
                        <div className={`status-dot ${status}`} />
                    )}
                </div>
            </div>

            <div className={styles.cardBody}>
                <h3 className={styles.agentName}>{label}</h3>
                <p className={styles.agentDesc}>{description}</p>
            </div>

            {status !== 'idle' && (
                <div className={styles.cardFooter}>
                    {status === 'processing' && (
                        <>
                            <div className={styles.processingBar}>
                                <div className={styles.processingFill} />
                            </div>
                            <span className={styles.processingLabel}>Zpracovávám...</span>
                        </>
                    )}
                    {(status === 'success' || status === 'fail' || status === 'warn') && (
                        <span className={`${styles.statusLabel} status-${status}`}>
                            {status === 'success' ? '✓ OK' : status === 'fail' ? '✕ CHYBA' : '⚠ UPOZORNĚNÍ'}
                        </span>
                    )}
                </div>
            )}

            {lastLog && status === 'processing' && (
                <div className={styles.logPreview}>
                    <span className={styles.logDot} />
                    {lastLog.message?.substring(0, 45)}...
                </div>
            )}
        </div>
    );
}
