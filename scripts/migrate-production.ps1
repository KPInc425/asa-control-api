# Production Migration Script for ASA Management API
# This script runs the migration from the production service directory (C:\ASA-API)

param(
    [string]$CustomDbPath = "",
    [switch]$Force = $false,
    [switch]$Help = $false
)

if ($Help) {
    Write-Host @"
Production Migration Script for ASA Management API

Usage: .\migrate-production.ps1 [options]

Options:
    -CustomDbPath <path>    Specify custom database path
    -Force                  Skip confirmation prompts
    -Help                   Show this help message

Examples:
    .\migrate-production.ps1
    .\migrate-production.ps1 -Force
    .\migrate-production.ps1 -CustomDbPath "D:\custom\path\asa-data.sqlite"

This script will:
1. Check if running from C:\ASA-API
2. Run the migration with service path detection
3. Create the database in C:\ASA-API\data\asa-data.sqlite
"@
    exit 0
}

Write-Host "=== ASA Management API Production Migration ===" -ForegroundColor Green
Write-Host ""

# Check if we're in the correct directory
$currentDir = Get-Location
Write-Host "Current directory: $currentDir" -ForegroundColor Cyan

if (-not $currentDir.Path.Contains("C:\ASA-API")) {
    Write-Host "WARNING: This script is designed to run from C:\ASA-API" -ForegroundColor Yellow
    Write-Host "Current directory: $currentDir" -ForegroundColor Yellow
    Write-Host ""
    
    if (-not $Force) {
        $continue = Read-Host "Continue anyway? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Write-Host "Migration cancelled." -ForegroundColor Yellow
            exit 0
        }
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

# Check if the migration script exists
$migrationScript = "scripts\migrate-json-to-sqlite.js"
if (-not (Test-Path $migrationScript)) {
    Write-Host "ERROR: Migration script not found: $migrationScript" -ForegroundColor Red
    Write-Host "Make sure you're running this from the ASA-API directory." -ForegroundColor Yellow
    exit 1
}

# Check if better-sqlite3 is installed
try {
    $testModule = node -e "require('better-sqlite3'); console.log('better-sqlite3 available')"
    Write-Host "better-sqlite3 module: Available" -ForegroundColor Green
} catch {
    Write-Host "WARNING: better-sqlite3 module not found" -ForegroundColor Yellow
    Write-Host "Attempting to install..." -ForegroundColor Cyan
    
    try {
        npm install better-sqlite3
        Write-Host "better-sqlite3 installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Failed to install better-sqlite3" -ForegroundColor Red
        Write-Host "Please run: npm install better-sqlite3" -ForegroundColor Yellow
        exit 1
    }
}

# Prepare migration command
$migrationArgs = @("--service-path")

if ($CustomDbPath) {
    $migrationArgs = @("--db-path", $CustomDbPath)
    Write-Host "Using custom database path: $CustomDbPath" -ForegroundColor Cyan
} else {
    Write-Host "Using service database path: C:\ASA-API\data\asa-data.sqlite" -ForegroundColor Cyan
}

# Show what will be migrated
Write-Host ""
Write-Host "Migration will process:" -ForegroundColor Cyan
Write-Host "  - Clusters and servers from C:\ARK\clusters" -ForegroundColor White
Write-Host "  - Server mods from C:\ARK\server-mods.json" -ForegroundColor White
Write-Host "  - Server mods from C:\ARK\server-mods\*.json" -ForegroundColor White
Write-Host "  - Shared mods from C:\ARK\shared-mods.json" -ForegroundColor White
Write-Host ""

if (-not $Force) {
    $confirm = Read-Host "Start migration? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "Migration cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Create data directory if it doesn't exist
$dataDir = "C:\ASA-API\data"
if (-not (Test-Path $dataDir)) {
    Write-Host "Creating data directory: $dataDir" -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

# Run the migration
Write-Host ""
Write-Host "Starting migration..." -ForegroundColor Yellow
Write-Host "Command: node $migrationScript $($migrationArgs -join ' ')" -ForegroundColor Gray

try {
    $result = & node $migrationScript @migrationArgs
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "✅ Migration completed successfully!" -ForegroundColor Green
        
        # Show database location
        if ($CustomDbPath) {
            $dbPath = $CustomDbPath
        } else {
            $dbPath = "C:\ASA-API\data\asa-data.sqlite"
        }
        
        if (Test-Path $dbPath) {
            $dbSize = (Get-Item $dbPath).Length
            $dbSizeMB = [math]::Round($dbSize / 1MB, 2)
            Write-Host "Database created: $dbPath" -ForegroundColor Green
            Write-Host "Database size: $dbSizeMB MB" -ForegroundColor Green
        } else {
            Write-Host "WARNING: Database file not found at expected location" -ForegroundColor Yellow
        }
        
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Restart the ASA-API service to use the new database" -ForegroundColor White
        Write-Host "2. Verify data migration in the web dashboard" -ForegroundColor White
        Write-Host "3. Backup the old JSON files if needed" -ForegroundColor White
        
    } else {
        Write-Host ""
        Write-Host "❌ Migration failed with exit code: $exitCode" -ForegroundColor Red
        Write-Host "Check the output above for error details." -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ Migration failed with error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Read-Host "Press Enter to exit" 
