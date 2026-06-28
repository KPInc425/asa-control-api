@echo off
python -c "import re;f=open('d:/r/asa-control-api/services/auto-update-service.js');c=f.read();f.close();m=re.search(r'export default AutoUpdateService;',c);open('d:/r/asa-control-api/services/auto-update-service.js','w').write(c[:m.end()])"
echo Done
