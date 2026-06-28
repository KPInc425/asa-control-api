import sys

p = 'd:/r/asa-control-api/services/auto-update-service.js'

with open(p, 'r') as f:
    c = f.read()

idx = c.find('export default AutoUpdateService;')
if idx < 0:
    print('ERROR: not found', file=sys.stderr)
    sys.exit(1)

new_c = c[:idx + 33]

with open(p, 'w') as f:
    f.write(new_c)

with open(p, 'r') as f:
    final = f.read()
count = final.count('export default AutoUpdateService;')
print(f'OK: {len(final)} bytes, {count} occurrence(s)', file=sys.stderr)
