import sys, re

p = 'd:/r/asa-control-api/services/auto-update-service.js'

with open(p, 'r') as f:
    c = f.read()

# Find all occurrences
matches = list(re.finditer(r'export default AutoUpdateService;', c))
print(f'Found {len(matches)} occurrences', file=sys.stderr)

if len(matches) > 1:
    # Keep only up to the first occurrence
    end = matches[0].end()
    c = c[:end]
    with open(p, 'w') as f:
        f.write(c)
    print(f'Trimmed to {len(c)} bytes', file=sys.stderr)
else:
    print('Only 1 occurrence, no trimming needed', file=sys.stderr)
