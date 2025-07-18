# Install Dependencies Script for ASA Management API
# This script installs the required dependencies for migration

Write-Host "=== ASA Management API Dependencies Installation ===" -ForegroundColor Green
Write-Host ""

# Check if we're in the correct directory
$currentDir = Get-Location
Write-Host "Current directory: $currentDir" -ForegroundColor Cyan

if (-not $currentDir.Path.Contains("C:\ASA-API")) {
    Write-Host "WARNING: This script is designed to run from C:\ASA-API" -ForegroundColor Yellow
    Write-Host "Current directory: $currentDir" -ForegroundColor Yellow
    Write-Host ""
    
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        Write-Host "Installation cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Check if Node.js is available
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js not found!" -ForegroundColor Red
    Write-Host "Please install Node.js and try again." -ForegroundColor Yellow
    exit 1
}

# Check if npm is available
try {
    $npmVersion = npm --version
    Write-Host "npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: npm not found!" -ForegroundColor Red
    Write-Host "Please install npm and try again." -ForegroundColor Yellow
    exit 1
}

# Check if package.json exists
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: package.json not found!" -ForegroundColor Red
    Write-Host "Make sure you're running this from the ASA-API directory." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Cyan

# Install all dependencies first
try {
    Write-Host "Running: npm install" -ForegroundColor Gray
    npm install
    Write-Host "✅ All dependencies installed successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to install dependencies: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Specifically check and install better-sqlite3
Write-Host ""
Write-Host "Checking better-sqlite3..." -ForegroundColor Cyan

try {
    # Try ES module import
    $testModule = node -e "import('better-sqlite3').then(() => console.log('better-sqlite3 available')).catch(() => process.exit(1))"
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host "✅ better-sqlite3 is available" -ForegroundColor Green
    } else {
        throw "Module not found"
    }
} catch {
    Write-Host "⚠️  better-sqlite3 not found, attempting installation..." -ForegroundColor Yellow
    
    try {
        Write-Host "Running: npm install better-sqlite3" -ForegroundColor Gray
        npm install better-sqlite3
        Write-Host "✅ better-sqlite3 installed successfully" -ForegroundColor Green
        
        # Verify installation
        $verifyModule = node -e "import('better-sqlite3').then(() => console.log('better-sqlite3 verified')).catch(() => process.exit(1))"
        $verifyExitCode = $LASTEXITCODE
        
        if ($verifyExitCode -eq 0) {
            Write-Host "✅ better-sqlite3 verified and working" -ForegroundColor Green
        } else {
            throw "Installation verification failed"
        }
    } catch {
        Write-Host "❌ Failed to install better-sqlite3" -ForegroundColor Red
        Write-Host ""
        Write-Host "Trying alternative installation methods..." -ForegroundColor Yellow
        
        try {
            Write-Host "Attempting: npm install better-sqlite3 --build-from-source" -ForegroundColor Gray
            npm install better-sqlite3 --build-from-source
            Write-Host "✅ better-sqlite3 installed with build-from-source" -ForegroundColor Green
        } catch {
            Write-Host "❌ All installation methods failed" -ForegroundColor Red
            Write-Host ""
            Write-Host "Manual installation required:" -ForegroundColor Yellow
            Write-Host "1. Ensure you have Visual Studio Build Tools installed" -ForegroundColor White
            Write-Host "2. Run: npm install better-sqlite3 --build-from-source" -ForegroundColor White
            Write-Host "3. If that fails, try: npm install better-sqlite3 --target=22.17.0 --arch=x64" -ForegroundColor White
            exit 1
        }
    }
}

Write-Host ""
Write-Host "✅ All dependencies are now installed and ready!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now run the migration:" -ForegroundColor Cyan
Write-Host "  .\scripts\migrate-production.ps1" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to exit" 
