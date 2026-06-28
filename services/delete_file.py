import os

p = 'd:/r/asa-control-api/services/auto-update-service.js'

# Delete the file first
try:
    os.remove(p)
    print('Deleted old file')
except:
    print('Could not delete')

# Check if it's gone
if not os.path.exists(p):
    print('File is gone, ready to recreate')
else:
    print('File still exists')
