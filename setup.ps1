# Work Location Calendar - Setup Script
# This script helps you copy the example config file

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Work Location Calendar - Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if config.js already exists
if (Test-Path "config.js") {
    Write-Host "⚠️  config.js already exists!" -ForegroundColor Yellow
    Write-Host "Do you want to overwrite it? (y/n)" -ForegroundColor Yellow
    $overwrite = Read-Host
    
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "Setup cancelled. Your existing config.js is unchanged." -ForegroundColor Green
        exit
    }
}

# Check if config.example.js exists
if (-not (Test-Path "config.example.js")) {
    Write-Host "❌ Error: config.example.js not found!" -ForegroundColor Red
    Write-Host "Make sure you're running this script from the project directory." -ForegroundColor Red
    exit 1
}

# Copy the example file
Copy-Item "config.example.js" "config.js"
Write-Host "✅ Created config.js from config.example.js" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Open config.js in your editor" -ForegroundColor White
Write-Host "2. Replace the placeholder values with your Firebase credentials" -ForegroundColor White
Write-Host "3. Get your Firebase config from: https://console.firebase.google.com/" -ForegroundColor White
Write-Host "4. See README.md for detailed instructions" -ForegroundColor White
Write-Host ""

Write-Host "Setup complete! 🎉" -ForegroundColor Green
