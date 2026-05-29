import { useState, useRef } from 'react';
import { Truck, CheckCircle, Upload, X, FileText, Phone, Star, DollarSign, MapPin, Shield, Clock, Send } from 'lucide-react';
import axios from 'axios';

const BENEFITS = [
  { icon: DollarSign, title: 'Top Pay',          desc: 'Competitive rates & weekly settlements' },
  { icon: MapPin,     title: 'Great Routes',      desc: 'OTR, regional & local lanes available' },
  { icon: Shield,     title: 'Full Benefits',     desc: 'Medical, dental & vision coverage' },
  { icon: Clock,      title: 'Flexible Schedule', desc: 'Home time options for every driver' },
];

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

interface DocFile { file: File; preview?: string; }

type DocKey = 'cdl_front' | 'cdl_back' | 'prev_cdl' | 'med_card';

const DOC_FIELDS: { key: DocKey; label: string; required: boolean; hint: string }[] = [
  { key: 'cdl_front', label: 'CDL (Commercial Driver\'s License) — Front', required: true,  hint: 'Upload a clear photo or scan of the front of your CDL' },
  { key: 'cdl_back',  label: 'CDL (Commercial Driver\'s License) — Back',  required: true,  hint: 'Upload a clear photo or scan of the back of your CDL' },
  { key: 'prev_cdl',  label: 'Previous CDL (if applicable)',               required: false, hint: 'Upload if you have a previous license from another state' },
  { key: 'med_card',  label: 'Medical Card (Med Card)',                     required: false, hint: 'Upload your current DOT medical examiner\'s certificate' },
];

const inputCls = (err?: boolean) =>
  `w-full bg-white/[0.06] border ${err ? 'border-red-400' : 'border-white/[0.12]'} rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors`;

export default function Apply() {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [docs, setDocs] = useState<Partial<Record<DocKey, DocFile>>>({});
  const fileRefs = useRef<Partial<Record<DocKey, HTMLInputElement | null>>>({});

  const [form, setForm] = useState({
    name: '', phone: '', email: '', city: '', state: '',
    truck_type: '', license_class: '', experience_years: '', ssn: '',
  });

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: '' }));
  }

  function setDoc(key: DocKey, file: File | null) {
    if (!file) { setDocs(d => { const n = { ...d }; delete n[key]; return n; }); return; }
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    setDocs(d => ({ ...d, [key]: { file, preview } }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: '' }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim())  e.name  = 'Full name is required';
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    if (!form.email.trim()) e.email = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email address';
    if (!docs.cdl_front) e.cdl_front = 'CDL front is required';
    if (!docs.cdl_back)  e.cdl_back  = 'CDL back is required';
    if (!confirmed) e.confirmed = 'Please confirm your information';
    setErrors(e);
    if (Object.keys(e).length > 0) document.getElementById('form-top')?.scrollIntoView({ behavior: 'smooth' });
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      (Object.entries(docs) as [DocKey, DocFile][]).forEach(([key, d]) => fd.append(key, d.file));
      const { data } = await axios.post('/api/apply', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setReference(data.reference);
      setStep('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Submission error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-[#0d1526] flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-8 text-center backdrop-blur">
            <div className="w-20 h-20 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={36} className="text-green-400" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">Thank you!</h2>
            <p className="text-slate-400 leading-relaxed mb-2">
              Your documents have been submitted to <span className="text-white font-medium">One Prime Fleet</span>.
            </p>
            <p className="text-slate-400 leading-relaxed mb-8">
              Our recruiter will review everything and contact you within <span className="text-blue-400 font-semibold">24 hours</span>.
            </p>

            <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-4 mb-6">
              <p className="text-xs text-blue-400 uppercase font-bold tracking-wider mb-1">Reference Number</p>
              <p className="text-2xl font-bold text-white tracking-widest font-mono">{reference}</p>
            </div>

            {/* Next step — Telegram */}
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 mb-6 text-left">
              <p className="text-xs text-slate-400 uppercase font-semibold mb-3 tracking-wide">Next Steps</p>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-blue-400 font-bold">1</span>
                </div>
                <p className="text-sm text-slate-300">Documents are under review by our team</p>
              </div>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-blue-400 font-bold">2</span>
                </div>
                <p className="text-sm text-slate-300">Recruiter will call you within 24 hours</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-blue-400 font-bold">3</span>
                </div>
                <div>
                  <p className="text-sm text-slate-300 mb-1">Contact us on Telegram to proceed with onboarding</p>
                  <a
                    href="https://t.me/oneprimefleet"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Send size={12} />
                    Our Telegram
                  </a>
                </div>
              </div>
            </div>

            <button onClick={() => window.location.reload()} className="w-full py-3 border border-white/10 text-slate-400 text-sm rounded-xl hover:bg-white/5 transition-colors">
              Submit another application
            </button>
          </div>
          <p className="text-center text-slate-600 text-xs mt-5">
            Questions? Call us at <a href="tel:+15742120100" className="text-slate-400 hover:text-white">+1 (574) 212-0100</a>
          </p>
        </div>
      </div>
    );
  }

  const totalFields = 3 + 2; // name+phone+email + 2 required docs
  const filled = [form.name, form.phone, form.email, docs.cdl_front, docs.cdl_back].filter(Boolean).length;
  const progress = Math.round((filled / totalFields) * 100);

  return (
    <div className="min-h-screen bg-[#0d1526]">
      {/* Navbar */}
      <header className="border-b border-white/[0.06] sticky top-0 z-10 backdrop-blur bg-[#0d1526]/90">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <Truck size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">One Prime Fleet</p>
              <p className="text-slate-500 text-xs">Driver Onboarding</p>
            </div>
          </div>
          <a href="tel:+15742120100" className="hidden sm:flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
            <Phone size={14} />
            +1 (574) 212-0100
          </a>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-2xl mx-auto px-6 pt-12 pb-8 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-600/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-5">
          <Star size={12} className="text-blue-400 fill-blue-400" />
          <span className="text-xs text-blue-300 font-medium">Now Hiring — CDL Drivers Nationwide</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 leading-tight">
          Drive with <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">One Prime Fleet</span>
        </h1>
        <p className="text-slate-400 text-base max-w-lg mx-auto mb-8">
          Submit your documents below and our team will reach out within 24 hours.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-3 text-left">
              <div className="w-8 h-8 bg-blue-600/20 border border-blue-500/20 rounded-xl flex items-center justify-center mb-2">
                <Icon size={14} className="text-blue-400" />
              </div>
              <p className="text-white text-xs font-semibold mb-0.5">{title}</p>
              <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-6 pb-20" id="form-top">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Personal info */}
          <FormCard label="Full Name" required error={errors.name}>
            <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls(!!errors.name)} placeholder="John Smith" />
          </FormCard>

          <FormCard label="Phone Number" required error={errors.phone}>
            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls(!!errors.phone)} placeholder="+1 (555) 000-0000" />
          </FormCard>

          <FormCard label="Email Address" required error={errors.email}>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls(!!errors.email)} placeholder="john@email.com" />
          </FormCard>

          <div className="grid grid-cols-2 gap-4">
            <FormCard label="City">
              <input value={form.city} onChange={e => set('city', e.target.value)} className={inputCls()} placeholder="Dallas" />
            </FormCard>
            <FormCard label="State">
              <select value={form.state} onChange={e => set('state', e.target.value)} className="w-full bg-[#1a2540] border border-white/[0.12] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select...</option>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormCard>
          </div>

          {/* Document uploads */}
          {DOC_FIELDS.map(({ key, label, required, hint }) => (
            <FormCard key={key} label={label} required={required} error={errors[key]}>
              <p className="text-slate-500 text-xs mb-3">{hint} — JPG, PNG or PDF, max 25 MB</p>
              {docs[key] ? (
                <div className="flex items-center gap-3 bg-white/[0.06] border border-white/[0.12] rounded-xl p-3">
                  {docs[key]!.preview
                    ? <img src={docs[key]!.preview} alt="" className="w-14 h-14 rounded-lg object-cover border border-white/10 flex-shrink-0" />
                    : <div className="w-14 h-14 bg-blue-600/10 rounded-lg flex items-center justify-center border border-blue-500/20 flex-shrink-0"><FileText size={22} className="text-blue-400" /></div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{docs[key]!.file.name}</p>
                    <p className="text-xs text-slate-500">{(docs[key]!.file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <button type="button" onClick={() => setDoc(key, null)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/10 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRefs.current[key]?.click()}
                  className={`w-full flex items-center justify-center gap-3 border-2 border-dashed ${errors[key] ? 'border-red-400/60' : 'border-white/[0.12] hover:border-blue-500/50'} rounded-xl py-5 text-sm font-medium transition-all group hover:bg-blue-600/5`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${errors[key] ? 'bg-red-500/10' : 'bg-white/5 group-hover:bg-blue-600/10'} transition-colors`}>
                    <Upload size={16} className={errors[key] ? 'text-red-400' : 'text-slate-400 group-hover:text-blue-400'} />
                  </div>
                  <span className={errors[key] ? 'text-red-400' : 'text-slate-400 group-hover:text-blue-300'}>
                    Upload file
                  </span>
                </button>
              )}
              <input
                ref={el => { fileRefs.current[key] = el; }}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,.heic"
                className="hidden"
                onChange={e => setDoc(key, e.target.files?.[0] || null)}
              />
            </FormCard>
          ))}

          {/* SSN */}
          <FormCard label="Social Security Number (SSN)">
            <p className="text-slate-500 text-xs italic mb-3">Your information will be kept confidential and used only for onboarding purposes.</p>
            <input
              type="password"
              value={form.ssn}
              onChange={e => set('ssn', e.target.value)}
              className={inputCls()}
              placeholder="XXX-XX-XXXX"
              autoComplete="off"
            />
          </FormCard>

          {/* Confirmation */}
          <div className={`bg-white/[0.03] border ${errors.confirmed ? 'border-red-400/50' : 'border-white/[0.08]'} rounded-2xl p-5`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <div
                onClick={() => { setConfirmed(v => !v); if (errors.confirmed) setErrors(e => ({ ...e, confirmed: '' })); }}
                className={`w-5 h-5 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${confirmed ? 'bg-blue-600 border-blue-600' : 'border-white/30 bg-transparent'}`}
              >
                {confirmed && <div className="w-2 h-2 bg-white rounded-full" />}
              </div>
              <span className="text-sm text-slate-300 leading-relaxed">
                I confirm that all information provided is accurate and belongs to me
              </span>
            </label>
            {errors.confirmed && <p className="text-red-400 text-xs mt-2 ml-8">⚠ {errors.confirmed}</p>}
          </div>

          {/* Submit */}
          <div className="pt-2">
            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>Form completion</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base transition-all shadow-lg shadow-blue-600/20"
            >
              {loading
                ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</>
                : <>Submit Documents</>
              }
            </button>
            <p className="text-center text-slate-600 text-xs mt-3">
              By submitting, you agree to be contacted by our recruitment team. Your information is kept confidential.
            </p>
          </div>
        </form>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-6">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-slate-600 text-xs">© 2025 One Prime Fleet. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FormCard({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className={`bg-white/[0.03] border ${error ? 'border-red-400/40' : 'border-white/[0.08]'} rounded-2xl p-5 transition-colors`}>
      <label className="block text-sm font-semibold text-white mb-3">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-red-400 text-xs mt-2 flex items-center gap-1">⚠ {error}</p>}
    </div>
  );
}
