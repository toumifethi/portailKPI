import { useAppStore } from '@/store/appStore';

function generateMonthOptions(count = 13): Array<{ value: string; label: string }> {
  const options = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
    options.push({ value, label });
  }

  return options;
}

export function PeriodSelector() {
  const { selectedPeriod, setSelectedPeriod } = useAppStore();
  const options = generateMonthOptions(13);

  return (
    <select
      value={selectedPeriod}
      onChange={(e) => setSelectedPeriod(e.target.value)}
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: '1px solid #d1d5db',
        fontSize: 14,
        minWidth: 160,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
