# Fix ASA Start Scripts
# Replace ShooterGameServer.exe with ArkAscendedServer.exe in all start scripts

$basePath = "G:\ARK\clusters"

Write-Host "Fixing ASA start scripts..." -ForegroundColor Green

# Get all cluster directories
$clusters = Get-ChildItem -Path $basePath -Directory

foreach ($cluster in $clusters) {
    Write-Host "Processing cluster: $($cluster.Name)" -ForegroundColor Yellow
    
    # Get all server directories in this cluster
    $servers = Get-ChildItem -Path $cluster.FullName -Directory
    
    foreach ($server in $servers) {
        $startScriptPath = Join-Path $server.FullName "start.bat"
        
        if (Test-Path $startScriptPath) {
            Write-Host "  Fixing start script: $($server.Name)" -ForegroundColor Cyan
            
            # Read the content and replace the executable name
            $content = Get-Content $startScriptPath -Raw
            $fixedContent = $content -replace 'ShooterGameServer\.exe', 'ArkAscendedServer.exe'
            
            # Write the fixed content back
            Set-Content $startScriptPath $fixedContent -NoNewline
            
            Write-Host "    ✓ Fixed" -ForegroundColor Green
        }
    }
}

Write-Host "All start scripts have been fixed!" -ForegroundColor Green 
 