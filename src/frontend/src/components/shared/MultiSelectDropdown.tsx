import { useState, useRef, useEffect } from 'react';

export interface MultiSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  maxDisplayed?: number;
}

/**
 * Composant dropdown multi-select avec cases a cocher.
 * Reutilisable pour filtres assignes, statuts, types, etc.
 */
export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder = 'Tous',
  maxDisplayed = 2,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedSet = new Set(selected);

  function toggle(value: string) {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange([...next]);
  }

  const filteredOptions = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const label = selected.length === 0
    ? placeholder
    : selected.length <= maxDisplayed
      ? selected.map((v) => options.find((o) => o.value === v)?.label ?? v).join(', ')
      : `${selected.length} selectionne(s)`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: '6px 10px',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: 13,
          minWidth: 160,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: selected.length > 0 ? '#eef2ff' : 'white',
          color: selected.length > 0 ? '#4f46e5' : '#374151',
          fontWeight: selected.length > 0 ? 600 : 400,
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={{ fontSize: 10 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 50,
          background: 'white',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          marginTop: 4,
          minWidth: 240,
          maxHeight: 300,
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Recherche */}
          {options.length > 8 && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb' }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                style={{ width: '100%', padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
          )}

          {/* Options */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredOptions.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 10px',
                  cursor: 'pointer',
                  fontSize: 13,
                  background: selectedSet.has(opt.value) ? '#f0f9ff' : 'transparent',
                }}
                onMouseEnter={(e) => { if (!selectedSet.has(opt.value)) (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = selectedSet.has(opt.value) ? '#f0f9ff' : 'transparent'; }}
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(opt.value)}
                  onChange={() => toggle(opt.value)}
                  style={{ accentColor: '#4f46e5' }}
                />
                <div>
                  <div>{opt.label}</div>
                  {opt.sublabel && <div style={{ fontSize: 10, color: '#9ca3af' }}>{opt.sublabel}</div>}
                </div>
              </label>
            ))}
            {filteredOptions.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>Aucun resultat</div>
            )}
          </div>

          {/* Footer */}
          {selected.length > 0 && (
            <button
              onClick={() => { onChange([]); setSearch(''); }}
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: 11,
                color: '#6b7280',
                background: '#f9fafb',
                border: 'none',
                borderTop: '1px solid #e5e7eb',
                cursor: 'pointer',
              }}
            >
              Tout decocher ({selected.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
