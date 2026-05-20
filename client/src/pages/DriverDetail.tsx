import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, MapPin, Briefcase, Edit2, Save, X, Trash2, Send, Plus, Clock, Star, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { Driver, StatusHistory, Note, Email, DriverStatus } from '../types';
import StatusBadge, { statusLabel } from '../components/StatusBadge';
import Avatar from '../components/Avatar';
import toast from 'react-hot-toast';

const STATUSES: DriverStatus[] = ['new', 'contacted', 'interview', 'documents', 'training', 'active', 'inactive', 'rejected'];
const TRUCK_TYPES = ['Semi Truck', 'Refrigerated', 'Tanker', 'Box Truck', 'Flatbed', 'Dump Truck', 'Car Hauler', 'Van'];
const SOURCES = ['Indeed', 'LinkedIn', 'Referral', 'Facebook', 'Cold Call', 'Website', 'ZipRecruiter', 'Other'];

export default function DriverDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [tab, setTab] = useState<'info' | 'history' | 'notes' | 'emails'>('info');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Driver>>({});
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const [d, h, n, e] = await Promise.all([
      api.get(`/drivers/${id}`),
      api.get(`/drivers/${id}/history`),
      api.get(`/drivers/${id}/notes`),
      api.get(`/drivers/${id}/emails`),
    ]);
    setDriver(d.data);
    setHistory(h.data);
    setNotes(n.data);
    setEmails(e.data);
    setForm(d.data);
  }

  useEffect(() => { load(); }, [id]);

  async function changeStatus(status: DriverStatus) {
    try {
      await api.put(`/drivers/${id}/status`, { status });
      toast.success(`Status changed to "${statusLabel(status)}"`);
      load();
    } catch { toast.error('Error changing status'); }
  }

  async function saveEdit() {
    try {
      await api.put(`/drivers/${id}`, form);
      toast.success('Saved');
      setEditing(false);
      load();
    } catch { toast.error('Save error'); }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/drivers/${id}/notes`, { text: newNote });
      setNewNote('');
      toast.success('Note added');
      load();
    } catch { toast.error('Error'); } finally { setSavingNote(false); }
  }

  async function deleteNote(noteId: number) {
    await api.delete(`/drivers/${id}/notes/${noteId}`);
    toast.success('Note deleted');
    load();
  }

  async function deleteDriver() {
    if (!confirm(`Delete driver "${driver?.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/drivers/${id}`);
      toast.success('Driver deleted');
      navigate('/drivers');
    } catch { toast.error('Error'); setDeleting(false); }
  }

  if (!driver) return (
    <div className="p-6 animate-pulse space-y-4">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="h-48 bg-gray-200 rounded-xl" />
    </div>
  );

  const canEdit = user?.role === 'admin' || driver.recruiter_id === user?.id;
  const isLeadDriver = !!driver.lead_id;

  async function completeLead() {
    if (!driver?.lead_id) return;
    if (!confirm('Mark this lead as successfully converted? (+10 points)')) return;
    try {
      await api.put(`/leads/${driver.lead_id}/complete`);
      toast.success('🎉 Lead completed! +10 points earned');
      load();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error'); }
  }

  async function rejectLead() {
    if (!driver?.lead_id) return;
    if (!confirm('Mark this lead as failed/rejected? (−3 points)')) return;
    try {
      await api.put(`/leads/${driver.lead_id}/reject`);
      toast.error('Lead rejected. −3 points deducted.');
      load();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error'); }
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <Link to="/drivers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} />
        Back to Drivers
      </Link>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-xl font-bold text-blue-700 flex-shrink-0">
            {driver.name.split(' ').map(p => p[0]).join('').slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{driver.name}</h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <StatusBadge status={driver.status} />
                  {driver.truck_type && <span className="text-sm text-gray-500 flex items-center gap-1"><Briefcase size={13} />{driver.truck_type}</span>}
                  {driver.city && <span className="text-sm text-gray-500 flex items-center gap-1"><MapPin size={13} />{driver.city}{driver.state ? `, ${driver.state}` : ''}</span>}
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-2 flex-shrink-0">
                  <Link to={`/emails?driver=${driver.id}`} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
                    <Send size={14} />
                    Email
                  </Link>
                  {!editing ? (
                    <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                      <Edit2 size={14} />
                      Edit
                    </button>
                  ) : (
                    <>
                      <button onClick={saveEdit} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                        <Save size={14} />
                        Save
                      </button>
                      <button onClick={() => setEditing(false)} className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                        <X size={14} />
                      </button>
                    </>
                  )}
                  <button onClick={deleteDriver} disabled={deleting} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-4 mt-4 pt-4 border-t border-gray-50 flex-wrap">
          {driver.phone && <a href={`tel:${driver.phone}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600"><Phone size={15} />{driver.phone}</a>}
          {driver.email && <a href={`mailto:${driver.email}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600"><Mail size={15} />{driver.email}</a>}
          {driver.start_date && <span className="flex items-center gap-2 text-sm text-green-600"><Clock size={15} />Starts {format(new Date(driver.start_date), "MMMM d, yyyy")}</span>}
        </div>
      </div>

      {canEdit && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Change Status</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map(s => (
              <button key={s} onClick={() => changeStatus(s)} disabled={driver.status === s}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${driver.status === s ? 'bg-blue-600 text-white cursor-default' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {statusLabel(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Assigned Recruiter</p>
        <div className="flex items-center gap-3">
          <Avatar name={driver.recruiter_name || ''} color={driver.recruiter_color} size="md" />
          <div>
            <p className="text-sm font-semibold text-gray-900">{driver.recruiter_name}</p>
            <p className="text-xs text-gray-400">{driver.recruiter_email}</p>
          </div>
        </div>
      </div>

      {/* Lead Actions — shown only for Facebook lead-originated drivers */}
      {isLeadDriver && canEdit && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Star size={15} className="text-yellow-500 fill-yellow-400" />
            <p className="text-sm font-semibold text-gray-800">Facebook Lead Actions</p>
            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">📘 Lead #{driver.lead_id}</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">This driver came from a Facebook lead. Record the outcome to update your points.</p>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={completeLead}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <CheckCircle size={15} />
              Lead Converted (+10 pts)
            </button>
            <button
              onClick={rejectLead}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-lg border border-red-200 transition-colors"
            >
              <XCircle size={15} />
              Lead Failed (−3 pts)
            </button>
            <Link
              to="/leads"
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-600 text-sm font-semibold rounded-lg border border-orange-200 transition-colors"
            >
              <RefreshCw size={15} />
              Transfer Lead (−2 pts)
            </Link>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'info',    label: 'Details' },
            { key: 'notes',   label: `Notes (${notes.length})` },
            { key: 'history', label: 'Status History' },
            { key: 'emails',  label: `Emails (${emails.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'info' && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Email',            key: 'email',              type: 'email' },
                { label: 'Phone',            key: 'phone',              type: 'tel' },
                { label: 'City',             key: 'city',               type: 'text' },
                { label: 'State',            key: 'state',              type: 'text' },
                { label: 'Truck Type',       key: 'truck_type',         type: 'select', options: TRUCK_TYPES },
                { label: 'License Class',    key: 'license_class',      type: 'select', options: ['CDL-A', 'CDL-B', 'CDL-C', 'Class A', 'Class B'] },
                { label: 'Experience (yrs)', key: 'experience_years',   type: 'number' },
                { label: 'Source',           key: 'source',             type: 'select', options: SOURCES },
                { label: 'Pay Expectation',  key: 'salary_expectation', type: 'text' },
                { label: 'Start Date',       key: 'start_date',         type: 'date' },
              ].map(({ label, key, type, options }) => (
                <div key={key}>
                  <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
                  {editing ? (
                    type === 'select' ? (
                      <select value={(form as any)[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">—</option>
                        {options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={type} value={(form as any)[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    )
                  ) : (
                    <p className="text-sm text-gray-900">{(driver as any)[key] || <span className="text-gray-300">—</span>}</p>
                  )}
                </div>
              ))}
              <div className="col-span-2">
                <p className="text-xs font-semibold text-gray-500 mb-1">Notes</p>
                {editing ? (
                  <textarea rows={3} value={form.bio || ''} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                ) : (
                  <p className="text-sm text-gray-900">{driver.bio || <span className="text-gray-300">—</span>}</p>
                )}
              </div>
            </div>
          )}

          {tab === 'notes' && (
            <div className="space-y-4">
              {canEdit && (
                <div className="flex gap-3">
                  <textarea rows={2} value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..." className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  <button onClick={addNote} disabled={savingNote || !newNote.trim()} className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
              )}
              {notes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No notes yet</p>
              ) : (
                notes.map(n => (
                  <div key={n.id} className="flex gap-3 group">
                    <Avatar name={n.recruiter_name} color={n.avatar_color} size="sm" />
                    <div className="flex-1 bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700">{n.recruiter_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{format(new Date(n.created_at), "MMM d, HH:mm")}</span>
                          {(user?.role === 'admin' || n.recruiter_id === user?.id) && (
                            <button onClick={() => deleteNote(n.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"><X size={13} /></button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No history yet</p>
              ) : (
                history.map(h => (
                  <div key={h.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">
                        {h.old_status
                          ? <><StatusBadge status={h.old_status} /> → <StatusBadge status={h.new_status} /></>
                          : <><span className="text-gray-400">Created</span> → <StatusBadge status={h.new_status} /></>
                        }
                      </p>
                      {h.notes && <p className="text-xs text-gray-400 mt-0.5">{h.notes}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{h.changed_by_name} · {format(new Date(h.created_at), "MMM d yyyy, HH:mm")}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'emails' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Link to={`/emails?driver=${driver.id}`} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <Send size={13} />
                  Compose Email
                </Link>
              </div>
              {emails.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No emails sent yet</p>
              ) : (
                emails.map(e => (
                  <div key={e.id} className="border border-gray-100 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-medium text-gray-900">{e.subject}</p>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-3">{format(new Date(e.sent_at), "MMM d, HH:mm")}</span>
                    </div>
                    <p className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-3">{e.body}</p>
                    <p className="text-xs text-gray-400 mt-2">Sent by: {e.recruiter_name}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
