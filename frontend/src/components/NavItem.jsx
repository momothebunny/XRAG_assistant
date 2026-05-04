const NavItem = ({ icon, label, active, onClick, collapsed = false }) => (
  <button
    onClick={onClick}
    title={collapsed ? label : undefined}
    className={`flex items-center rounded-2xl transition-all font-bold text-sm group ${
      active
        ? 'bg-amber-400 text-slate-900 shadow-xl shadow-amber-700/40 scale-[1.02]'
        : 'hover:bg-slate-900 hover:text-slate-100'
    } ${collapsed ? 'h-11 w-11 justify-center px-0 py-0' : 'w-full justify-center md:justify-start gap-4 px-3 md:px-5 py-3.5'}`}
  >
    <span className={`${active ? 'text-slate-900' : 'text-slate-500 group-hover:text-amber-300'} transition-colors shrink-0`}>{icon}</span>
    <span className={`${collapsed ? 'hidden' : 'block'} tracking-tight truncate`}>{label}</span>
  </button>
);

export default NavItem;
