import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapPin, Briefcase, Star, ArrowRight, AlertCircle, Plus, Search, X, FileText, Copy, Check, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import toast from 'react-hot-toast';

interface Lead {
  id: number; name: string; city?: string; state?: string;
  truck_type?: string; license_class?: string; experience_years?: number;
  notes?: string; source: string; status: string; claimed_by?: number;
  claimed_at?: string; created_at: string;
  recruiter_name?: string; recruiter_color?: string; doc_count?: number;
}
interface Recruiter { id: number; name: string; avatar_color: string; points: number; active_leads: number; }
interface BoardEntry {
  id: number; name: string; avatar_color: string; points: number;
  completed: number; rejected: number; active: number; transfers_out: number;
  points_earned: number; points_lost: number;
}
interface Stats { active: number; max: number; slots_left: number; points: number; }
interface PointEntry { id: number; action: string; points_change: number; description: string; created_at: string; }

const SOURCES = ['Facebook', 'Indeed', 'Organic'] as const;
type Source = typeof SOURCES[number];

const SOURCE_CONFIG: Record<Source, { icon: string; color: string; desc: string }> = {
  Facebook: { icon: '📘', color: 'text-blue-600 bg-blue-50',  desc: 'Facebook Ads leads' },
  Indeed:   { icon: '🔵', color: 'text-indigo-600 bg-indigo-50', desc: 'Indeed job listings' },
  Organic:  { icon: '🌱', color: 'text-green-600 bg-green-50',  desc: 'Direct driver applications' },
};

const ACTION_LABELS: Record<string, string> = {
  complete: 'Completed', reject: 'Rejected', transfer_out: 'Transferred', overdue: 'Overdue penalty',
};
const ACTION_COLORS: Record<string, string> = {
  complete: 'text-green-600 bg-green-50', reject: 'text-red-500 bg-red-50',
  transfer_out: 'text-orange-500 bg-orange-50', overdue: 'text-yellow-600 bg-yellow-50',
};
const MEDAL = ['🥇', '🥈', '🥉'];

export default function Leads() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const [source, setSource] = useState<Source>('Facebook');
  const [tab, setTab] = useState<'leads' | 'board'>('leads');
  const [pool, setPool] = useState<Lead[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [stats, setStats] = useState<Stats>({ active: 0, max: 10, slots_left: 10, points: 100 });
  const [history, setHistory] = useState<PointEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Transfer modal
  const [transferLead, setTransferLead] = useState<Lead | null>(null);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [transferTo, setTransferTo] = useState<number | ''>('');
  const [transferReason, setTransferReason] = useState('');

  // Add lead modal
  const [showAdd, setShowAdd] = useState(false);
  const [addSource, setAddSource] = useState<Source>('Facebook');
  const [addForm, setAddForm] = useState({ name: '', phone: '', city: '', state: '', truck_type: '', license_class: '', experience_years: '' });

  // Point history modal
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [poolR, statsR, boardR] = await Promise.all([
        api.get('/leads/pool', { params: { source, ...(search ? { search } : {}) } }),
        api.get('/leads/stats'),
        api.get('/leads/leaderboard'),
      ]);
      setPool(poolR.data);
      setStats(statsR.data);
      setBoard(boardR.data);
      if (isAdmin) {
        const allR = await api.get('/leads/all', { params: { source } });
        setAllLeads(allR.data);
      }
    } finally { setLoading(false); }
  }, [source, search, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const applyUrl = `${window.location.origin}/apply`;

  function copyLink() {
    navigator.clipboard.writeText(applyUrl);
    setLinkCopied(true);
    toast.success('Application link copied!');
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function claim(leadId: number) {
    setClaimingId(leadId);
    try {
      const { data } = await api.post(`/leads/${leadId}/claim`);
      toast.success(`"${data.driver.name}" claimed! Opening driver profile...`);
      setTimeout(() => navigate(`/drivers/${data.driver.id}`), 700);
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error claiming lead');
    } finally { setClaimingId(null); }
  }

  async function openTransfer(lead: Lead) {
    const r = await api.get('/leads/recruiters');
    setRecruiters(r.data);
    setTransferLead(lead);
    setTransferTo('');
    setTransferReason('');
  }

  async function doTransfer() {
    if (!transferLead || !transferTo) { toast.error('Select a recruiter'); return; }
    try {
      await api.post(`/leads/${transferLead.id}/transfer`, { to_recruiter_id: transferTo, reason: transferReason });
      toast.success('Lead transferred. -2 points deducted.');
      setTransferLead(null);
      load();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error'); }
  }

  async function deleteLead(leadId: number, name: string) {
    try {
      await api.delete(`/leads/${leadId}`);
      toast.success('Lead deleted');
      load();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error'); }
  }

  async function addLead(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.name.trim()) { toast.error('Name is required'); return; }
    try {
      await api.post('/leads', { ...addForm, experience_years: Number(addForm.experience_years) || 0, source: addSource });
      toast.success(`Lead added to ${addSource}`);
      setShowAdd(false);
      setAddForm({ name: '', phone: '', city: '', state: '', truck_type: '', license_class: '', experience_years: '' });
      load();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error'); }
  }

  async function loadHistory() {
    const r = await api.get('/leads/point-history');
    setHistory(r.data);
    setShowHistory(true);
  }

  const canClaim = stats.slots_left > 0;
  const displayLeads = isAdmin ? allLeads : pool;

  // ── Source tab selector ──────────────────────────────────────────
  function SourceTabs() {
    return (
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {SOURCES.map(s => {
          const cfg = SOURCE_CONFIG[s];
          return (
            <button
              key={s}
              onClick={() => { setSource(s); setSearch(''); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                source === s
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>{cfg.icon}</span>
              {s}
            </button>
          );
        })}
      </div>
    );
  }

  // ── Pool lead card (contacts hidden) ────────────────────────────
  function PoolLeadCard({ lead }: { lead: Lead }) {
    const isClaiming = claimingId === lead.id;
    const hasDocs = (lead.doc_count ?? 0) > 0;
    const cfg = SOURCE_CONFIG[lead.source as Source] ?? SOURCE_CONFIG.Facebook;

    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col hover:shadow-md hover:border-blue-100 transition-all">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 truncate">{lead.name}</p>
              {hasDocs && (
                <span className="flex items-center gap-0.5 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                  <FileText size={9} />{lead.doc_count} doc{lead.doc_count !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 mt-0.5">
              {lead.city && <span className="text-xs text-gray-400 flex items-center gap-0.5"><MapPin size={9} />{lead.city}{lead.state ? `, ${lead.state}` : ''}</span>}
              <span className="text-xs text-gray-300 italic">Contacts hidden</span>
            </div>
          </div>
          <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.icon} {lead.source}</span>
        </div>

        <div className="flex gap-1.5 flex-wrap mb-4">
          {lead.truck_type && <span className="text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Briefcase size={9} />{lead.truck_type}</span>}
          {lead.license_class && <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{lead.license_class}</span>}
          {!!lead.experience_years && <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full">{lead.experience_years}y exp</span>}
        </div>

        <div className="mt-auto flex gap-2">
          <button
            onClick={() => claim(lead.id)}
            disabled={!canClaim || isClaiming}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              isClaiming ? 'bg-blue-400 text-white cursor-wait'
              : canClaim ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <ArrowRight size={14} />
            {isClaiming ? 'Claiming...' : canClaim ? 'Claim Lead' : `Limit reached (${stats.max})`}
          </button>
          {isAdmin && (
            <button
              onClick={() => deleteLead(lead.id, lead.name)}
              className="w-10 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 rounded-lg transition-colors"
              title="Delete lead"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Admin card ──────────────────────────────────────────────────
  function AdminLeadCard({ lead }: { lead: Lead }) {
    const STATUS_CLS: Record<string, string> = {
      available:  'bg-blue-50 text-blue-600',
      claimed:    'bg-green-50 text-green-700',
      completed:  'bg-emerald-50 text-emerald-700',
      rejected:   'bg-red-50 text-red-500',
    };
    const hasDocs = (lead.doc_count ?? 0) > 0;
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 group hover:border-gray-200 transition-all">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{lead.name}</p>
            {hasDocs && <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 flex-shrink-0"><FileText size={9} />{lead.doc_count}</span>}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLS[lead.status] || 'bg-gray-50 text-gray-500'}`}>{lead.status}</span>
            <button
              onClick={() => deleteLead(lead.id, lead.name)}
              className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Delete lead"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-400 space-y-0.5 mb-3">
          {lead.city && <p className="flex items-center gap-1"><MapPin size={9} />{lead.city}{lead.state ? `, ${lead.state}` : ''}</p>}
          {lead.truck_type && <p className="flex items-center gap-1"><Briefcase size={9} />{lead.truck_type} · {lead.license_class} · {lead.experience_years}y</p>}
          {lead.notes && <p className="truncate text-gray-300 italic">{lead.notes}</p>}
        </div>
        {lead.status !== 'available' && lead.recruiter_name && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
            <Avatar name={lead.recruiter_name} color={lead.recruiter_color} size="sm" />
            <span className="text-xs text-gray-500">{lead.recruiter_name}</span>
            {lead.claimed_at && <span className="text-xs text-gray-300">· {format(new Date(lead.claimed_at), 'MMM d')}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500">Claim a lead to unlock contact info and open a driver profile</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={loadHistory} className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 px-3 py-2 rounded-xl hover:bg-yellow-100 transition-colors">
            <Star size={15} className="text-yellow-500 fill-yellow-400" />
            <span className="text-sm font-bold text-yellow-700">{stats.points} pts</span>
          </button>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium ${
            stats.slots_left > 3 ? 'bg-green-50 border-green-200 text-green-700'
            : stats.slots_left > 0 ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
            : 'bg-red-50 border-red-200 text-red-600'
          }`}>
            <span>{stats.active}/{stats.max}</span>
            <span className="text-xs font-normal">active</span>
          </div>
          {/* Copy apply link */}
          <button onClick={copyLink} className="flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            {linkCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            {linkCopied ? 'Copied!' : 'Apply Link'}
          </button>
          {isAdmin && (
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
              <Plus size={15} />
              Add Lead
            </button>
          )}
        </div>
      </div>

      {/* Capacity bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Lead Capacity</p>
          <p className="text-xs text-gray-400">{stats.slots_left} slot{stats.slots_left !== 1 ? 's' : ''} left</p>
        </div>
        <div className="bg-gray-100 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${stats.active >= stats.max ? 'bg-red-500' : stats.active >= 7 ? 'bg-yellow-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min((stats.active / stats.max) * 100, 100)}%` }} />
        </div>
      </div>

      {/* Top nav: Leads / Leaderboard */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => setTab('leads')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'leads' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Lead Pool
          </button>
          <button onClick={() => setTab('board')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'board' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            🏆 Leaderboard
          </button>
        </div>
      </div>

      {tab === 'leads' && (
        <>
          {/* Source tabs */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <SourceTabs />
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                className="pl-8 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
            </div>
          </div>

          {/* Organic callout with apply link */}
          {source === 'Organic' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🌱</span>
                <div>
                  <p className="text-sm font-semibold text-green-800">Driver Self-Applications</p>
                  <p className="text-sm text-green-700 mt-0.5">Drivers who filled out the application form appear here.</p>
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    Share: <span className="font-mono bg-white px-2 py-0.5 rounded border border-green-200 ml-1">{applyUrl}</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={copyLink} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors">
                  {linkCopied ? <><Check size={12} />Copied!</> : <><Copy size={12} />Copy Link</>}
                </button>
                <a href="/apply" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                  Open Form ↗
                </a>
              </div>
            </div>
          )}

          {/* Info banner */}
          {source !== 'Organic' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span><strong>Contacts are hidden</strong> until you claim a lead — this prevents cherry-picking and keeps the process fair.</span>
            </div>
          )}
          {source === 'Organic' && !isAdmin && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span><strong>Contacts are hidden</strong> — claim a lead to see their phone, email, and uploaded documents.</span>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : displayLeads.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              <p className="text-5xl mb-4">{SOURCE_CONFIG[source]?.icon || '📋'}</p>
              <p className="font-semibold text-gray-600">No {source} leads available</p>
              <p className="text-sm mt-1">
                {source === 'Organic'
                  ? <>Share the <button onClick={copyLink} className="text-blue-500 underline">application link</button> with potential drivers</>
                  : `Check back later or ask admin to add ${source} leads`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayLeads.map(l =>
                isAdmin
                  ? <AdminLeadCard key={l.id} lead={l} />
                  : <PoolLeadCard key={l.id} lead={l} />
              )}
            </div>
          )}
        </>
      )}

      {/* ── LEADERBOARD ── */}
      {tab === 'board' && (
        <div className="space-y-5">
          {board.length >= 3 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {board.slice(0, 3).map((r, i) => (
                <div key={r.id} className={`bg-white rounded-xl border shadow-sm p-5 text-center ${i === 0 ? 'border-yellow-300 ring-2 ring-yellow-100' : 'border-gray-100'}`}>
                  <div className="text-3xl mb-3">{MEDAL[i]}</div>
                  <div className="flex justify-center mb-2"><Avatar name={r.name} color={r.avatar_color} size="lg" /></div>
                  <p className="text-sm font-bold text-gray-900">{r.name}</p>
                  <p className="text-2xl font-bold text-yellow-500 mt-1">{r.points} <span className="text-sm text-gray-400 font-normal">pts</span></p>
                  <div className="flex justify-center gap-4 mt-3 text-xs">
                    <span className="text-green-600 font-medium">{r.completed} won</span>
                    <span className="text-red-400">{r.rejected} lost</span>
                    <span className="text-blue-500">{r.active} active</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Recruiter</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Points</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Completed</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Active</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Rejected</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Transferred</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">+/−</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {board.map((r, i) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm">{MEDAL[i] || `#${i + 1}`}</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar name={r.name} color={r.avatar_color} size="sm" /><span className="text-sm font-medium text-gray-900">{r.name}</span></div></td>
                    <td className="px-4 py-3 text-center"><span className="text-sm font-bold text-yellow-600 flex items-center justify-center gap-1"><Star size={12} className="fill-yellow-400 text-yellow-400" />{r.points}</span></td>
                    <td className="px-4 py-3 text-center text-sm font-semibold text-green-600">{r.completed}</td>
                    <td className="px-4 py-3 text-center text-sm text-blue-600">{r.active}</td>
                    <td className="px-4 py-3 text-center text-sm text-red-400">{r.rejected}</td>
                    <td className="px-4 py-3 text-center text-sm text-orange-400">{r.transfers_out}</td>
                    <td className="px-4 py-3 text-center text-xs"><span className="text-green-600">+{r.points_earned}</span>{' / '}<span className="text-red-400">{r.points_lost}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Transfer Modal ── */}
      {transferLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Transfer Lead</h3>
              <button onClick={() => setTransferLead(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-orange-50 rounded-lg p-3 text-sm text-orange-700"><strong>−2 points</strong> will be deducted for transferring.</div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Transfer to</label>
                <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                  {recruiters.map(r => (
                    <label key={r.id} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${transferTo === r.id ? 'border-blue-400 bg-blue-50' : 'border-gray-100 hover:border-gray-300'} ${r.active_leads >= 10 ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <input type="radio" className="hidden" disabled={r.active_leads >= 10} checked={transferTo === r.id} onChange={() => r.active_leads < 10 && setTransferTo(r.id)} />
                        <Avatar name={r.name} color={r.avatar_color} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{r.name}</p>
                          <p className="text-xs text-gray-400">{r.active_leads}/10 active</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-yellow-600">⭐ {r.points}</span>
                    </label>
                  ))}
                </div>
              </div>
              <input value={transferReason} onChange={e => setTransferReason(e.target.value)} placeholder="Reason (optional)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-3">
                <button onClick={() => setTransferLead(null)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={doTransfer} disabled={!transferTo} className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">Transfer (−2 pts)</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Lead Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Add New Lead</h3>
              <button onClick={() => setShowAdd(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={addLead} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Source</label>
                <div className="flex gap-2">
                  {SOURCES.map(s => (
                    <button key={s} type="button" onClick={() => setAddSource(s)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${addSource === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {SOURCE_CONFIG[s].icon} {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Full Name *</label>
                <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="John Smith" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
                  <input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
                  <input value={addForm.city} onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Truck Type</label>
                  <select value={addForm.truck_type} onChange={e => setAddForm(f => ({ ...f, truck_type: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select...</option>
                    {['Semi Truck','Refrigerated','Box Truck','Flatbed','Tanker','Car Hauler'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">License Class</label>
                  <select value={addForm.license_class} onChange={e => setAddForm(f => ({ ...f, license_class: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select...</option>
                    {['CDL-A','CDL-B','CDL-C'].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-blue-700">Add Lead</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Point History Modal ── */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Star size={16} className="text-yellow-500 fill-yellow-400" />Point History</h3>
              <button onClick={() => setShowHistory(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2">
              {history.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No history yet</p> : history.map(h => (
                <div key={h.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${ACTION_COLORS[h.action] || 'bg-gray-50 text-gray-500'}`}>{ACTION_LABELS[h.action] || h.action}</span>
                    <p className="text-sm text-gray-600 truncate">{h.description}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${h.points_change > 0 ? 'text-green-600' : 'text-red-500'}`}>{h.points_change > 0 ? '+' : ''}{h.points_change}</p>
                    <p className="text-xs text-gray-400">{format(new Date(h.created_at), 'MMM d')}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 text-center">
              <p className="text-sm font-semibold text-gray-700">Balance: <span className="text-yellow-600 font-bold">{stats.points} pts</span></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
