import React, { useRef, useCallback } from 'react';

// ── SQL syntax highlighting via overlay technique ────────────────────────────
// Un textarea transparent pour l'édition, superposé sur un div HTML colorisé.
// Tokenisation single-pass pour éviter que le HTML injecté ne soit retraité.

const KEYWORDS_SET = new Set([
  'SELECT','DISTINCT','FROM','WHERE','AND','OR','NOT','IN','EXISTS','BETWEEN',
  'LIKE','IS','NULL','AS','ON','JOIN','LEFT','RIGHT','INNER','OUTER','CROSS',
  'FULL','CASE','WHEN','THEN','ELSE','END','GROUP','BY','ORDER','ASC','DESC',
  'HAVING','LIMIT','OFFSET','UNION','ALL','WITH','INTERVAL','MONTH',
  'DATE_SUB','DATE_FORMAT','DATE_ADD','COALESCE','NULLIF','ROUND','SUM',
  'COUNT','AVG','MIN','MAX','CONCAT','IF','IFNULL','CAST','CONVERT',
]);

const FORBIDDEN_SET = new Set([
  'INSERT','UPDATE','DELETE','DROP','ALTER','TRUNCATE','CREATE','GRANT','REVOKE',
]);

const PLACEHOLDER_SET = new Set([
  ':client_id',':period_start',':period_end',':project_ids',':collaborator_id',':jira_account_ids',
]);

// Single combined regex for tokenisation — order matters (first match wins)
const TOKEN_RE = /('(?:[^'\\]|\\.)*')|(--[^\n]*)|(:\w+)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;

function highlightSql(sql: string): string {
  let result = '';
  let lastIdx = 0;

  TOKEN_RE.lastIndex = 0;
  let match;

  while ((match = TOKEN_RE.exec(sql)) !== null) {
    // Append any unmatched text before this token (operators, whitespace, punctuation)
    if (match.index > lastIdx) {
      result += escapeHtml(sql.slice(lastIdx, match.index));
    }

    const [, strLiteral, comment, placeholder, number, word] = match;

    if (strLiteral) {
      result += `<span style="color:#b45309">${escapeHtml(strLiteral)}</span>`;
    } else if (comment) {
      result += `<span style="color:#6b7280;font-style:italic">${escapeHtml(comment)}</span>`;
    } else if (placeholder) {
      if (PLACEHOLDER_SET.has(placeholder)) {
        result += `<span style="color:#7c3aed;font-weight:bold">${escapeHtml(placeholder)}</span>`;
      } else {
        result += escapeHtml(placeholder);
      }
    } else if (number) {
      result += `<span style="color:#0d9488">${escapeHtml(number)}</span>`;
    } else if (word) {
      const upper = word.toUpperCase();
      if (FORBIDDEN_SET.has(upper)) {
        result += `<span style="color:#ef4444;font-weight:bold;text-decoration:wavy underline red">${escapeHtml(word)}</span>`;
      } else if (KEYWORDS_SET.has(upper)) {
        result += `<span style="color:#93bbff;font-weight:bold">${escapeHtml(word)}</span>`;
      } else {
        result += escapeHtml(word);
      }
    }

    lastIdx = match.index + match[0].length;
  }

  // Append trailing text
  if (lastIdx < sql.length) {
    result += escapeHtml(sql.slice(lastIdx));
  }

  return result;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Placeholders reference ──

const SQL_PLACEHOLDERS = [
  { name: ':client_id', description: 'ID du client' },
  { name: ':period_start', description: "Debut de periode (ex: '2026-03-01')" },
  { name: ':period_end', description: "Fin de periode (ex: '2026-03-31')" },
  { name: ':project_ids', description: 'Liste IDs projets (ex: 1,4,7)' },
  { name: ':collaborator_id', description: 'ID collaborateur ou NULL si global' },
  { name: ':jira_account_ids', description: "Comptes Jira (ex: 'abc','def')" },
];

const SQL_FORBIDDEN_CHECK = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;

// ── Component ──

interface SqlHighlightEditorProps {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  label?: string;
  placeholder?: string;
}

export function SqlHighlightEditor({ value, onChange, rows = 12, label, placeholder }: SqlHighlightEditorProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLDivElement>(null);

  const hasForbidden = SQL_FORBIDDEN_CHECK.test(value);
  const hasValue = value.toLowerCase().includes('value');

  // Sync scroll between textarea and highlight overlay
  const handleScroll = useCallback(() => {
    if (textRef.current && preRef.current) {
      preRef.current.scrollTop = textRef.current.scrollTop;
      preRef.current.scrollLeft = textRef.current.scrollLeft;
    }
  }, []);

  const highlighted = highlightSql(value || '');

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    borderRadius: 8,
    border: hasForbidden ? '2px solid #ef4444' : '1px solid #d1d5db',
    overflow: 'hidden',
    background: '#1e1e2e',
  };

  const sharedStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '12px 14px',
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap' as const,
    wordWrap: 'break-word' as const,
    overflowWrap: 'break-word' as const,
    tabSize: 2,
    margin: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block' }}>
          {label}
        </label>
      )}

      {/* Editor container */}
      <div style={containerStyle}>
        {/* Highlighted overlay (behind textarea) */}
        <div
          ref={preRef}
          style={{
            ...sharedStyle,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            color: '#e2e8f0',
            pointerEvents: 'none',
            overflow: 'auto',
            height: `${rows * 1.7 * 13 + 24}px`,
          }}
          dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
        />

        {/* Transparent textarea (on top for editing) */}
        <textarea
          ref={textRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          rows={rows}
          placeholder={placeholder}
          spellCheck={false}
          style={{
            ...sharedStyle,
            position: 'relative',
            background: 'transparent',
            color: 'transparent',
            caretColor: '#e2e8f0',
            resize: 'vertical',
            border: 'none',
            outline: 'none',
            height: `${rows * 1.7 * 13 + 24}px`,
            zIndex: 1,
          }}
        />
      </div>

      {/* Warnings */}
      {hasForbidden && (
        <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>
          Seules les requetes SELECT sont autorisees. Mots-cles interdits detectes.
        </div>
      )}

      {value.trim().length > 0 && !hasValue && (
        <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
          La requete doit retourner une colonne nommee <code style={{ fontFamily: 'monospace', fontWeight: 600 }}>value</code>.
        </div>
      )}

      {/* Placeholders reference */}
      <div style={{ background: '#f3f4f6', borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
          Placeholders disponibles
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SQL_PLACEHOLDERS.map((p) => (
            <div key={p.name} style={{ fontSize: 11, padding: '3px 8px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <code style={{ fontFamily: 'monospace', fontWeight: 600, color: '#4f46e5' }}>{p.name}</code>
              <span style={{ color: '#6b7280', marginLeft: 4 }}>{p.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
