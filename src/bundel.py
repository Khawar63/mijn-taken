# Maakt ../index.html: één bestand met CSS en JS erin (handig voor telefoon). Gebruik: python3 src/bundel.py
from pathlib import Path
d = Path(__file__).parent  # bronbestanden in src/
out = d.parent / 'index.html'
html = (d / 'index.html').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + (d / 'style.css').read_text(encoding='utf-8') + '\n</style>')
for js in ('app.js', 'sync.js'):
    html = html.replace(f'<script src="{js}"></script>', '<script>\n' + (d / js).read_text(encoding='utf-8') + '\n</script>')
out.write_text(html, encoding='utf-8')
print('index.html bijgewerkt')
