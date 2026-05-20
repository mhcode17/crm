import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Phone, Mail, MapPin, Briefcase, ChevronRight, Users } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { Driver, DriverStatus } from '../types';
import StatusBadge, { statusLabel } from '../components/StatusBadge';
import Avatar from '../components/Avatar';
import AddDriverModal from './AddDriverModal';

const STATUSES = [
  { value: 'all',       label: 'All' },
  { value: 'new',       label: 'New Leads' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'interview', label: 'Interview' },
  { value: 'documents', label: 'Documents' },
  { value: 'training',  label: 'Training' },
  { value: 'active',    label: 'Active' },
  { value: 'inactive',  label: 'Inactive' },
  { value: 'rejected',  label: 'Rejected' },
];

const PIPELINE_ORDER: DriverStatus[] = ['new', 'contacted', 'interview', 'documents', 'training', 'active'];

export default function Drivers() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [showAdd, setShowAdd] = useState(false);

  const statusFilter = searchParams.get('status') || 'all';

  function load() {
    setLoading(true);
    const params: Record<string, string> = {};
    if (statusFilter !== 'all') params.status = statusFilter;
    if (search) params.search = search;
    api.get('/drivers', { params }).then(r => { setDrivers(r.data); setLoading(false); });
  }

  useEffect(() => { load(); }, [statusFilter, search]);

  function setStatus(s: string) {
    if (s === 'all') searchParams.delete('status');
    else searchParams.set('status', s);
    setSearchParams(searchParams);
  }

  const kanbanGroups = PIPELINE_ORDER.map(s => ({
    status: s,
    label: statusLabel(s),
    items: drivers.filter(d => d.status === s)
  }));

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
          <p className="text-sm text-gray-500">{drivers.length} records</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Driver
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, city..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('list')} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'list' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>List</button>
          <button onClick={() => setView('kanban')} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Kanban</button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto scrollbar-thin pb-1">
        {STATUSES.map(s => (
          <button key={s.value} onClick={() => setStatus(s.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${statusFilter === s.value ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : view === 'list' ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {drivers.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Users size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">No drivers found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Recruiter</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type / Exp.</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {drivers.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/drivers/${d.id}`} className="flex items-center gap-3 group">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-blue-700">
                          {d.name.split(' ').map(p => p[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600">{d.name}</p>
                          {d.city && <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={10} />{d.city}{d.state ? `, ${d.state}` : ''}</p>}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {d.phone && <p className="text-xs text-gray-600 flex items-center gap-1"><Phone size={11} />{d.phone}</p>}
                      {d.email && <p className="text-xs text-gray-400 flex items-center gap-1"><Mail size={11} />{d.email}</p>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-3">
                      {user?.role === 'admin' && d.recruiter_name && (
                        <div className="flex items-center gap-2">
                          <Avatar name={d.recruiter_name} color={d.recruiter_color} size="sm" />
                          <span className="text-xs text-gray-600">{d.recruiter_name}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {d.truck_type && <p className="text-xs text-gray-600 flex items-center gap-1"><Briefcase size={11} />{d.truck_type}</p>}
                      {d.experience_years != null && <p className="text-xs text-gray-400">{d.experience_years} yrs exp.</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/drivers/${d.id}`}><ChevronRight size={16} className="text-gray-300" /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto scrollbar-thin pb-4">
          {kanbanGroups.map(({ status, label, items }) => (
            <div key={status} className="flex-shrink-0 w-64">
              <div className="flex items-center justify-between mb-3">
                <StatusBadge status={status} />
                <span className="text-xs text-gray-400 font-medium">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map(d => (
                  <Link key={d.id} to={`/drivers/${d.id}`}
                    className="block bg-white rounded-lg border border-gray-100 p-3 shadow-sm hover:shadow-md hover:border-blue-200 transition-all">
                    <p className="text-sm font-medium text-gray-900 mb-1">{d.name}</p>
                    {d.phone && <p className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{d.phone}</p>}
                    {d.city && <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={10} />{d.city}</p>}
                    {d.truck_type && <p className="text-xs text-gray-400 flex items-center gap-1 mt-1"><Briefcase size={10} />{d.truck_type}</p>}
                    {user?.role === 'admin' && d.recruiter_name && (
                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-50">
                        <Avatar name={d.recruiter_name} color={d.recruiter_color} size="sm" />
                        <span className="text-xs text-gray-500">{d.recruiter_name}</span>
                      </div>
                    )}
                  </Link>
                ))}
                {items.length === 0 && (
                  <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                    No drivers
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddDriverModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  );
}
