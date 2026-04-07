import React from 'react';
import type { RagStatus } from '@/types';

const RAG_CONFIG: Record<RagStatus, { label: string; color: string; bg: string }> = {
  GREEN: { label: '✓ OK', color: '#065f46', bg: '#d1fae5' },
  ORANGE: { label: '⚠ Attention', color: '#92400e', bg: '#fef3c7' },
  RED: { label: '✗ Alerte', color: '#991b1b', bg: '#fee2e2' },
  NEUTRAL: { label: '— N/A', color: '#6b7280', bg: '#f3f4f6' },
};

interface RagBadgeProps {
  status: RagStatus;
  size?: 'sm' | 'md';
}

export function RagBadge({ status, size = 'sm' }: RagBadgeProps) {
  const { label, color, bg } = RAG_CONFIG[status];
  const fontSize = size === 'sm' ? 11 : 13;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: size === 'sm' ? '2px 8px' : '4px 12px',
        borderRadius: 999,
        background: bg,
        color,
        fontSize,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
