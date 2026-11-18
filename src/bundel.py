# Maakt takenapp.html: één bestand met CSS en JS erin (handig voor telefoon). Gebruik: python3 bundel.py
from pathlib import Path
d = Path(__file__).parent  # bronbestanden in src/
out = d.parent / 'index.html'
html = (d / 'index.html').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + (d / 'style.css').read_text(encoding='utf-8') + '\n</style>')
html = html.replace('<script src="app.js"></script>', '<script>\n' + (d / 'app.js').read_text(encoding='utf-8') + '\n</script>')
out.write_text(html, encoding='utf-8')
print('index.html bijgewerkt')
