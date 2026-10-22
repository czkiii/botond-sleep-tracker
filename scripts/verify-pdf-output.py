"""Validate the three synthetic downloads from check-pdf-export.mjs.
Requires pypdf, pdfplumber; --render also needs Poppler pdftoppm on PATH.
"""
import argparse
import json
import subprocess
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

parser = argparse.ArgumentParser()
parser.add_argument('--directory', default='.private-backups/pdf-export')
parser.add_argument('--render', action='store_true')
args = parser.parse_args()
directory = Path(args.directory)
results = []
for locale in ['hu', 'en', 'de']:
    path = directory / f'{locale}.pdf'
    reader = PdfReader(path)
    text = '\n'.join(page.extract_text() for page in reader.pages)
    assert not reader.is_encrypted
    assert '/OpenAction' not in reader.trailer['/Root']
    assert 'Árvíztűrő tükörfúrógép' in text and 'ÄÖÜß' in text
    assert 'Europe/Budapest' in text
    assert '2026-09-01 - 2026-10-07' in text
    assert all(secret not in text for secret in ['PRIVATE-OTHER', '2025-01-02', 'childId', 'deviceToken'])
    # Clipped first row: 8h; second row: 2h (1h overlap); active: 4h. Union: 13h.
    assert {'hu': '13 ó 0 p 0 mp', 'en': '13 h 0 min 0 s', 'de': '13 Std. 0 Min. 0 Sek.'}[locale] in text
    if locale == 'hu':
        assert 'NOTE-MARKER' not in text and 'SECOND-NOTE' not in text
    else:
        assert all(value in text for value in ['NOTE-MARKER', 'END-NOTE', 'SECOND-NOTE', 'ACTIVE-NOTE', '[U+1F600]', '<script>literal</script>'])
        assert len(reader.pages) >= 2
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            assert f'{i+1} / {len(pdf.pages)}' in page.extract_text()
            for word in page.extract_words():
                assert word['x0'] >= 47 and word['x1'] <= 548, (locale, i, word)
                assert word['top'] >= 25 and word['bottom'] <= 822, (locale, i, word)
    if args.render:
        subprocess.run(['pdftoppm', '-r', '85', '-png', str(path), str(directory / locale)], check=True)
    results.append({'locale': locale, 'pages': len(reader.pages), 'bytes': path.stat().st_size, 'passed': True})
(directory / 'pdf-result.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps(results, indent=2))
