import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, Search, Plus, Trash2, Eye, X } from 'lucide-react';
import { format } from 'date-fns';
import api from '../api';
import { Driver, Email, EmailTemplate } from '../types';
import toast from 'react-hot-toast';

const CATEGORY_LABELS: Record<string, string> = {
  welcome:  'Welcome',
  interview:'Interview',
  documents:'Documents',
  training: 'Training',
  offer:    'Job Offer',
  reminder: 'Reminder',
  general:  'General'
};

export default function EmailCenter() {
  const [searchParams] = useSearchParams();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [driverSearch, setDriverSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templateUsed, setTemplateUsed] = useState('');
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<'compose' | 'templates' | 'history'>('compose');
  const [previewEmail, setPreviewEmail] = useState<Email | null>(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [tplForm, setTplForm] = useState({ name: '', subject: '', body: '', category: 'general' });

  useEffect(() => {
    api.get('/drivers').then(r => setDrivers(r.data));
    api.get('/emails/templates').then(r => setTemplates(r.data));
    api.get('/emails').then(r => setEmails(r.data));
  }, []);

  useEffect(() => {
    const driverId = searchParams.get('driver');
    if (driverId && drivers.length > 0) {
      const d = drivers.find(d => d.id === parseInt(driverId));
      if (d) setSelectedDriver(d);
    }
  }, [searchParams, drivers]);

  const filteredDrivers = driverSearch
    ? drivers.filter(d => d.name.toLowerCase().includes(driverSearch.toLowerCase()) || d.phone?.includes(driverSearch))
    : drivers;

  function applyTemplate(t: EmailTemplate) {
    setSubject(t.subject);
    setBody(t.body);
    setTemplateUsed(t.name);
    setTab('compose');
    toast.success(`Template "${t.name}" applied`);
  }

  async function handleSend() {
    if (!selectedDriver) { toast.error('Select a driver'); return; }
    if (!subject.trim()) { toast.error('Enter email subject'); return; }
    if (!body.trim()) { toast.error('Enter email body'); return; }
    setSending(true);
    try {
      const r = await api.post('/emails/send', { driver_id: selectedDriver.id, subject, body, template_used: templateUsed || undefined });
      if (r.data.mock) {
        toast.success('Email saved (MOCK mode — real sending disabled)');
      } else {
        toast.success('Email sent!');
      }
      setSubject('');
      setBody('');
      setTemplateUsed('');
      const updated = await api.get('/emails');
      setEmails(updated.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Send error');
    } finally {
      setSending(false);
    }
  }

  async function deleteTemplate(id: number) {
    if (!confirm('Delete this template?')) return;
    await api.delete(`/emails/templates/${id}`);
    setTemplates(t => t.filter(x => x.id !== id));
    toast.success('Template deleted');
  }

  async function saveTemplate() {
    if (!tplForm.name || !tplForm.subject || !tplForm.body) { toast.error('Fill in all fields'); return; }
    const r = await api.post('/emails/templates', tplForm);
    setTemplates(t => [...t, r.data]);
    setTplForm({ name: '', subject: '', body: '', category: 'general' });
    setShowNewTemplate(false);
    toast.success('Template created');
  }

  return (
    <div className="p-6 h-full">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Email Center</h1>
        <p className="text-sm text-gray-500">{emails.length} emails sent</p>
      </div>

      <div className="flex gap-2 mb-5">
        {[
          { key: 'compose',   label: 'Compose' },
          { key: 'templates', label: `Templates (${templates.length})` },
          { key: 'history',   label: `History (${emails.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'compose' && (
        <div className="grid grid-cols-3 gap-5 h-[calc(100vh-220px)]">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col">
            <div className="p-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Recipient</p>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={driverSearch} onChange={e => setDriverSearch(e.target.value)} placeholder="Search driver..." className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
              {filteredDrivers.map(d => (
                <button key={d.id} onClick={() => setSelectedDriver(d)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors mb-1 ${selectedDriver?.id === d.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}>
                  <p className="text-sm font-medium text-gray-900">{d.name}</p>
                  {d.email ? <p className="text-xs text-gray-400">{d.email}</p> : <p className="text-xs text-red-400">No email</p>}
                </button>
              ))}
            </div>
          </div>

          <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col">
            <div className="p-4 border-b border-gray-100">
              {selectedDriver ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">To: {selectedDriver.name}</p>
                    <p className="text-xs text-gray-400">{selectedDriver.email || 'no email'}</p>
                  </div>
                  <button onClick={() => setTab('templates')} className="text-xs text-blue-600 hover:underline">Use template</button>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Select a driver from the left</p>
              )}
            </div>
            <div className="flex-1 p-4 flex flex-col gap-3">
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject..." className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <textarea value={body} onChange={e => setBody(e.target.value)}
                placeholder={`Email body...\n\nAvailable variables:\n{name} — driver name\n{recruiter_name} — your name\n{recruiter_phone} — your phone`}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              {templateUsed && <p className="text-xs text-blue-600">Template: {templateUsed} <button onClick={() => setTemplateUsed('')} className="ml-1 text-gray-400 hover:text-gray-600">×</button></p>}
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end">
              <button onClick={handleSend} disabled={sending || !selectedDriver}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">
                <Send size={15} />
                {sending ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">Ready-made templates for quick sending</p>
            <button onClick={() => setShowNewTemplate(true)} className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus size={14} />
              New Template
            </button>
          </div>

          {showNewTemplate && (
            <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 space-y-3">
              <h3 className="font-semibold text-gray-900">New Template</h3>
              <div className="grid grid-cols-2 gap-3">
                <input value={tplForm.name} onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))} placeholder="Template name" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <select value={tplForm.category} onChange={e => setTplForm(f => ({ ...f, category: e.target.value }))} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <input value={tplForm.subject} onChange={e => setTplForm(f => ({ ...f, subject: e.target.value }))} placeholder="Email subject" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <textarea rows={5} value={tplForm.body} onChange={e => setTplForm(f => ({ ...f, body: e.target.value }))} placeholder="Template body... Use {name}, {recruiter_name}, {recruiter_phone}" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <div className="flex gap-2">
                <button onClick={saveTemplate} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Create</button>
                <button onClick={() => setShowNewTemplate(false)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    <span className="inline-block text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mt-1">{CATEGORY_LABELS[t.category] || t.category}</span>
                  </div>
                  <button onClick={() => deleteTemplate(t.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                </div>
                <p className="text-xs text-gray-500 mb-1 font-medium">{t.subject}</p>
                <p className="text-xs text-gray-400 line-clamp-3 whitespace-pre-wrap">{t.body}</p>
                <button onClick={() => applyTemplate(t)} className="mt-3 w-full py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors">
                  Use This Template
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Driver</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Recruiter</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {emails.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{e.driver_name}</p>
                    <p className="text-xs text-gray-400">{e.driver_email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{e.subject}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{e.recruiter_name}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{format(new Date(e.sent_at), "MMM d, HH:mm")}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setPreviewEmail(e)} className="text-gray-300 hover:text-blue-500"><Eye size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {emails.length === 0 && <div className="py-16 text-center text-gray-400"><p>No emails sent yet</p></div>}
        </div>
      )}

      {previewEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">{previewEmail.subject}</h3>
              <button onClick={() => setPreviewEmail(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5">
              <div className="text-xs text-gray-400 mb-3 space-y-0.5">
                <p>To: {previewEmail.driver_name} &lt;{previewEmail.driver_email}&gt;</p>
                <p>From: {previewEmail.recruiter_name}</p>
                <p>Date: {format(new Date(previewEmail.sent_at), "MMMM d yyyy, HH:mm")}</p>
              </div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-4">{previewEmail.body}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
