import { useState, useRef } from 'react';
import { Truck, Upload, X, CheckCircle, FileText, ChevronRight, Shield, DollarSign, MapPin, Clock, Star, Phone } from 'lucide-react';
import axios from 'axios';

interface FileItem { file: File; preview?: string; }

const TRUCK_TYPES = ['Semi Truck', 'Refrigerated', 'Box Truck', 'Flatbed', 'Tanker', 'Car Hauler', 'Van', 'Other'];
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const BENEFITS = [
  { icon: DollarSign,  title: 'Top Pay',           desc: 'Competitive rates & weekly settlements' },
  { icon: MapPin,      title: 'Great Routes',       desc: 'OTR, regional & local lanes available' },
  { icon: Shield,      title: 'Full Benefits',      desc: 'Medical, dental & vision coverage' },
  { icon: Clock,       title: 'Flexible Schedule',  desc: 'Home time options for every driver' },
];

const inputCls = (err?: string) =>
  `w-full bg-white/[0.06] border ${err ? 'border-red-400' : 'border-white/[0.12]'} rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors`;

const selectCls =
  'w-full bg-[#1a2540] border border-white/[0.12] rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors';

export default function Apply() {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [reference, setReference] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', city: '', state: '',
    truck_type: '', license_class: '', experience_years: '',
    cdl_number: '', message: '',
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); if (errors[k]) setErrors(e => ({ ...e, [k]: '' })); }

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const allowed = Array.from(incoming).filter(f => {
      const ok = /\.(jpg|jpeg|png|pdf|heic)$/i.test(f.name);
      if (!ok) return false;
      if (f.size > 15 * 1024 * 1024) { alert(`${f.name} exceeds 15 MB`); return false; }
      return true;
    });
    const items: FileItem[] = allowed.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));
    setFiles(prev => [...prev, ...items].slice(0, 5));
  }

  function removeFile(i: number) {
    setFiles(prev => { if (prev[i].preview) URL.revokeObjectURL(prev[i].preview!); return prev.filter((_, j) => j !== i); });
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Full name is required';
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email address';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) { document.getElementById('form-top')?.scrollIntoView({ behavior: 'smooth' }); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      files.forEach(f => fd.append('documents', f.file));
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
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-slate-300 font-medium">Application Received</span>
            </div>
          </div>
          <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-8 text-center backdrop-blur">
            <div className="w-20 h-20 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={36} className="text-green-400" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">You're all set!</h2>
            <p className="text-slate-400 leading-relaxed mb-8">
              Thank you for applying to <span className="text-white font-medium">One Prime Fleet</span>. Our recruitment team will review your application and reach out within <span className="text-blue-400 font-semibold">24–48 hours</span>.
            </p>
            <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-5 mb-8">
              <p className="text-xs text-blue-400 uppercase font-bold tracking-wider mb-2">Reference Number</p>
              <p className="text-3xl font-bold text-white tracking-widest font-mono">{reference}</p>
              <p className="text-xs text-slate-500 mt-2">Save this number for your records</p>
            </div>
            <div className="space-y-3 text-left mb-8">
              {['Application under review by our team', 'Recruiter will call you within 24–48 hours', 'Onboarding starts within days of approval'].map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-blue-400 font-bold">{i + 1}</span>
                  </div>
                  <p className="text-sm text-slate-300">{s}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 border border-white/10 text-slate-300 text-sm font-medium rounded-xl hover:bg-white/5 transition-colors"
            >
              Submit another application
            </button>
          </div>
          <p className="text-center text-slate-500 text-xs mt-6">Questions? Call us at <span className="text-slate-300">1-800-ONE-PRIME</span></p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1526]">
      {/* Top nav */}
      <header className="border-b border-white/[0.06] sticky top-0 z-10 backdrop-blur bg-[#0d1526]/90">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <Truck size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">One Prime Fleet</p>
              <p className="text-slate-500 text-xs">Driver Careers</p>
            </div>
          </div>
          <a href="tel:18001234567" className="hidden sm:flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
            <Phone size={14} />
            Questions? Call us
          </a>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-6 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-600/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-6">
          <Star size={12} className="text-blue-400 fill-blue-400" />
          <span className="text-xs text-blue-300 font-medium">Now Hiring — CDL Drivers Nationwide</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
          Drive with<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">One Prime Fleet</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-xl mx-auto mb-10">
          Join our growing team of professional drivers. Apply in minutes and a recruiter will call you within 24 hours.
        </p>

        {/* Benefits grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto mb-16">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-colors">
              <div className="w-9 h-9 bg-blue-600/20 border border-blue-500/20 rounded-xl flex items-center justify-center mb-3">
                <Icon size={16} className="text-blue-400" />
              </div>
              <p className="text-white text-sm font-semibold mb-0.5">{title}</p>
              <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="max-w-3xl mx-auto px-6 pb-20" id="form-top">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {['Personal Info', 'Experience', 'Documents'].map((label, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-blue-600 text-white' : i === 1 ? 'bg-blue-600/30 border border-blue-500/30 text-blue-400' : 'bg-white/5 border border-white/10 text-slate-500'}`}>
                {i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${i === 0 ? 'text-white' : i === 1 ? 'text-blue-400' : 'text-slate-600'}`}>{label}</span>
              {i < 2 && <div className={`flex-1 h-px ${i === 0 ? 'bg-blue-600/40' : 'bg-white/[0.06]'}`} />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Section 1 — Personal */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
                <span className="text-blue-400 text-xs font-bold">1</span>
              </div>
              <div>
                <h2 className="text-white font-semibold">Personal Information</h2>
                <p className="text-slate-500 text-xs">Basic contact details</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Full Name <span className="text-red-400">*</span></label>
                <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls(errors.name)} placeholder="John Smith" />
                {errors.name && <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">⚠ {errors.name}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Phone <span className="text-red-400">*</span></label>
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls(errors.phone)} placeholder="+1 (555) 000-0000" />
                {errors.phone && <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">⚠ {errors.phone}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Email Address</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls(errors.email)} placeholder="john@email.com" />
                {errors.email && <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">⚠ {errors.email}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">City</label>
                <input value={form.city} onChange={e => set('city', e.target.value)} className={inputCls()} placeholder="Dallas" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">State</label>
                <select value={form.state} onChange={e => set('state', e.target.value)} className={selectCls}>
                  <option value="">Select state...</option>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2 — Professional */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
                <span className="text-blue-400 text-xs font-bold">2</span>
              </div>
              <div>
                <h2 className="text-white font-semibold">Professional Experience</h2>
                <p className="text-slate-500 text-xs">Your driving background & credentials</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Truck Type</label>
                <select value={form.truck_type} onChange={e => set('truck_type', e.target.value)} className={selectCls}>
                  <option value="">Select type...</option>
                  {TRUCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">License Class</label>
                <select value={form.license_class} onChange={e => set('license_class', e.target.value)} className={selectCls}>
                  <option value="">Select class...</option>
                  {['CDL-A', 'CDL-B', 'CDL-C', 'Class A', 'Class B', 'Class C'].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Years of Experience</label>
                <input type="number" min="0" max="50" value={form.experience_years} onChange={e => set('experience_years', e.target.value)} className={inputCls()} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">CDL License Number</label>
                <input value={form.cdl_number} onChange={e => set('cdl_number', e.target.value)} className={inputCls()} placeholder="e.g. TX12345678" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Tell us about yourself</label>
                <textarea rows={4} value={form.message} onChange={e => set('message', e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none transition-colors"
                  placeholder="Describe your experience, routes you've driven, specializations, and why you want to join our team..." />
              </div>
            </div>
          </div>

          {/* Section 3 — Documents */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
                <span className="text-blue-400 text-xs font-bold">3</span>
              </div>
              <div>
                <h2 className="text-white font-semibold">Documents <span className="text-slate-500 font-normal text-sm">— optional</span></h2>
                <p className="text-slate-500 text-xs">CDL, DOT medical card, or other credentials</p>
              </div>
            </div>
            <p className="text-slate-500 text-xs mb-5 ml-11">PDF, JPG or PNG · Max 5 files · 15 MB each</p>

            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              className="border-2 border-dashed border-white/[0.10] rounded-xl p-8 text-center cursor-pointer hover:border-blue-500/50 hover:bg-blue-600/5 transition-all group"
            >
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:bg-blue-600/10 transition-colors">
                <Upload size={22} className="text-slate-400 group-hover:text-blue-400 transition-colors" />
              </div>
              <p className="text-slate-300 text-sm font-medium mb-1">Drop files here or <span className="text-blue-400 hover:text-blue-300">browse</span></p>
              <p className="text-slate-600 text-xs">Supports PDF, JPG, PNG, HEIC</p>
            </div>
            <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic" className="hidden" onChange={e => addFiles(e.target.files)} />

            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/[0.08] rounded-xl p-3">
                    {f.preview
                      ? <img src={f.preview} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-white/10" />
                      : <div className="w-10 h-10 bg-blue-600/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-blue-500/20"><FileText size={16} className="text-blue-400" /></div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate font-medium">{f.file.name}</p>
                      <p className="text-xs text-slate-500">{(f.file.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <button type="button" onClick={() => removeFile(i)} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-red-500/10 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
            >
              {loading ? (
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing your application...</>
              ) : (
                <>Submit Application <ChevronRight size={18} /></>
              )}
            </button>
            <p className="text-center text-slate-600 text-xs mt-4">
              By submitting, you agree to be contacted by our recruitment team. Your information is kept confidential.
            </p>
          </div>
        </form>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
              <Truck size={12} className="text-white" />
            </div>
            <span className="text-slate-500 text-sm">© 2025 One Prime Fleet. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span>Privacy Policy</span>
            <span>Terms of Use</span>
            <span>Contact Us</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
