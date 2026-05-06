import os, re

canvas_dir = r"d:\git\XRAG_assistant(1)\frontend\src\components\canvas"

# Pattern: the entire <div ... top-0 h-1 bg-gradient-to-r ...> line (self-closing)
# Two forms exist: inline single-line and multi-line
PATTERN = re.compile(
    r'\s*<div\s[^>]*?(?:aria-hidden[^>]*?)?'
    r'className=["\'][^"\']*?inset-x-0 top-0 h-1 bg-gradient-to-r[^"\']*["\'][^/]*/>\s*\n',
    re.DOTALL
)

count = 0
for fn in os.listdir(canvas_dir):
    if not fn.endswith('.jsx'):
        continue
    path = os.path.join(canvas_dir, fn)
    with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
        c = fp.read()
    new_c = PATTERN.sub('\n', c)
    if new_c != c:
        with open(path, 'w', encoding='utf-8', errors='ignore') as fp:
            fp.write(new_c)
        count += 1
        print('Updated:', fn)
print('Total:', count)
