import { useState } from 'react';
import { X } from 'lucide-react';
import api from '../api';
import toast from 'react-hot-toast';

const TRUCK_TYPES = ['Semi Truck', 'Refrigerated', 'Tanker', 'Box Truck', 'Flatbed', 'Dump Truck', 'Car Hauler', 'Van'];
const SOURCES = ['Indeed', 'LinkedIn', 'Referral', 'Facebook', 'Cold Call', 'Website', 'ZipRecruiter', 'Other'];

export default function AddDriverModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', city: '', state: '',
    truck_type: '', license_class: '', endorsements: '', experience_years: '',
    source: '', salary_expectation: '', bio: '', start_date: ''
  });
  const [saving, setSaving] = useState(false);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await api.post('/drivers', { ...form, experience_years: form.experience_years ? parseInt(form.experience_years) : 0 });
      toast.success('Driver added!');
      onAdded();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error adding driver');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">New Driver</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Full Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="John Smith" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="john@email.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="+1-555-000-0000" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
              <input value={form.city} onChange={e => set('city', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Dallas" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">State</label>
              <input value={form.state} onChange={e => set('state', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="TX" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Truck Type</label>
              <select value={form.truck_type} onChange={e => set('truck_type', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select...</option>
                {TRUCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">License Class</label>
              <select value={form.license_class} onChange={e => set('license_class', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select...</option>
                {['CDL-A', 'CDL-B', 'CDL-C', 'Class A', 'Class B', 'Class C'].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Endorsements</label>
              <select value={form.endorsements} onChange={e => set('endorsements', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">None</option>
                <option value="H - Hazmat">H — Hazardous Materials</option>
                <option value="N - Tanker">N — Tanker</option>
                <option value="P - Passenger">P — Passenger</option>
                <option value="S - School Bus">S — School Bus</option>
                <option value="T - Doubles/Triples">T — Doubles/Triples</option>
                <option value="X - Tanker + Hazmat">X — Tanker + Hazmat</option>
                <option value="H, N">H + N (Hazmat + Tanker)</option>
                <option value="H, T">H + T (Hazmat + Doubles)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Experience (years)</label>
              <input type="number" min="0" max="50" value={form.experience_years} onChange={e => set('experience_years', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Source</label>
              <select value={form.source} onChange={e => set('source', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select...</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Pay Expectation</label>
              <input value={form.salary_expectation} onChange={e => set('salary_expectation', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="$0.55/mile" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
              <textarea rows={3} value={form.bio} onChange={e => set('bio', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Additional information..." />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
              {saving ? 'Saving...' : 'Add Driver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
