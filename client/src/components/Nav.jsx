import { NavLink } from 'react-router-dom';

const links = [
  { to: '/',          label: 'Dashboard' },
  { to: '/news',      label: 'News' },
  { to: '/education', label: 'Education' },
  { to: '/personal',  label: 'Personal' },
  { to: '/memes',     label: 'Memes' },
  { to: '/schedule',  label: 'Schedule' },
  { to: '/settings',  label: 'Settings' },
];

export default function Nav() {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <span className="font-bold text-brand-700 text-lg tracking-tight">
          Programmatic 101
          <span className="ml-2 text-xs font-normal text-gray-400 uppercase tracking-widest">
            Content Engine
          </span>
        </span>
        <nav className="flex items-center gap-1">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
