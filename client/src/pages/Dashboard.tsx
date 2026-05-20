import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, TrendingUp, Calendar, Mail, ArrowRight, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { DashboardStats } from '../types';
import StatusBadge from '../components/StatusBadge';

const ACTIVITY_ICONS: Record<string, string> = {
  driver_created: '➕',
  status_change:  '🔄',
  email_sent:     '📧',
  note_added:     '📝',
  driver_updated: '✏️',
  driver_deleted: '🗑️',
};

function StatCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: number | string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/stats/dashboard').then(r => { setStats(r.data); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="p-6 animate-pulse space-y-4">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-200 rounded-xl" />)}</div>
    </div>
  );

  const t = stats!.totals;
  const chartData = stats!.monthlyData.map(d => ({ month: d.month, count: d.count }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hello, {user?.name.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm mt-0.5">{format(new Date(), "MMMM d, yyyy — EEEE")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Drivers"    value={t.total}      icon={Users}      color="bg-blue-500"   sub={`${t.active} active`} />
        <StatCard title="New Leads"        value={t.new_leads}  icon={TrendingUp} color="bg-purple-500" sub="Awaiting contact" />
        <StatCard title="Interviews"       value={t.interviews} icon={Calendar}   color="bg-yellow-500" sub={`${t.in_training} in training`} />
        <StatCard title="Emails This Month" value={stats!.emailsThisMonth.count} icon={Mail} color="bg-green-500" sub="Sent" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Hiring Pipeline</h2>
          <div className="space-y-2.5">
            {[
              { key: 'new',       label: 'New Leads',   val: t.new_leads,   color: 'bg-blue-500' },
              { key: 'contacted', label: 'Contacted',   val: t.contacted,   color: 'bg-purple-500' },
              { key: 'interview', label: 'Interview',   val: t.interviews,  color: 'bg-yellow-500' },
              { key: 'documents', label: 'Documents',   val: t.documents,   color: 'bg-orange-500' },
              { key: 'training',  label: 'Training',    val: t.in_training, color: 'bg-indigo-500' },
              { key: 'active',    label: 'Active',      val: t.active,      color: 'bg-green-500' },
            ].map(({ key, label, val, color }) => (
              <Link key={key} to={`/drivers?status=${key}`} className="flex items-center gap-3 group">
                <div className={`w-2.5 h-2.5 rounded-full ${color} flex-shrink-0`} />
                <span className="text-sm text-gray-600 flex-1 group-hover:text-gray-900">{label}</span>
                <span className="text-sm font-semibold text-gray-900">{val}</span>
                <ArrowRight size={13} className="text-gray-300 group-hover:text-gray-500" />
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Starting Soon</h2>
            <Calendar size={16} className="text-gray-400" />
          </div>
          {stats!.startingSoon.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No upcoming start dates</p>
          ) : (
            <div className="space-y-3">
              {stats!.startingSoon.map(d => (
                <Link key={d.id} to={`/drivers/${d.id}`} className="flex items-center gap-3 group">
                  <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Clock size={16} className="text-green-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 truncate">{d.name}</p>
                    <p className="text-xs text-gray-400">{d.start_date ? format(new Date(d.start_date), "MMM d") : '—'}</p>
                  </div>
                  <StatusBadge status={d.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Added — Last 6 Months</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#gradient)" strokeWidth={2} name="Drivers" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">No data yet</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-4">Recent Activity</h2>
        {stats!.recentActivity.length === 0 ? (
          <p className="text-sm text-gray-400">No activity yet</p>
        ) : (
          <div className="space-y-3">
            {stats!.recentActivity.map(a => (
              <div key={a.id} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0 text-sm">
                  {ACTIVITY_ICONS[a.action] || '📌'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{a.details || a.action}</p>
                  <p className="text-xs text-gray-400">
                    {a.recruiter_name} · {format(new Date(a.created_at), "MMM d, HH:mm")}
                  </p>
                </div>
                {a.driver_name && (
                  <Link to={`/drivers/${a.driver_id}`} className="text-xs text-blue-600 hover:underline flex-shrink-0">
                    {a.driver_name}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
