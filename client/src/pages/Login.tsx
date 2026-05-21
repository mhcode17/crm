import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Truck, Users, MessageSquare, Zap, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

const FEATURES = [
  { icon: Users,         text: 'Full driver pipeline management' },
  { icon: Zap,           text: 'Facebook, Indeed & organic leads' },
  { icon: MessageSquare, text: 'Built-in SMS & email messaging' },
  { icon: BarChart3,     text: 'Recruiter analytics & leaderboards' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(e: string, p: string) {
    setEmail(e);
    setPassword(p);
    setShowDemo(false);
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — brand ──────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col justify-between p-12"
        style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f2035 40%, #1a3a6b 100%)' }}>

        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
          <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #1d4ed8, transparent)' }} />
          {/* Grid lines */}
          <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Truck size={24} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-xl tracking-tight">TruckRecruit</p>
              <p className="text-blue-300 text-xs">CRM Platform</p>
            </div>
          </div>
        </div>

        {/* Main copy */}
        <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
          <h1 className="text-5xl font-bold text-white leading-tight mb-4">
            Recruit smarter,<br />
            <span className="text-blue-400">hire faster.</span>
          </h1>
          <p className="text-slate-400 text-lg mb-12 max-w-md leading-relaxed">
            The all-in-one platform for truck driver recruitment teams. Manage leads, communicate directly, and close more drivers.
          </p>

          {/* Features */}
          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-blue-400" />
                </div>
                <span className="text-slate-300 text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-slate-600 text-xs">© 2026 TruckRecruit · All rights reserved</p>
        </div>
      </div>

      {/* ── Right panel — login form ──────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Truck size={20} className="text-white" />
            </div>
            <p className="text-gray-900 font-bold text-xl">TruckRecruit</p>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome back</h2>
            <p className="text-gray-500">Sign in to your recruiter account</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                placeholder="you@company.com"
                required
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700">Password</label>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-blue-600/25 text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-8">
            <button
              onClick={() => setShowDemo(p => !p)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mx-auto"
            >
              {showDemo ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showDemo ? 'Hide' : 'Show'} demo accounts
            </button>

            {showDemo && (
              <div className="mt-3 bg-white border border-gray-100 rounded-xl p-4 shadow-sm space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Demo Accounts</p>
                {[
                  { label: 'Admin Manager', email: 'admin@crm.com', pass: 'admin123', role: 'Administrator', color: 'bg-red-50 text-red-600 border-red-100' },
                  { label: 'Sarah Johnson', email: 'sarah@crm.com', pass: 'pass123', role: 'Recruiter', color: 'bg-blue-50 text-blue-600 border-blue-100' },
                  { label: 'Mike Davis',    email: 'mike@crm.com',  pass: 'pass123', role: 'Recruiter', color: 'bg-green-50 text-green-600 border-green-100' },
                  { label: 'Anna Peterson', email: 'anna@crm.com',  pass: 'pass123', role: 'Recruiter', color: 'bg-yellow-50 text-yellow-700 border-yellow-100' },
                ].map(a => (
                  <button
                    key={a.email}
                    onClick={() => fillDemo(a.email, a.pass)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{a.label}</p>
                      <p className="text-xs text-gray-400">{a.email}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${a.color}`}>
                      {a.role}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
