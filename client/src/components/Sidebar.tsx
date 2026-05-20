import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Mail, BarChart3, LogOut, Truck, Shield, User, Zap, MessageSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';

const links = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads',     icon: Zap,             label: 'Leads' },
  { to: '/drivers',   icon: Users,           label: 'Drivers' },
  { to: '/emails',    icon: Mail,            label: 'Email' },
  { to: '/sms',       icon: MessageSquare,   label: 'SMS' },
  { to: '/analytics', icon: BarChart3,       label: 'Analytics' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <aside className="w-64 bg-slate-900 flex flex-col h-full flex-shrink-0">
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <Truck size={20} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">TruckRecruit</p>
            <p className="text-slate-400 text-xs">CRM System</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {user?.role === 'admin' && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Shield size={18} />
            Admin Panel
          </NavLink>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-slate-700 space-y-1">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full ${
              isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          <User size={18} />
          My Profile
        </NavLink>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors w-full"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>

      <div className="px-4 py-3 border-t border-slate-700">
        <div className="flex items-center gap-3">
          <Avatar name={user?.name || ''} color={user?.avatar_color} size="sm" />
          <div className="min-w-0">
            <p className="text-white text-xs font-medium truncate">{user?.name}</p>
            <p className="text-slate-400 text-xs truncate">{user?.role === 'admin' ? 'Administrator' : 'Recruiter'}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
