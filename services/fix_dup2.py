import re

p = 'd:/r/asa-control-api/services/auto-update-service.js'
with open(p, 'r') as f:
    c = f.read()

# Find first occurrence
m = re.search(r'export default AutoUpdateService;', c)
if m:
    end = m.end()
    c = c[:end]
    with open(p, 'w') as f:
        f.write(c)
    # Verify
    with open(p, 'r') as f:
        c2 = f.read()
    count = len(re.findall(r'export default AutoUpdateService;', c2))
    print(f'Trimmed to {len(c2)} bytes, {count} occurrence(s)')
else:
    print('Not found')
