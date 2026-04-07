/**
 * Système de couleurs RAG (Rouge-Ambre-Vert) pour les KPI
 * Basé sur les seuils définis pour chaque KPI
 */

export type RagStatus = 'red' | 'orange' | 'green' | 'neutral';

export interface RagThresholds {
  redMin: number | null;
  redMax: number | null;
  orangeMin: number | null;
  orangeMax: number | null;
  greenMin: number | null;
  greenMax: number | null;
}

export interface RagColorInfo {
  status: RagStatus;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
}

function inRange(value: number, min: number | null, max: number | null): boolean {
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

/**
 * Calcule le statut RAG d'une valeur KPI basé sur les seuils
 * @param value - La valeur du KPI (nombre ou null)
 * @param thresholds - Les seuils définis pour ce KPI
 * @returns Le statut RAG ('red', 'orange', 'green', 'neutral')
 */
export function calculateRagStatus(value: number | null, thresholds: RagThresholds): RagStatus {
  // Si pas de valeur, retourner neutre
  if (value === null || value === undefined) {
    return 'neutral';
  }

  const hasRed = thresholds.redMin !== null || thresholds.redMax !== null;
  const hasOrange = thresholds.orangeMin !== null || thresholds.orangeMax !== null;
  const hasGreen = thresholds.greenMin !== null || thresholds.greenMax !== null;

  // Priorite a la severite : rouge, puis orange, puis vert.
  if (hasRed && inRange(value, thresholds.redMin, thresholds.redMax)) {
    return 'red';
  }

  if (hasOrange && inRange(value, thresholds.orangeMin, thresholds.orangeMax)) {
    return 'orange';
  }

  if (hasGreen && inRange(value, thresholds.greenMin, thresholds.greenMax)) {
    return 'green';
  }

  // Par défaut, neutre si aucun seuil ne match
  return 'neutral';
}

/**
 * Récupère les couleurs CSS correspondant à un statut RAG
 * @param status - Le statut RAG
 * @returns Un objet avec les couleurs CSS (backgroundColor, textColor, borderColor)
 */
export function getRagColors(status: RagStatus): RagColorInfo {
  const colors: Record<RagStatus, RagColorInfo> = {
    red: {
      status: 'red',
      backgroundColor: '#FFF1F0', // Très clair rouge
      textColor: '#FF4D4F', // Rouge Ant Design
      borderColor: '#FF7875', // Rouge plus clair
    },
    orange: {
      status: 'orange',
      backgroundColor: '#FFF7E6', // Très clair orange
      textColor: '#FAAD14', // Orange Ant Design
      borderColor: '#FFC069', // Orange plus clair
    },
    green: {
      status: 'green',
      backgroundColor: '#F6FFED', // Très clair vert
      textColor: '#52C41A', // Vert Ant Design
      borderColor: '#95DE64', // Vert plus clair
    },
    neutral: {
      status: 'neutral',
      backgroundColor: '#F5F5F5', // Gris très clair
      textColor: '#8C8C8C', // Gris Ant Design
      borderColor: '#D9D9D9', // Bordure neutre
    },
  };

  return colors[status] || colors.neutral;
}

/**
 * Combine les deux fonctions : calcule le statut RAG et retourne les couleurs
 * @param value - La valeur du KPI
 * @param thresholds - Les seuils
 * @returns Les informations de couleur du statut RAG
 */
export function getRagColorInfo(value: number | null, thresholds: RagThresholds): RagColorInfo {
  const status = calculateRagStatus(value, thresholds);
  return getRagColors(status);
}
