'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getWebSocketUrl } from '@/lib/api';

export interface WSMessage {
    type: string;
    pipeline_id?: string;
    agent?: string;
    status?: string;
    message?: string;
    level?: string;
    timestamp?: number;
    elapsed_time?: number;
    result?: any;
    agents?: string[];
}

export function useWebSocket(sessionId: string | null) {
    const wsRef = useRef<WebSocket | null>(null);
    const [connected, setConnected] = useState(false);
    const [messages, setMessages] = useState<WSMessage[]>([]);
    const [agentStatuses, setAgentStatuses] = useState<Record<string, string>>({});
    const [agentLogs, setAgentLogs] = useState<Record<string, WSMessage[]>>({});
    const [pipelineResult, setPipelineResult] = useState<any>(null);
    const [isRunning, setIsRunning] = useState(false);

    const connect = useCallback(() => {
        if (!sessionId) return;

        const ws = new WebSocket(getWebSocketUrl(sessionId));
        wsRef.current = ws;

        ws.onopen = () => setConnected(true);
        ws.onclose = () => {
            setConnected(false);
            // Auto-reconnect after 2s
            setTimeout(() => {
                if (sessionId) connect();
            }, 2000);
        };

        ws.onmessage = (event) => {
            try {
                const msg: WSMessage = JSON.parse(event.data);
                setMessages(prev => [...prev, msg]);

                switch (msg.type) {
                    case 'pipeline_start':
                        setIsRunning(true);
                        setAgentStatuses({});
                        setAgentLogs({});
                        setPipelineResult(null);
                        // Initialize all agents as idle
                        msg.agents?.forEach(name => {
                            setAgentStatuses(prev => ({ ...prev, [name]: 'idle' }));
                        });
                        break;

                    case 'agent_status':
                        if (msg.agent && msg.status) {
                            setAgentStatuses(prev => ({ ...prev, [msg.agent!]: msg.status! }));
                        }
                        break;

                    case 'agent_log':
                        if (msg.agent) {
                            setAgentLogs(prev => ({
                                ...prev,
                                [msg.agent!]: [...(prev[msg.agent!] || []), msg],
                            }));
                        }
                        break;

                    case 'pipeline_complete':
                        setIsRunning(false);
                        setPipelineResult(msg.result);
                        break;
                }
            } catch (e) {
                console.error('WS parse error:', e);
            }
        };
    }, [sessionId]);

    useEffect(() => {
        connect();
        return () => {
            wsRef.current?.close();
        };
    }, [connect]);

    const sendMessage = useCallback((msg: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
        }
    }, []);

    return {
        connected,
        messages,
        agentStatuses,
        agentLogs,
        pipelineResult,
        isRunning,
        sendMessage,
    };
}
