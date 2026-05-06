import os

canvas_dir = r"d:\git\XRAG_assistant(1)\frontend\src\components\canvas"
replacements = [
    # bg-*-100 badge chips and pill backgrounds
    ('bg-sky-100 px-1.5 py-px text-[9px] font-bold text-sky-400', 'bg-sky-900/40 px-1.5 py-px text-[9px] font-bold text-sky-300'),
    ('hover:bg-rose-100', 'hover:bg-rose-900/30'),
    ('bg-rose-100 px-1.5 py-px text-[9px] font-bold text-rose-400', 'bg-rose-900/40 px-1.5 py-px text-[9px] font-bold text-rose-400'),
    ('bg-fuchsia-100 text-fuchsia-600', 'bg-fuchsia-900/40 text-fuchsia-300'),
    ('bg-cyan-100 text-cyan-600', 'bg-cyan-900/40 text-cyan-300'),
    ('bg-emerald-100 px-1.5 py-px text-[9px] font-bold text-emerald-400', 'bg-emerald-900/40 px-1.5 py-px text-[9px] font-bold text-emerald-400'),
    ('bg-emerald-100 text-emerald-600', 'bg-emerald-900/40 text-emerald-300'),
    ('hover:bg-fuchsia-100', 'hover:bg-fuchsia-900/30'),
    ('border-fuchsia-300 bg-[#0d1117] p-1.5 text-fuchsia-600', 'border-fuchsia-700/50 bg-[#0d1117] p-1.5 text-fuchsia-300'),
]
count = 0
for fn in os.listdir(canvas_dir):
    if not fn.endswith('.jsx'):
        continue
    path = os.path.join(canvas_dir, fn)
    with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
        c = fp.read()
    orig = c
    for f, r in replacements:
        c = c.replace(f, r)
    if c != orig:
        with open(path, 'w', encoding='utf-8', errors='ignore') as fp:
            fp.write(c)
        count += 1
        print('Updated:', fn)
print('Total:', count)
