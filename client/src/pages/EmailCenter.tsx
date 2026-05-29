import { useEffect, useState, useRef, useCallback } from 'react';
import { Send, Search, Mail, Plus, Trash2, ChevronDown, X, FileText, Paperclip, Image } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import toast from 'react-hot-toast';

interface Conversation {
  driver_id: number;
  driver_name: string;
  driver_email: string;
  recruiter_name: string;
  recruiter_email: string;
  recruiter_color: string;
  last_subject: string;
  last_body: string;
  last_at: string;
  email_count: number;
}

interface AttachFile { file: File; preview?: string; }
interface SavedAttachment { filename: string; path: string; mime: string; }

function parseAttachments(raw?: string): SavedAttachment[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

interface EmailMsg {
  id: number;
  driver_id: number;
  driver_name: string;
  driver_email: string;
  recruiter_id: number;
  recruiter_name: string;
  recruiter_from_email: string;
  recruiter_color: string;
  subject: string;
  body: string;
  template_used?: string;
  direction?: 'outbound' | 'inbound';
  attachments?: string;
  sent_at: string;
}

interface Template { id: number; name: string; subject: string; body: string; category: string; }

const CATEGORY_LABELS: Record<string, string> = {
  welcome: 'Welcome', interview: 'Interview', documents: 'Documents',
  training: 'Training', offer: 'Job Offer', reminder: 'Reminder', general: 'General'
};

function formatTime(dt: string) {
  const d = new Date(dt);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

function groupByDate(msgs: EmailMsg[]) {
  const groups: { label: string; msgs: EmailMsg[] }[] = [];
  msgs.forEach(m => {
    const d = new Date(m.sent_at);
    const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMMM d, yyyy');
    const last = groups[groups.length - 1];
    if (last?.label === label) last.msgs.push(m);
    else groups.push({ label, msgs: [m] });
  });
  return groups;
}

export default function EmailCenter() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<EmailMsg[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachFiles, setAttachFiles] = useState<AttachFile[]>([]);
  const [sending, setSending] = useState(false);
  const attachRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewTpl, setShowNewTpl] = useState(false);
  const [newTpl, setNewTpl] = useState({ name: '', subject: '', body: '', category: 'general' });

  // New email modal
  const [showNew, setShowNew] = useState(false);
  const [allDrivers, setAllDrivers] = useState<{ id: number; name: string; email: string }[]>([]);
  const [driverSearch, setDriverSearch] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newDriver, setNewDriver] = useState<{ id: number; name: string; email: string } | null>(null);
  const [newSending, setNewSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const r = await api.get('/emails/conversations');
      setConversations(r.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    api.get('/emails/templates').then(r => setTemplates(r.data));
    api.get('/drivers').then(r => setAllDrivers(r.data));
  }, []);

  async function selectConversation(conv: Conversation) {
    setSelected(conv);
    setShowTemplates(false);
    const r = await api.get('/emails', { params: { driver_id: conv.driver_id } });
    setMessages(r.data);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  function addAttachFiles(files: FileList | null) {
    if (!files) return;
    const items: AttachFile[] = Array.from(files).map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }));
    setAttachFiles(prev => [...prev, ...items].slice(0, 10));
  }

  function removeAttach(i: number) {
    setAttachFiles(prev => {
      if (prev[i].preview) URL.revokeObjectURL(prev[i].preview!);
      return prev.filter((_, j) => j !== i);
    });
  }

  async function handleSend() {
    if (!selected) return;
    if (!subject.trim()) { toast.error('Enter email subject'); return; }
    if (!body.trim()) { toast.error('Enter email body'); return; }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('driver_id', String(selected.driver_id));
      fd.append('subject', subject);
      fd.append('body', body);
      attachFiles.forEach(a => fd.append('attachments', a.file));
      const r = await api.post('/emails/send', fd);
      if (r.data.mock) toast.success('Email saved (mock mode)');
      else toast.success('Email sent!');
      setSubject('');
      setBody('');
      setAttachFiles([]);
      // Reload thread from server so attachments render correctly
      const fresh = await api.get('/emails', { params: { driver_id: selected.driver_id } });
      setMessages(fresh.data);
      loadConversations();
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Send error');
    } finally {
      setSending(false);
    }
  }

  async function handleNewSend() {
    if (!newDriver) { toast.error('Select a driver'); return; }
    if (!newSubject.trim()) { toast.error('Enter subject'); return; }
    if (!newBody.trim()) { toast.error('Enter body'); return; }
    setNewSending(true);
    try {
      await api.post('/emails/send', { driver_id: newDriver.id, subject: newSubject, body: newBody });
      toast.success('Email sent!');
      setShowNew(false);
      setNewDriver(null); setNewSubject(''); setNewBody(''); setDriverSearch('');
      await loadConversations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Send error');
    } finally {
      setNewSending(false);
    }
  }

  function applyTemplate(t: Template) {
    setSubject(t.subject);
    setBody(t.body);
    setShowTemplates(false);
    toast.success(`Template "${t.name}" applied`);
  }

  function applyTemplateToNew(t: Template) {
    setNewSubject(t.subject);
    setNewBody(t.body);
    toast.success(`Template "${t.name}" applied`);
  }

  async function saveTpl() {
    if (!newTpl.name || !newTpl.subject || !newTpl.body) { toast.error('Fill in all fields'); return; }
    const r = await api.post('/emails/templates', newTpl);
    setTemplates(t => [...t, r.data]);
    setNewTpl({ name: '', subject: '', body: '', category: 'general' });
    setShowNewTpl(false);
    toast.success('Template created');
  }

  async function deleteTpl(id: number) {
    await api.delete(`/emails/templates/${id}`);
    setTemplates(t => t.filter(x => x.id !== id));
    toast.success('Template deleted');
  }

  const filtered = search
    ? conversations.filter(c =>
        c.driver_name.toLowerCase().includes(search.toLowerCase()) ||
        c.driver_email?.toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  const grouped = groupByDate(messages);

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* LEFT — conversation list */}
      <div className="w-80 flex-shrink-0 border-r border-gray-100 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-gray-900">Email Center</h1>
            <button
              onClick={() => setShowNew(true)}
              className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              title="New Email"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search driver..."
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Mail size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No email threads yet</p>
              <button onClick={() => setShowNew(true)} className="mt-3 text-xs text-blue-600 hover:underline">Start a new email</button>
            </div>
          ) : (
            filtered.map(conv => (
              <button
                key={conv.driver_id}
                onClick={() => selectConversation(conv)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selected?.driver_id === conv.driver_id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
              >
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-700">
                    {conv.driver_name.split(' ').map(p => p[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900 truncate">{conv.driver_name}</p>
                      <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{formatTime(conv.last_at)}</span>
                    </div>
                    <p className="text-xs text-gray-400 truncate">{conv.last_subject}</p>
                  </div>
                </div>
                {user?.role === 'admin' && (
                  <div className="flex items-center gap-1.5 ml-10">
                    <Avatar name={conv.recruiter_name} color={conv.recruiter_color} size="sm" />
                    <span className="text-xs text-gray-400">{conv.recruiter_name}</span>
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT — email thread */}
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
        {selected ? (
          <>
            {/* Thread header */}
            <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
                  {selected.driver_name.split(' ').map(p => p[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{selected.driver_name}</p>
                  <p className="text-xs text-gray-400">{selected.driver_email || 'No email'} · {selected.email_count} email{selected.email_count !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button
                onClick={() => setShowTemplates(v => !v)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${showTemplates ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                <FileText size={13} />
                Templates
                <ChevronDown size={12} className={`transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Templates dropdown */}
            {showTemplates && (
              <div className="bg-white border-b border-gray-100 px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Templates</p>
                  <button onClick={() => setShowNewTpl(v => !v)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Plus size={11} />New
                  </button>
                </div>
                {showNewTpl && (
                  <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input value={newTpl.name} onChange={e => setNewTpl(f => ({ ...f, name: e.target.value }))} placeholder="Template name" className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <select value={newTpl.category} onChange={e => setNewTpl(f => ({ ...f, category: e.target.value }))} className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <input value={newTpl.subject} onChange={e => setNewTpl(f => ({ ...f, subject: e.target.value }))} placeholder="Subject" className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <textarea rows={3} value={newTpl.body} onChange={e => setNewTpl(f => ({ ...f, body: e.target.value }))} placeholder="Body... {name}, {recruiter_name}, {recruiter_email}" className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
                    <div className="flex gap-2">
                      <button onClick={saveTpl} className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Save</button>
                      <button onClick={() => setShowNewTpl(false)} className="px-3 py-1 border border-gray-200 text-gray-600 text-xs rounded hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {templates.map(t => (
                    <div key={t.id} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                      <button onClick={() => applyTemplate(t)} className="text-xs text-gray-700 hover:text-blue-600 font-medium">{t.name}</button>
                      <button onClick={() => deleteTpl(t.id)} className="text-gray-300 hover:text-red-500 ml-1"><Trash2 size={11} /></button>
                    </div>
                  ))}
                  {templates.length === 0 && <p className="text-xs text-gray-400">No templates yet</p>}
                </div>
              </div>
            )}

            {/* Email thread */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
              {grouped.map(group => (
                <div key={group.label}>
                  <div className="text-center mb-3">
                    <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{group.label}</span>
                  </div>
                  {group.msgs.map(m => {
                    const isInbound = m.direction === 'inbound';
                    return (
                      <div key={m.id} className="mb-3">
                        {isInbound ? (
                          /* Inbound — from driver */
                          <div className="bg-green-50 border border-green-100 rounded-xl overflow-hidden shadow-sm">
                            <div className="px-4 py-2.5 bg-green-100/60 border-b border-green-100 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                                  {selected.driver_name.split(' ').map(p => p[0]).join('').slice(0, 2)}
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-gray-700">{selected.driver_name}</p>
                                  <p className="text-xs text-gray-400">{selected.driver_email}</p>
                                </div>
                                <span className="text-xs bg-green-200 text-green-700 px-2 py-0.5 rounded-full font-medium ml-1">Reply</span>
                              </div>
                              <p className="text-xs text-gray-400">{format(new Date(m.sent_at), 'MMM d, h:mm a')}</p>
                            </div>
                            <div className="px-4 py-2.5">
                              <p className="text-xs font-semibold text-gray-500 mb-1.5">{m.subject}</p>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{m.body}</p>
                            </div>
                          </div>
                        ) : (
                          /* Outbound — from recruiter */
                          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Avatar name={m.recruiter_name} color={m.recruiter_color} size="sm" />
                                <div>
                                  <p className="text-xs font-semibold text-gray-700">{m.recruiter_name}</p>
                                  <p className="text-xs text-gray-400">{m.recruiter_from_email}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-400">{format(new Date(m.sent_at), 'MMM d, h:mm a')}</p>
                                <p className="text-xs text-gray-300">to {selected.driver_email || selected.driver_name}</p>
                              </div>
                            </div>
                            <div className="px-4 py-2.5">
                              <p className="text-xs font-semibold text-gray-500 mb-1.5">{m.subject}</p>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{m.body}</p>
                            </div>
                            {(m.template_used || m.attachments) && (
                              <div className="px-4 pb-3">
                                {m.template_used && <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full inline-block mb-2">Template: {m.template_used}</span>}
                                {m.attachments && (() => {
                                  const files = parseAttachments(m.attachments);
                                  const images = files.filter(f => f.mime?.startsWith('image/'));
                                  const docs   = files.filter(f => !f.mime?.startsWith('image/'));
                                  return (
                                    <div className="space-y-2">
                                      {images.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                          {images.map((f, i) => (
                                            <a key={i} href={f.path} target="_blank" rel="noreferrer">
                                              <img src={f.path} alt={f.filename} className="h-28 w-auto rounded-lg border border-gray-200 object-cover hover:opacity-90 transition-opacity cursor-zoom-in" />
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                      {docs.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                          {docs.map((f, i) => (
                                            <a key={i} href={f.path} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                                              <Paperclip size={11} />{f.filename}
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <Mail size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No emails yet with {selected.driver_name}</p>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Compose area */}
            <div className="bg-white border-t border-gray-100 p-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                <span>From: <span className="text-gray-600 font-medium">{user?.email}</span></span>
                <span>→</span>
                <span>To: <span className="text-gray-600 font-medium">{selected.driver_email || 'No email on file'}</span></span>
              </div>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              />
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={`Email body...\n\nVariables: {name}, {recruiter_name}, {recruiter_phone}`}
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />

              {/* Attached files preview */}
              {attachFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {attachFiles.map((a, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">
                      {a.preview
                        ? <img src={a.preview} className="w-6 h-6 rounded object-cover" />
                        : <FileText size={14} className="text-blue-500" />}
                      <span className="text-xs text-gray-600 max-w-[120px] truncate">{a.file.name}</span>
                      <button onClick={() => removeAttach(i)} className="text-gray-400 hover:text-red-500"><X size={11} /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1">
                  <input ref={attachRef} type="file" multiple accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx" className="hidden" onChange={e => addAttachFiles(e.target.files)} />
                  <button
                    onClick={() => attachRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Attach files"
                  >
                    <Paperclip size={14} />
                    Attach
                  </button>
                  <button
                    onClick={() => { if (attachRef.current) { attachRef.current.accept = 'image/*'; attachRef.current.click(); setTimeout(() => { if (attachRef.current) attachRef.current.accept = '.jpg,.jpeg,.png,.gif,.pdf,.doc,.docx'; }, 100); }}}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Attach image"
                  >
                    <Image size={14} />
                    Photo
                  </button>
                </div>
                <button
                  onClick={handleSend}
                  disabled={sending || !selected.driver_email}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
                  title={!selected.driver_email ? 'No email address on file for this driver' : ''}
                >
                  <Send size={14} />
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
              {!selected.driver_email && (
                <p className="text-xs text-red-400 mt-1 text-right">Driver has no email address on file.</p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Mail size={48} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium text-gray-500">Select a conversation</p>
              <p className="text-sm mt-1">or start a new email thread</p>
              <button onClick={() => setShowNew(true)} className="mt-4 flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors mx-auto">
                <Plus size={15} />
                New Email
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New email modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">New Email</h2>
              <button onClick={() => { setShowNew(false); setNewDriver(null); setNewSubject(''); setNewBody(''); setDriverSearch(''); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Driver search */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">To (Driver)</label>
                {newDriver ? (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{newDriver.name}</p>
                      <p className="text-xs text-gray-500">{newDriver.email || 'No email'}</p>
                    </div>
                    <button onClick={() => setNewDriver(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={driverSearch}
                        onChange={e => setDriverSearch(e.target.value)}
                        placeholder="Search by name..."
                        className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                    {driverSearch && (
                      <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                        {allDrivers
                          .filter(d => d.name.toLowerCase().includes(driverSearch.toLowerCase()))
                          .slice(0, 8)
                          .map(d => (
                            <button
                              key={d.id}
                              onClick={() => { setNewDriver(d); setDriverSearch(''); }}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-0"
                            >
                              <span className="font-medium text-gray-900">{d.name}</span>
                              {d.email ? <span className="text-gray-400 ml-2 text-xs">{d.email}</span> : <span className="text-red-400 ml-2 text-xs">no email</span>}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Templates */}
              {templates.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">Quick Templates</p>
                  <div className="flex flex-wrap gap-1.5">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => applyTemplateToNew(t)} className="text-xs px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-blue-50 hover:text-blue-700 transition-colors">
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Subject</label>
                <input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Email subject..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Body</label>
                <textarea rows={6} value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="Email body..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => { setShowNew(false); setNewDriver(null); setNewSubject(''); setNewBody(''); setDriverSearch(''); }} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleNewSend} disabled={newSending || !newDriver || !newDriver.email} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2">
                <Send size={14} />
                {newSending ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
