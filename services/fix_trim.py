import sys
print("Python is running", file=sys.stderr)
p = 'd:/r/asa-control-api/services/auto-update-service.js'
with open(p, 'r') as f:
    c = f.read()
print(f"File size: {len(c)} bytes", file=sys.stderr)
idx = c.find('export default AutoUpdateService;')
print(f"First occurrence at: {idx}", file=sys.stderr)
if idx >= 0:
    c = c[:idx + len('export default AutoUpdateService;')]
    with open(p, 'w') as f:
        f.write(c)
    print(f"Trimmed to {len(c)} bytes", file=sys.stderr)
