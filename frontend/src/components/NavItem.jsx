const NavItem = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-center md:justify-start gap-4 px-3 md:px-5 py-3.5 rounded-2xl transition-all font-bold text-sm group ${
      active
        ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-900/30 scale-[1.02]'
        : 'hover:bg-slate-900 hover:text-slate-100'
    }`}
  >
    <span className={`${active ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400'} transition-colors shrink-0`}>{icon}</span>
    <span className="tracking-tight truncate hidden md:block">{label}</span>
  </button>
);

export default NavItem;
