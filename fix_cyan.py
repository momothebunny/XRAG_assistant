import os

canvas_dir = r"d:\git\XRAG_assistant(1)\frontend\src\components\canvas"

replacements = [
    # ToggleChip checked state
    ('border-cyan-300 bg-cyan-50 text-cyan-800 shadow-sm shadow-cyan-200/40',
     'border-cyan-600/60 bg-cyan-900/20 text-cyan-300 shadow-sm shadow-cyan-900/40'),
    # ToggleChip unchecked hover
    ('hover:border-cyan-200 hover:text-cyan-700',
     'hover:border-cyan-600/60 hover:text-cyan-400'),
    # UpstreamPill ok state
    ('border-cyan-200 bg-cyan-50 text-cyan-800',
     'border-cyan-700/40 bg-cyan-900/15 text-cyan-300'),
    # Status card ok
    ("border-cyan-200 bg-cyan-50/50 p-3",
     'border-cyan-700/40 bg-cyan-900/15 p-3'),
    # gauge/budget/fusion summary section
    ("border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-cyan-800",
     "border border-cyan-700/40 bg-cyan-900/15 px-2.5 py-1.5 text-[10.5px] font-semibold text-cyan-300"),
    # RerankerSettingsPanel
    ("border-cyan-200 bg-cyan-900/10 p-3",
     "border-cyan-700/40 bg-cyan-900/15 p-3"),
    ("bg-cyan-50 px-2 py-1 text-[10px] text-cyan-800",
     "bg-cyan-900/15 px-2 py-1 text-[10px] text-cyan-300"),
    # text color fixes
    ('"text-cyan-700"', '"text-cyan-400"'),
    ("'text-cyan-700'", "'text-cyan-400'"),
    ('>text-cyan-700<', '>text-cyan-400<'),
    ('text-cyan-800"', 'text-cyan-300"'),
    ("Gauge size={14} className=\"text-cyan-700\"",
     'Gauge size={14} className="text-cyan-400"'),
    ("Layers size={14} className=\"text-cyan-700\"",
     'Layers size={14} className="text-cyan-400"'),
    ("Search size={14} className=\"text-cyan-700\"",
     'Search size={14} className="text-cyan-400"'),
    ("ShieldCheck size={14} className=\"text-cyan-700\"",
     'ShieldCheck size={14} className="text-cyan-400"'),
    # SectionHeading component prop
    ('color="text-cyan-700"', 'color="text-cyan-400"'),
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
