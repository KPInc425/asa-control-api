import os, tempfile, shutil

src = 'd:/r/asa-control-api/services/auto-update-service.js'
tmp = src + '.tmp'

# Read current content
with open(src, 'r') as f:
    content = f.read()

# Find first occurrence of export default
idx = content.find('export default AutoUpdateService;')
if idx < 0:
    print('ERROR: not found')
    exit(1)

# Keep only up to and including the first occurrence
new_content = content[:idx + len('export default AutoUpdateService;')]

# Write to temp file
with open(tmp, 'w') as f:
    f.write(new_content)

# Replace original with temp
os.replace(tmp, src)

# Verify
with open(src, 'r') as f:
    final = f.read()
count = final.count('export default AutoUpdateService;')
print(f'OK: {len(final)} bytes, {count} occurrence(s)')
