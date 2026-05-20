import { useState, useRef } from 'react';
import { Truck, Upload, X, CheckCircle, FileText, ChevronRight } from 'lucide-react';
import axios from 'axios';

interface FileItem { file: File; preview?: string; }

const TRUCK_TYPES = ['Semi Truck', 'Refrigerated', 'Box Truck', 'Flatbed', 'Tanker', 'Car Hauler', 'Van', 'Other'];
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

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
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.phone.trim()) e.phone = 'Phone is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      files.forEach(f => fd.append('documents', f.file));

      const { data } = await axios.post('/api/apply', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setReference(data.reference);
      setStep('success');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Submission error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
          <p className="text-gray-500 mb-4">Thank you for applying. Our recruitment team will review your application and get in touch within <strong>24–48 hours</strong>.</p>
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Your reference number</p>
            <p className="text-2xl font-bold text-blue-600 tracking-widest">{reference}</p>
            <p className="text-xs text-gray-400 mt-1">Keep this for your records</p>
          </div>
          <button onClick={() => window.location.reload()} className="text-sm text-blue-600 hover:underline">Submit another application</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900">
      {/* Header */}
      <div className="border-b border-white/10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Truck size={20} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">TruckRecruit</p>
            <p className="text-slate-400 text-xs">Driver Application Portal</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-3">Join Our Team</h1>
          <p className="text-slate-300 text-lg">Fill out the form below and a recruiter will contact you within 24–48 hours.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Info */}
          <div className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-6">
            <h2 className="text-white font-semibold text-lg mb-5 flex items-center gap-2">
              <span className="w-7 h-7 bg-blue-600 rounded-lg text-sm flex items-center justify-center font-bold">1</span>
              Personal Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)}
                  className={`w-full bg-white/10 border rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${errors.name ? 'border-red-400' : 'border-white/20'}`}
                  placeholder="John Smith" />
                {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Phone Number *</label>
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                  className={`w-full bg-white/10 border rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${errors.phone ? 'border-red-400' : 'border-white/20'}`}
                  placeholder="+1 (555) 000-0000" />
                {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                  className={`w-full bg-white/10 border rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${errors.email ? 'border-red-400' : 'border-white/20'}`}
                  placeholder="john@email.com" />
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">City</label>
                <input value={form.city} onChange={e => set('city', e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Dallas" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">State</label>
                <select value={form.state} onChange={e => set('state', e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="" className="bg-slate-800">Select state...</option>
                  {STATES.map(s => <option key={s} value={s} className="bg-slate-800">{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Professional Info */}
          <div className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-6">
            <h2 className="text-white font-semibold text-lg mb-5 flex items-center gap-2">
              <span className="w-7 h-7 bg-blue-600 rounded-lg text-sm flex items-center justify-center font-bold">2</span>
              Professional Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Truck Type</label>
                <select value={form.truck_type} onChange={e => set('truck_type', e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="" className="bg-slate-800">Select type...</option>
                  {TRUCK_TYPES.map(t => <option key={t} value={t} className="bg-slate-800">{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">License Class</label>
                <select value={form.license_class} onChange={e => set('license_class', e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="" className="bg-slate-800">Select class...</option>
                  {['CDL-A', 'CDL-B', 'CDL-C', 'Class A', 'Class B', 'Class C'].map(l => <option key={l} value={l} className="bg-slate-800">{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Years of Experience</label>
                <input type="number" min="0" max="50" value={form.experience_years} onChange={e => set('experience_years', e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">CDL License Number</label>
                <input value={form.cdl_number} onChange={e => set('cdl_number', e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="e.g. TX12345678" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tell us about yourself</label>
                <textarea rows={3} value={form.message} onChange={e => set('message', e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                  placeholder="Describe your experience, routes you've driven, any specializations..." />
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-6">
            <h2 className="text-white font-semibold text-lg mb-2 flex items-center gap-2">
              <span className="w-7 h-7 bg-blue-600 rounded-lg text-sm flex items-center justify-center font-bold">3</span>
              Documents <span className="text-slate-400 text-sm font-normal ml-1">(optional)</span>
            </h2>
            <p className="text-slate-400 text-sm mb-5">Upload your CDL, DOT medical card, or any other relevant documents. Max 5 files, 15 MB each. Accepted: PDF, JPG, PNG.</p>

            {/* Upload area */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-white/5 transition-all"
            >
              <Upload size={28} className="text-slate-400 mx-auto mb-2" />
              <p className="text-slate-300 text-sm font-medium">Drop files here or <span className="text-blue-400">browse</span></p>
              <p className="text-slate-500 text-xs mt-1">PDF, JPG, PNG — up to 15 MB each, max 5 files</p>
            </div>
            <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic" className="hidden" onChange={e => addFiles(e.target.files)} />

            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/10 rounded-lg p-3">
                    {f.preview
                      ? <img src={f.preview} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                      : <div className="w-10 h-10 bg-white/10 rounded flex items-center justify-center flex-shrink-0"><FileText size={18} className="text-slate-300" /></div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{f.file.name}</p>
                      <p className="text-xs text-slate-400">{(f.file.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-400 flex-shrink-0"><X size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-bold py-4 rounded-2xl text-lg transition-colors"
          >
            {loading ? (
              <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</>
            ) : (
              <>Submit Application <ChevronRight size={20} /></>
            )}
          </button>

          <p className="text-center text-slate-500 text-xs">
            By submitting, you agree to be contacted by our recruitment team.
            Your information is kept confidential.
          </p>
        </form>
      </div>
    </div>
  );
}
