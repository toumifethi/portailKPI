import { getMetric } from './metricsCatalog';
import type { FormulaAst, FormulaNode, FormulaFunction, FormulaValidationResult } from './types';

const ALLOWED_FUNCTIONS: FormulaFunction[] = [
  'sum', 'avg', 'count', 'min', 'max',
  'ratio', 'round', 'subtract', 'add', 'multiply', 'divide', 'if_gt',
];

const FUNCTION_ARITY: Record<string, number | [number, number]> = {
  sum: 1, avg: 1, count: 1, min: 1, max: 1,
  ratio: 2, subtract: 2, add: 2, multiply: 2, divide: 2,
  round: 2, if_gt: 4,
};

/**
 * Valide une formule AST et génère une description humaine.
 */
export function validateFormula(ast: FormulaAst): FormulaValidationResult {
  const errors: string[] = [];

  if (ast.version !== 1) {
    errors.push(`Version AST non supportée: ${ast.version}`);
  }

  if (!ast.expression) {
    errors.push('Expression manquante');
    return { valid: false, errors };
  }

  validateNode(ast.expression, errors, 0);

  const description = errors.length === 0 ? describeNode(ast.expression) : undefined;

  return {
    valid: errors.length === 0,
    errors,
    description,
  };
}

function validateNode(node: FormulaNode, errors: string[], depth: number): void {
  if (depth > 10) {
    errors.push('Formule trop profonde (max 10 niveaux)');
    return;
  }

  switch (node.type) {
    case 'constant':
      if (typeof node.value !== 'number' || isNaN(node.value)) {
        errors.push(`Constante invalide: ${node.value}`);
      }
      break;

    case 'metric': {
      const metric = getMetric(node.id);
      if (!metric) {
        errors.push(`Métrique inconnue: "${node.id}"`);
      }
      break;
    }

    case 'function': {
      if (!ALLOWED_FUNCTIONS.includes(node.name)) {
        errors.push(`Fonction non autorisée: "${node.name}"`);
        return;
      }

      const expectedArity = FUNCTION_ARITY[node.name];
      if (typeof expectedArity === 'number' && node.args.length !== expectedArity) {
        errors.push(`Fonction "${node.name}" attend ${expectedArity} argument(s), reçu ${node.args.length}`);
      }

      for (const arg of node.args) {
        validateNode(arg, errors, depth + 1);
      }
      break;
    }

    default:
      errors.push(`Type de noeud inconnu: "${(node as { type: string }).type}"`);
  }
}

/**
 * Génère une description humaine lisible depuis l'AST.
 */
function describeNode(node: FormulaNode): string {
  switch (node.type) {
    case 'constant':
      return `${node.value}`;

    case 'metric': {
      const metric = getMetric(node.id);
      return metric?.label ?? node.id;
    }

    case 'function': {
      const args = node.args.map(describeNode);
      switch (node.name) {
        case 'sum': return `somme(${args[0]})`;
        case 'avg': return `moyenne(${args[0]})`;
        case 'count': return `nombre(${args[0]})`;
        case 'min': return `minimum(${args[0]})`;
        case 'max': return `maximum(${args[0]})`;
        case 'ratio': return `ratio de ${args[0]} sur ${args[1]} (%)`;
        case 'add': return `${args[0]} + ${args[1]}`;
        case 'subtract': return `${args[0]} - ${args[1]}`;
        case 'multiply': return `${args[0]} × ${args[1]}`;
        case 'divide': return `${args[0]} / ${args[1]}`;
        case 'round': return `arrondi(${args[0]}, ${args[1]} décimales)`;
        case 'if_gt': return `si ${args[0]} > ${args[1]} alors ${args[2]} sinon ${args[3]}`;
        default: return `${node.name}(${args.join(', ')})`;
      }
    }
  }
}
