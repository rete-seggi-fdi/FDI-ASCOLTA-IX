#!/usr/bin/env python3
from pathlib import Path
from html.parser import HTMLParser
import re, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
errors=[]; warnings=[]; checks=[]

def ok(label): checks.append(label)
def err(label): errors.append(label)
def warn(label): warnings.append(label)

version=(ROOT/'VERSION').read_text().strip()
config=(ROOT/'assets/js/config.js').read_text()
if f'VERSION: "{version}"' in config: ok('VERSION coerente tra file VERSION e config.js')
else: err('VERSION non coerente tra VERSION e config.js')

# Syntax JS / Apps Script using Node parser.
js_files=sorted((ROOT/'assets/js').rglob('*.js'))
for f in [ROOT/'Code.gs', *js_files]:
    target=f
    temp=None
    if f.suffix=='.gs':
        temp=Path('/tmp/fdi_preflight_code.js'); temp.write_text(f.read_text()); target=temp
    cp=subprocess.run(['node','--check',str(target)],capture_output=True,text=True,env={**__import__('os').environ,'TERM':'dumb'})
    if cp.returncode: err(f'Sintassi JavaScript non valida: {f.relative_to(ROOT)}: {cp.stderr.strip()}')
if not any(x.startswith('Sintassi JavaScript') for x in errors): ok(f'Sintassi valida: Code.gs + {len(js_files)} file JS')

# Apps Script iframe bridge: il frontend statico non deve dipendere da CORS/redirect ContentService.
code_text=(ROOT/'Code.gs').read_text()
api_text=(ROOT/'assets/js/api.js').read_text()
if all(token in code_text for token in ['function apiBridgeHtml()', 'function apiBridge(payloadText)', 'HtmlService.XFrameOptionsMode.ALLOWALL']):
    ok('Bridge Apps Script HtmlService presente e abilitato al framing')
else:
    err('Bridge Apps Script incompleto')
if all(token in api_text for token in ['FDI_BRIDGE_READY', 'FDI_API_REQUEST', 'FDI_API_RESPONSE']) and 'fetch(CONFIG.API_URL' not in api_text:
    ok('Frontend API instradato sul bridge, senza fetch diretto Apps Script')
else:
    err('Frontend API non usa esclusivamente il bridge Apps Script')

# Frontend/backend API action parity.
api=(ROOT/'assets/js/api.js').read_text()
frontend=set(re.findall(r'\.call\(\s*["\']([A-Za-z0-9_]+)["\']',api))
for f in (ROOT/'assets/js/pages').glob('*.js'):
    s=f.read_text()
    frontend.update(re.findall(r'action\s*:\s*["\']([A-Za-z0-9_]+)["\']',s))
# Exclude reCAPTCHA action label, not an API action.
frontend.discard('create_report')
backend=set(re.findall(r"action\s*===\s*'([A-Za-z0-9_]+)'",(ROOT/'Code.gs').read_text()))
missing=sorted(frontend-backend)
if missing: err('Azioni frontend non gestite dal backend: '+', '.join(missing))
else: ok(f'Copertura dispatcher completa per {len(frontend)} azioni frontend')

# HTML hardening and assets.
class Parser(HTMLParser):
    def __init__(self): super().__init__(); self.refs=[]; self.inline_scripts=0; self.events=[]; self.external=[]; self.meta_csp=False; self.meta_ref=False
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        for k,v in attrs:
            if k.lower().startswith('on'): self.events.append(k)
        if tag=='script':
            src=d.get('src')
            if not src: self.inline_scripts+=1
            elif src.startswith('http'): self.external.append((src,d.get('integrity')))
            else: self.refs.append(src)
        if tag=='link':
            href=d.get('href','')
            if href.startswith('http'): self.external.append((href,d.get('integrity')))
            elif href: self.refs.append(href)
        if tag=='img' and d.get('src') and not d['src'].startswith(('http','data:')): self.refs.append(d['src'])
        if tag=='meta' and str(d.get('http-equiv','')).lower()=='content-security-policy': self.meta_csp=True
        if tag=='meta' and str(d.get('name','')).lower()=='referrer' and d.get('content')=='no-referrer': self.meta_ref=True

for html in sorted(ROOT.glob('*.html')):
    p=Parser(); p.feed(html.read_text())
    if p.inline_scripts: err(f'{html.name}: {p.inline_scripts} script inline')
    if p.events: err(f'{html.name}: event handler HTML inline: {sorted(set(p.events))}')
    if not p.meta_csp: err(f'{html.name}: CSP meta mancante')
    if not p.meta_ref: err(f'{html.name}: Referrer-Policy meta mancante')
    html_text=html.read_text()
    if 'frame-src https://script.google.com https://script.googleusercontent.com' not in html_text:
        err(f'{html.name}: CSP non consente il bridge Apps Script')
    for ref in p.refs:
        clean=ref.split('?',1)[0].split('#',1)[0]
        if not clean or clean.startswith(('/', '#', 'mailto:', 'tel:')): continue
        if not (ROOT/clean).exists(): err(f'{html.name}: asset locale mancante: {clean}')
    for url,integrity in p.external:
        if 'leaflet@1.9.4/dist/leaflet.' in url and not integrity: err(f'{html.name}: Leaflet senza SRI: {url}')
        elif not integrity: warn(f'{html.name}: dipendenza esterna version-pinned ma senza SRI: {url}')
if not [e for e in errors if any(k in e for k in ('script inline','event handler','CSP','Referrer','asset locale','Leaflet'))]:
    ok('HTML: nessuno script/event handler inline, CSP/referrer presenti, asset locali risolti')

# Cleanup / unsafe URL schemes.
if len(list(ROOT.rglob('Code.gs')))==1: ok('Un solo Code.gs nel pacchetto')
else: err('Sono presenti più Code.gs nel pacchetto')
for dead in ['assets/js/dashboard.js','assets/js/segnala.js','assets/js/tracking.js']:
    if (ROOT/dead).exists(): err('File obsoleto ancora presente: '+dead)
scan_files=[*ROOT.glob('*.html'), *ROOT.rglob('*.js'), *ROOT.rglob('*.css')]
if re.search(r'javascript\s*:', '\n'.join(p.read_text(errors='ignore') for p in scan_files), re.I): err('Trovato schema javascript: nel frontend')
else: ok('Nessun URL javascript: rilevato nel frontend')

print(f'FDI Ascolta IX preflight {version}')
for c in checks: print('[OK]  '+c)
for w in sorted(set(warnings)): print('[WARN] '+w)
for e in errors: print('[FAIL] '+e)
print(f'\nEsito: {len(checks)} OK, {len(set(warnings))} warning, {len(errors)} errori')
sys.exit(1 if errors else 0)
