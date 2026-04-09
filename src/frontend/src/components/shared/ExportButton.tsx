interface ExportButtonProps {
  data: unknown[];
  filename?: string;
  label?: string;
}

export function ExportButton({ data, filename = 'export', label = 'Exporter CSV' }: ExportButtonProps) {
  function handleExport() {
    if (!data.length) return;

    const headers = Object.keys(data[0] as Record<string, unknown>);
    const rows = data.map((row) =>
      headers
        .map((h) => {
          const val = (row as Record<string, unknown>)[h];
          const str = val === null || val === undefined ? '' : String(val);
          return str.includes(',') ? `"${str}"` : str;
        })
        .join(','),
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleExport}
      disabled={!data.length}
      style={{
        padding: '6px 14px',
        border: '1px solid #d1d5db',
        borderRadius: 6,
        background: 'white',
        cursor: data.length ? 'pointer' : 'not-allowed',
        fontSize: 13,
        color: '#374151',
        opacity: data.length ? 1 : 0.5,
      }}
    >
      {label}
    </button>
  );
}
