import re

p = 'd:/r/asa-control-api/services/auto-update-service.js'
with open(p, 'r') as f:
    c = f.read()

# Find all occurrences
matches = [(m.start(), m.end()) for m in re.finditer('export default AutoUpdateService;', c)]
print(f'Found {len(matches)} occurrences')

# Keep only up to the first occurrence
end = matches[0][1]
c = c[:end]

with open(p, 'w') as f:
    f.write(c)
print(f'Trimmed to {len(c)} bytes')

# Verify
with open(p, 'r') as f:
    c2 = f.read()
matches2 = [(m.start(), m.end()) for m in re.finditer('export default AutoUpdateService;', c2)]
print(f'After trim: {len(matches2)} occurrences')
