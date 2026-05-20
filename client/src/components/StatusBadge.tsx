import { DriverStatus } from '../types';

const STATUS_CONFIG: Record<DriverStatus, { label: string; cls: string }> = {
  new:       { label: 'New Lead',    cls: 'bg-blue-100 text-blue-700' },
  contacted: { label: 'Contacted',   cls: 'bg-purple-100 text-purple-700' },
  interview: { label: 'Interview',   cls: 'bg-yellow-100 text-yellow-700' },
  documents: { label: 'Documents',   cls: 'bg-orange-100 text-orange-700' },
  training:  { label: 'Training',    cls: 'bg-indigo-100 text-indigo-700' },
  active:    { label: 'Active',      cls: 'bg-green-100 text-green-700' },
  inactive:  { label: 'Inactive',    cls: 'bg-gray-100 text-gray-600' },
  rejected:  { label: 'Rejected',    cls: 'bg-red-100 text-red-600' },
};

export function statusLabel(s: string) {
  return STATUS_CONFIG[s as DriverStatus]?.label ?? s;
}

export default function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as DriverStatus] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
