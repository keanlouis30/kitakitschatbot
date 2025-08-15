# Quick Webhook Diagnosis Script for KitaKits
# Run this in PowerShell to test your deployment

Write-Host "🔍 KitaKits Webhook Diagnosis" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow

# Get Render URL from user
$renderUrl = Read-Host "Enter your Render URL (e.g., https://kitakits-chatbot-abc123.onrender.com)"

if (-not $renderUrl) {
    Write-Host "❌ Please provide your Render URL" -ForegroundColor Red
    exit
}

# Remove trailing slash if present
$renderUrl = $renderUrl.TrimEnd('/')

Write-Host "`n🧪 Testing your deployment..." -ForegroundColor Cyan

# Test 1: Check if server is running
Write-Host "`n1️⃣ Testing server status..." -ForegroundColor Green
try {
    $analytics = Invoke-RestMethod -Uri "$renderUrl/analytics" -Method Get -TimeoutSec 30
    Write-Host "✅ Server is responding" -ForegroundColor Green
    Write-Host "📊 Analytics endpoint working" -ForegroundColor Green
} catch {
    Write-Host "❌ Server not responding: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Possible issues:" -ForegroundColor Yellow
    Write-Host "   - Render service is sleeping (free tier)" -ForegroundColor Yellow
    Write-Host "   - Deployment failed" -ForegroundColor Yellow
    Write-Host "   - Wrong URL" -ForegroundColor Yellow
    return
}

# Test 2: Test webhook verification
Write-Host "`n2️⃣ Testing webhook verification..." -ForegroundColor Green
$verifyToken = Read-Host "Enter your VERIFY_TOKEN (from Render environment variables)"

if ($verifyToken) {
    try {
        $challenge = "test123"
        $webhookTest = Invoke-RestMethod -Uri "$renderUrl/webhook?hub.mode=subscribe&hub.verify_token=$verifyToken&hub.challenge=$challenge" -Method Get
        
        if ($webhookTest -eq $challenge) {
            Write-Host "✅ Webhook verification working" -ForegroundColor Green
        } else {
            Write-Host "❌ Webhook verification failed" -ForegroundColor Red
            Write-Host "Expected: $challenge, Got: $webhookTest" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ Webhook verification error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "💡 Check your VERIFY_TOKEN in Render environment variables" -ForegroundColor Yellow
    }
} else {
    Write-Host "⏭️ Skipping webhook verification test" -ForegroundColor Yellow
}

# Test 3: Test POST webhook (simulate Facebook message)
Write-Host "`n3️⃣ Testing message processing..." -ForegroundColor Green
try {
    $testMessage = @{
        object = "page"
        entry = @(
            @{
                messaging = @(
                    @{
                        sender = @{ id = "test_user_123" }
                        message = @{ text = "test message" }
                    }
                )
            }
        )
    } | ConvertTo-Json -Depth 4

    $response = Invoke-RestMethod -Uri "$renderUrl/webhook" -Method Post -Body $testMessage -ContentType "application/json"
    
    if ($response -eq "EVENT_RECEIVED") {
        Write-Host "✅ Message processing endpoint working" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Unexpected response: $response" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Message processing error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Check Render logs for detailed error messages" -ForegroundColor Yellow
}

# Summary and next steps
Write-Host "`n📋 DIAGNOSIS SUMMARY" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow

Write-Host "`n🔧 NEXT STEPS:" -ForegroundColor Cyan
Write-Host "1. Check your Render Dashboard → Logs for detailed error messages"
Write-Host "2. Verify your Facebook Developer Console webhook configuration:"
Write-Host "   - Callback URL: $renderUrl/webhook"
Write-Host "   - Verify Token: (matches your Render VERIFY_TOKEN)"
Write-Host "   - Subscribed to: messages, messaging_postbacks"
Write-Host "3. Test by sending a message to your Facebook Page"
Write-Host "4. Monitor Render logs while testing"

Write-Host "`n🆘 If still not working:" -ForegroundColor Red
Write-Host "- Share your Render URL and recent logs"
Write-Host "- Screenshot your Facebook webhook configuration"
Write-Host "- Check if your PAGE_ACCESS_TOKEN is valid"

Write-Host "`nPress any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
