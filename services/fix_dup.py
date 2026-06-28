import os, re

src = 'd:/r/asa-control-api/services/auto-update-service.js'
tmp = 'd:/r/asa-control-api/services/auto-update-service.tmp.js'

with open(src, 'r') as f:
    c = f.read()

# Find first occurrence
m = re.search(r'export default AutoUpdateService;', c)
if m:
    # Keep only up to and including the first occurrence
    c = c[:m.end()]
    with open(tmp, 'w') as f:
        f.write(c)
    os.replace(tmp, src)
    print(f'OK: trimmed to {len(c)} bytes, 1 occurrence remains')
else:
    print('FAIL: not found')
