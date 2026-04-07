import React from 'react';
import type { DashboardKpi, RagStatus } from '@/types';
import { getRagStatus } from '@/types';
import { RagBadge } from './RagBadge';

interface KpiCardProps {
  kpi: DashboardKpi;
  onClick?: () => void;
}

const RAG_COLORS: Record<RagStatus, string> = {
  GREEN: '#d1fae5',
  ORANGE: '#fef3c7',
  RED: '#fee2e2',
  NEUTRAL: '#f3f4f6',
};

export function KpiCard({ kpi, onClick }: KpiCardProps) {
  const rag = getRagStatus(kpi.value, kpi);
  const displayValue =
    kpi.value !== null ? `${kpi.value.toFixed(1)}${kpi.unit ?? ''}` : '—';

  return (
    <div
      onClick={onClick}
      style={{
        background: RAG_COLORS[rag],
        border: `1px solid #e5e7eb`,
        borderTop: `4px solid ${rag === 'GREEN' ? '#10b981' : rag === 'ORANGE' ? '#f59e0b' : rag === 'RED' ? '#ef4444' : '#9ca3af'}`,
        borderRadius: 8,
        padding: '16px 20px',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{kpi.kpiName}</span>
        <RagBadge status={rag} />
      </div>

      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: '#111827' }}>
        {displayValue}
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: '#9ca3af' }}>
        {kpi.ticketCount !== null && `${kpi.ticketCount} tickets`}
        {kpi.excludedTicketCount ? ` (${kpi.excludedTicketCount} exclus)` : ''}
      </div>
    </div>
  );
}
