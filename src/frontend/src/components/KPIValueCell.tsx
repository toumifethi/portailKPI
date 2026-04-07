import React from 'react';
import { getRagColorInfo, type RagThresholds } from '@/utils/ragColors';

interface KPIValueCellProps {
  value: number | null;
  unit: string | null;
  thresholds: RagThresholds;
}

/**
 * Composant pour afficher une valeur KPI avec code couleur RAG
 * Utilise le système de seuils (rouge, orange, vert) défini pour chaque KPI
 */
export function KPIValueCell({ value, unit, thresholds }: KPIValueCellProps) {
  // Pas de valeur = tiret gris
  if (value === null || value === undefined) {
    return <span style={{ color: '#9ca3af' }}>—</span>;
  }

  // Récupérer les couleurs appropriées
  const colors = getRagColorInfo(value, thresholds);

  // Formater la valeur
  const formatted = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const suffix = unit === '%' ? ' %' : unit ? ` ${unit}` : '';

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 8px',
        backgroundColor: colors.backgroundColor,
        color: colors.textColor,
        borderRadius: '4px',
        fontWeight: 600,
        border: `1px solid ${colors.borderColor}`,
      }}
    >
      {formatted}
      {suffix}
    </span>
  );
}
