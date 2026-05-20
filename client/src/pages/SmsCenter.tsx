import { useEffect, useState, useRef, useCallback } from 'react';
import { Send, Search, Phone, MessageSquare, Plus, Link2, ChevronDown, X, Trash2, Zap, UserPlus } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import toast from 'react-hot-toast';

interface Conversation {
  driver_id: number | null; name: string; phone: string;
  recruiter_name: string; recruiter_color: string;
  last_body?: string; last_direction?: string; last_at?: string; inbound_count: number;
}
interface Message {
  id: number; driver_id: number; direction: 'outbound' | 'inbound';
  body: string; status: string; recruiter_name?: string; created_at: string;
}
interface Template { id: number; name: string; body: string; }
interface SmsStatus { mock: boolean; twilio_number: string | null; apply_link: string; }

function formatMsgTime(dt: string) {
  const d = new Date(dt);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

function groupByDate(messages: Message[]) {
  const groups: { label: string; msgs: Message[] }[] = [];
  messages.forEach(m => {
    const d = new Date(m.created_at);
    const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMMM d, yyyy');
    const last = groups[groups.length - 1];
    if (last?.label === label) last.msgs.push(m);
    else groups.push({ label, msgs: [m] });
  });
  return groups;
}

export default function SmsCenter() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [smsStatus, setSmsStatus] = useState<SmsStatus | null>(null);
  const [showNewTpl, setShowNewTpl] = useState(false);
  const [newTpl, setNewTpl] = useState({ name: '', body: '' });

  // New SMS modal (send to any number)
  const [showNewSms, setShowNewSms] = useState(false);
  const [newSmsPhone, setNewSmsPhone] = useState('');
  const [newSmsName, setNewSmsName] = useState('');
  const [newSmsBody, setNewSmsBody] = useState('');
  const [newSmsSending, setNewSmsSending] = useState(false);
  const [allDrivers, setAllDrivers] = useState<{ id: number; name: string; phone: string }[]>([]);
  const [driverSearch, setDriverSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadConversations() {
    const [convR, tplR, statusR] = await Promise.all([
      api.get('/sms/conversations'),
      api.get('/sms/templates'),
      api.get('/sms/status'),
    ]);
    setConversations(convR.data);
    setTemplates(tplR.data);
    setSmsStatus(statusR.data);
    setLoading(false);
  }

  async function loadMessages(conv: Conversation) {
    setLoadingMsgs(true);
    const url = conv.driver_id
      ? `/sms/messages/driver/${conv.driver_id}`
      : `/sms/messages/phone/${encodeURIComponent(conv.phone)}`;
    const r = await api.get(url);
    setMessages(r.data);
    setLoadingMsgs(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  useEffect(() => {
    loadConversations();
    api.get('/drivers').then(r => setAllDrivers(r.data.filter((d: any) => d.phone)));
  }, []);

  // Poll for new messages when a conversation is open
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selected) {
      pollRef.current = setInterval(() => loadMessages(selected), 15000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selected?.driver_id, selected?.phone]);

  async function selectConversation(conv: Conversation) {
    setSelected(conv);
    setBody('');
    setShowTemplates(false);
    await loadMessages(conv);
    inputRef.current?.focus();
  }

  function openNewSms() {
    setNewSmsPhone('');
    setNewSmsName('');
    setNewSmsBody('');
    setDriverSearch('');
    setShowNewSms(true);
  }

  function pickDriver(d: { id: number; name: string; phone: string }) {
    setNewSmsPhone(d.phone);
    setNewSmsName(d.name);
    setDriverSearch('');
  }

  async function sendNewSms(e: React.FormEvent) {
    e.preventDefault();
    const phone = newSmsPhone.trim();
    if (!phone) { toast.error('Enter a phone number'); return; }
    if (!newSmsBody.trim()) { toast.error('Enter a message'); return; }
    setNewSmsSending(true);
    try {
      const { data } = await api.post('/sms/send', {
        phone,
        name: newSmsName.trim() || phone,
        body: newSmsBody.trim(),
      });
      toast.success(data.mock ? 'SMS saved (MOCK mode)' : 'SMS sent!', { icon: '📱' });
      setShowNewSms(false);
      await loadConversations();
      // Open the conversation for this phone/driver
      setTimeout(() => {
        setConversations(prev => {
          const found = prev.find(c => c.phone === phone || c.driver_id === data.driver_id);
          if (found) selectConversation(found);
          return prev;
        });
      }, 300);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Send error');
    } finally { setNewSmsSending(false); }
  }

  async function sendMessage() {
    if (!selected || !body.trim()) return;
    setSending(true);
    try {
      const payload = selected.driver_id
        ? { driver_id: selected.driver_id, body: body.trim() }
        : { phone: selected.phone, name: selected.name, body: body.trim() };
      const { data } = await api.post('/sms/send', payload);
      setMessages(prev => [...prev, data]);
      setBody('');
      if (data.warning) toast.error(`Saved but not delivered: ${data.warning}`, { duration: 5000 });
      else if (data.mock) toast.success('SMS saved (MOCK mode)', { icon: '📱' });
      else toast.success('SMS sent!', { icon: '📱' });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      loadConversations();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Send error');
    } finally { setSending(false); }
  }

  function insertTemplate(t: Template) {
    setBody(t.body);
    setShowTemplates(false);
    inputRef.current?.focus();
  }

  function insertApplyLink() {
    const link = smsStatus?.apply_link || window.location.origin + '/apply';
    setBody(b => b ? `${b} ${link}` : link);
    inputRef.current?.focus();
  }

  async function saveTpl(e: React.FormEvent) {
    e.preventDefault();
    if (!newTpl.name || !newTpl.body) { toast.error('Fill in both fields'); return; }
    try {
      const r = await api.post('/sms/templates', newTpl);
      setTemplates(t => [...t, r.data]);
      setNewTpl({ name: '', body: '' });
      setShowNewTpl(false);
      toast.success('Template saved');
    } catch { toast.error('Error'); }
  }

  async function deleteTpl(id: number) {
    await api.delete(`/sms/templates/${id}`);
    setTemplates(t => t.filter(x => x.id !== id));
    toast.success('Template deleted');
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const filtered = search
    ? conversations.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
    : conversations;

  const msgGroups = groupByDate(messages);

  const previewBody = (s: string) => s?.length > 45 ? s.slice(0, 45) + '…' : s;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── LEFT: Conversation list ─────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-gray-100 bg-white">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare size={18} className="text-blue-600" />
              SMS Center
            </h1>
            <div className="flex items-center gap-2">
              {smsStatus?.mock && (
                <span className="text-xs bg-orange-50 text-orange-500 border border-orange-200 px-2 py-0.5 rounded-full">MOCK</span>
              )}
              <button
                onClick={openNewSms}
                title="New SMS"
                className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search drivers..."
              className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="space-y-1 p-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
              <p>No drivers with phone numbers</p>
            </div>
          ) : (
            filtered.map(c => (
              <button
                key={c.driver_id}
                onClick={() => selectConversation(c)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex items-center gap-3 ${selected?.driver_id === c.driver_id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
              >
                <Avatar name={c.name} color={c.recruiter_color} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                    {c.last_at && <span className="text-xs text-gray-400 flex-shrink-0 ml-1">{formatMsgTime(c.last_at)}</span>}
                  </div>
                  {c.last_body ? (
                    <p className={`text-xs truncate mt-0.5 ${c.last_direction === 'inbound' ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                      {c.last_direction === 'inbound' ? '← ' : '→ '}{previewBody(c.last_body)}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-300 mt-0.5 italic">No messages yet</p>
                  )}
                </div>
                {c.inbound_count > 0 && (
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                    {c.inbound_count > 9 ? '9+' : c.inbound_count}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT: Conversation thread ──────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
        {!selected ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
            <div className="w-20 h-20 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
              <MessageSquare size={36} className="text-blue-400" />
            </div>
            <p className="text-lg font-semibold text-gray-600 mb-1">Select a conversation</p>
            <p className="text-sm text-center max-w-xs">Choose a driver from the left to view or start an SMS conversation</p>
            {smsStatus?.mock && (
              <div className="mt-6 bg-orange-50 border border-orange-200 rounded-xl p-4 max-w-sm text-sm text-orange-700">
                <p className="font-semibold mb-1">MOCK mode active</p>
                <p>SMS are saved but not actually sent. Configure Twilio in <code className="bg-orange-100 px-1 rounded">server/.env</code> to enable real sending.</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="bg-white border-b border-gray-100 px-5 py-3.5 flex items-center gap-3">
              <Avatar name={selected.name} color={selected.recruiter_color} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{selected.name}</p>
                <p className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{selected.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                {smsStatus?.twilio_number && (
                  <p className="text-xs text-gray-400">From: {smsStatus.twilio_number}</p>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
              {loadingMsgs ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No messages yet. Send the first one!</p>
                </div>
              ) : (
                msgGroups.map(group => (
                  <div key={group.label}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs text-gray-400 font-medium px-2">{group.label}</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                    {/* Messages in group */}
                    <div className="space-y-2">
                      {group.msgs.map(m => (
                        <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[70%] ${m.direction === 'outbound' ? 'items-end' : 'items-start'} flex flex-col`}>
                            {m.direction === 'outbound' && m.recruiter_name && (
                              <span className="text-xs text-gray-400 mb-0.5 mr-1">{m.recruiter_name}</span>
                            )}
                            <div className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                              m.direction === 'outbound'
                                ? 'bg-blue-600 text-white rounded-br-md'
                                : 'bg-white text-gray-900 shadow-sm border border-gray-100 rounded-bl-md'
                            }`}>
                              {m.body}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-gray-400">{format(new Date(m.created_at), 'h:mm a')}</span>
                              {m.direction === 'outbound' && (
                                <span className={`text-xs ${m.status === 'delivered' ? 'text-green-500' : m.status === 'failed' ? 'text-red-400' : 'text-gray-300'}`}>
                                  {m.status === 'delivered' ? '✓✓' : m.status === 'failed' ? '✗' : '✓'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Compose area */}
            <div className="bg-white border-t border-gray-100 p-4 space-y-3">
              {/* Quick action bar */}
              <div className="flex items-center gap-2 relative">
                {/* Templates button */}
                <div className="relative">
                  <button
                    onClick={() => setShowTemplates(p => !p)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                  >
                    <Zap size={12} />
                    Templates
                    <ChevronDown size={12} className={`transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
                  </button>

                  {showTemplates && (
                    <div className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-10">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-700">Quick Templates</p>
                        <button onClick={() => setShowNewTpl(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"><Plus size={11} />New</button>
                      </div>
                      <div className="max-h-64 overflow-y-auto scrollbar-thin">
                        {templates.map(t => (
                          <div key={t.id} className="flex items-start gap-2 px-4 py-2.5 hover:bg-gray-50 group border-b border-gray-50 last:border-0">
                            <button onClick={() => insertTemplate(t)} className="flex-1 text-left">
                              <p className="text-xs font-semibold text-gray-800">{t.name}</p>
                              <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{t.body}</p>
                            </button>
                            <button onClick={() => deleteTpl(t.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 flex-shrink-0 transition-opacity mt-0.5">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>

                      {showNewTpl && (
                        <form onSubmit={saveTpl} className="p-3 border-t border-gray-100 space-y-2">
                          <input value={newTpl.name} onChange={e => setNewTpl(p => ({ ...p, name: e.target.value }))} placeholder="Template name" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <textarea rows={2} value={newTpl.body} onChange={e => setNewTpl(p => ({ ...p, body: e.target.value }))} placeholder="Message... use {name}, {apply_link}, {recruiter_name}" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                          <div className="flex gap-2">
                            <button type="submit" className="flex-1 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Save</button>
                            <button type="button" onClick={() => setShowNewTpl(false)} className="flex-1 py-1.5 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50">Cancel</button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                {/* Apply link button */}
                <button
                  onClick={insertApplyLink}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg transition-colors"
                >
                  <Link2 size={12} />
                  Insert Apply Link
                </button>

                {/* Char count */}
                <span className={`ml-auto text-xs ${body.length > 160 ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                  {body.length} {body.length > 160 ? `(${Math.ceil(body.length / 160)} SMS)` : '/ 160'}
                </span>
              </div>

              {/* Variables hint */}
              <div className="text-xs text-gray-300 flex flex-wrap gap-3">
                {['{name}', '{recruiter_name}', '{recruiter_phone}', '{apply_link}'].map(v => (
                  <button key={v} onClick={() => setBody(b => b + v)} className="hover:text-blue-500 font-mono transition-colors">{v}</button>
                ))}
              </div>

              {/* Input row */}
              <div className="flex gap-3 items-end">
                <textarea
                  ref={inputRef}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  rows={2}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !body.trim()}
                  className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl transition-colors"
                >
                  {sending
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Send size={16} />
                  }
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── New SMS Modal ────────────────────────────────────────────── */}
      {showNewSms && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <UserPlus size={18} className="text-blue-600" />
                New SMS
              </h3>
              <button onClick={() => setShowNewSms(false)}><X size={18} className="text-gray-400" /></button>
            </div>

            <form onSubmit={sendNewSms} className="p-5 space-y-4">
              {/* Phone number input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Phone Number *</label>
                <input
                  type="tel"
                  value={newSmsPhone}
                  onChange={e => setNewSmsPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Name (optional) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Name <span className="text-gray-400 font-normal">(used in {'{name}'} variable)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newSmsName}
                    onChange={e => { setNewSmsName(e.target.value); setDriverSearch(e.target.value); }}
                    onFocus={() => setDriverSearch(newSmsName)}
                    placeholder="Recipient name or search existing driver..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {/* Driver autocomplete dropdown */}
                  {driverSearch.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-44 overflow-y-auto scrollbar-thin">
                      {allDrivers
                        .filter(d =>
                          d.name.toLowerCase().includes(driverSearch.toLowerCase()) ||
                          d.phone.includes(driverSearch)
                        )
                        .slice(0, 8)
                        .map(d => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => pickDriver(d)}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 last:border-0"
                          >
                            <Avatar name={d.name} size="sm" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{d.name}</p>
                              <p className="text-xs text-gray-400 flex items-center gap-1">
                                <Phone size={9} />{d.phone}
                              </p>
                            </div>
                          </button>
                        ))}
                      {allDrivers.filter(d =>
                        d.name.toLowerCase().includes(driverSearch.toLowerCase()) ||
                        d.phone.includes(driverSearch)
                      ).length === 0 && (
                        <p className="px-4 py-3 text-sm text-gray-400">No matching drivers</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Message */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700">Message *</label>
                  <div className="flex gap-2">
                    {templates.slice(0, 3).map(t => (
                      <button key={t.id} type="button" onClick={() => setNewSmsBody(t.body)}
                        className="text-xs text-blue-600 hover:underline">
                        {t.name.split(' ')[0]}
                      </button>
                    ))}
                    <button type="button" onClick={() => setNewSmsBody(b => `${b} ${smsStatus?.apply_link || '/apply'}`)}
                      className="text-xs text-green-600 hover:underline flex items-center gap-0.5">
                      <Link2 size={10} />Link
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={newSmsBody}
                  onChange={e => setNewSmsBody(e.target.value)}
                  placeholder={`Hi {name}! We have great trucking opportunities...\n\nVariables: {name} {recruiter_name} {apply_link}`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <p className={`text-xs mt-1 text-right ${newSmsBody.length > 160 ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                  {newSmsBody.length} chars{newSmsBody.length > 160 ? ` · ${Math.ceil(newSmsBody.length / 160)} SMS` : ''}
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowNewSms(false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={newSmsSending || !newSmsPhone.trim() || !newSmsBody.trim()}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                  {newSmsSending
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</>
                    : <><Send size={14} />Send SMS</>
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
