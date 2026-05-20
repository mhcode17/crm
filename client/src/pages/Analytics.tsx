import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import { statusLabel } from '../components/StatusBadge';

const STATUS_COLORS: Record<string, string> = {
  new:       '#3b82f6',
  contacted: '#8b5cf6',
  interview: '#f59e0b',
  documents: '#f97316',
  training:  '#6366f1',
  active:    '#10b981',
  inactive:  '#6b7280',
  rejected:  '#ef4444',
};

interface Recruiter {
  id: number; name: string; email: string; avatar_color: string;
  total_drivers: number; active_drivers: number; new_leads: number; rejected: number; this_month: number;
}

export default function Analytics() {
  const { user } = useAuth();
  const [pipeline, setPipeline] = useState<any>(null);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const calls = [api.get('/stats/pipeline')];
    if (user?.role === 'admin') calls.push(api.get('/stats/recruiters'));
    Promise.all(calls).then(([p, r]) => {
      setPipeline(p.data);
      if (r) setRecruiters(r.data);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="p-6 animate-pulse space-y-4">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="h-64 bg-gray-200 rounded-xl" />
    </div>
  );

  const pipelineData = pipeline.byStatus.map((s: any) => ({
    name: statusLabel(s.status),
    count: s.count,
    fill: STATUS_COLORS[s.status] || '#94a3b8'
  }));

  const { total, converted } = pipeline.conversionRate;
  const convRate = total > 0 ? ((converted / total) * 100).toFixed(1) : '0';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500">Hiring performance and pipeline overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Candidates',  value: total },
          { label: 'Active Drivers',    value: converted },
          { label: 'Conversion Rate',   value: `${convRate}%` },
          { label: 'Recruiters',        value: recruiters.length || '—' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-gray-500 font-medium mb-2">{k.label}</p>
            <p className="text-3xl font-bold text-gray-900">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Pipeline by Status</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={pipelineData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Drivers" radius={[4, 4, 0, 0]}>
                {pipelineData.map((entry: any, i: number) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Status Distribution</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pipelineData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} dataKey="count" nameKey="name">
                {pipelineData.map((entry: any, i: number) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [v, 'Drivers']} />
              <Legend iconType="circle" iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {user?.role === 'admin' && recruiters.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recruiter Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Recruiter</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Active</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">New Leads</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">This Month</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Conversion</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Rejected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recruiters.map((r, i) => {
                  const conv = r.total_drivers > 0 ? ((r.active_drivers / r.total_drivers) * 100).toFixed(0) : '0';
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 w-5">#{i + 1}</span>
                          <Avatar name={r.name} color={r.avatar_color} size="sm" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{r.name}</p>
                            <p className="text-xs text-gray-400">{r.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900">{r.total_drivers}</td>
                      <td className="px-4 py-3 text-center"><span className="text-sm font-semibold text-green-600">{r.active_drivers}</span></td>
                      <td className="px-4 py-3 text-center text-sm text-blue-600">{r.new_leads}</td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">{r.this_month}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="flex-1 max-w-16 bg-gray-100 rounded-full h-1.5">
                            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${conv}%` }} />
                          </div>
                          <span className="text-xs font-medium text-gray-600">{conv}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-red-500">{r.rejected}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
