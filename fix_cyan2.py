import os, re

canvas_dir = r"d:\git\XRAG_assistant(1)\frontend\src\components\canvas"

# Fix remaining text-cyan-700 in className attributes (JSX)
# and border-cyan-200 that's left in RerankerSettingsPanel

replacements = [
    ('className="text-[10.5px] font-bold text-cyan-700"',
     'className="text-[10.5px] font-bold text-cyan-400"'),
    ('className="font-mono text-cyan-700"',
     'className="font-mono text-cyan-400"'),
    ('className="font-mono font-bold text-cyan-700"',
     'className="font-mono font-bold text-cyan-400"'),
    # RerankerSettingsPanel: border-cyan-200 left in the "rounded border" element
    ('rounded border border-cyan-200 bg-cyan-900/15',
     'rounded border border-cyan-700/40 bg-cyan-900/15'),
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
