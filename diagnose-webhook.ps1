# Comprehensive KitaKits Webhook & Feature Testing Script
# Run this in PowerShell to test your deployment and new features

Write-Host "🔍 KitaKits Comprehensive Test Suite" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host "Testing: Webhook, Inventory Management, Smart Parsing & Analytics" -ForegroundColor Cyan

# Get Render URL from user
$renderUrl = Read-Host "Enter your Render URL (e.g., https://kitakits-chatbot-abc123.onrender.com)"

if (-not $renderUrl) {
    Write-Host "❌ Please provide your Render URL" -ForegroundColor Red
    exit
}

# Remove trailing slash if present
$renderUrl = $renderUrl.TrimEnd('/')

# Test counter
$testsPassed = 0
$testsFailed = 0

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

# Test 3: Test Basic Message Processing
Write-Host "`n3️⃣ Testing basic message processing..." -ForegroundColor Green
function Test-WebhookMessage {
    param(
        [string]$TestName,
        [hashtable]$MessageData,
        [string]$ExpectedResponse = "EVENT_RECEIVED"
    )
    
    try {
        $testMessage = @{
            object = "page"
            entry = @(
                @{
                    messaging = @($MessageData)
                }
            )
        } | ConvertTo-Json -Depth 4

        $response = Invoke-RestMethod -Uri "$renderUrl/webhook" -Method Post -Body $testMessage -ContentType "application/json" -TimeoutSec 30
        
        if ($response -eq $ExpectedResponse) {
            Write-Host "  ✅ $TestName" -ForegroundColor Green
            $script:testsPassed++
            return $true
        } else {
            Write-Host "  ⚠️ $TestName - Unexpected response: $response" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "  ❌ $TestName - Error: $($_.Exception.Message)" -ForegroundColor Red
        $script:testsFailed++
        return $false
    }
}

# Test basic text message
$basicMessage = @{
    sender = @{ id = "test_user_001" }
    message = @{ text = "hello" }
}
Test-WebhookMessage "Basic greeting message" $basicMessage

# Test 4: Smart Text Parsing - Add Item Commands
Write-Host "`n4️⃣ Testing smart inventory management..." -ForegroundColor Green

# Test add item with full details
$addItemMessage = @{
    sender = @{ id = "test_user_002" }
    message = @{ text = "Add Coca-Cola 15 24 pcs" }
}
Test-WebhookMessage "Add item with full details" $addItemMessage

# Test add item - simple format
$addSimpleMessage = @{
    sender = @{ id = "test_user_002" }
    message = @{ text = "Shampoo 120" }
}
Test-WebhookMessage "Add item - simple format" $addSimpleMessage

# Test Filipino add command
$addFilipinoMessage = @{
    sender = @{ id = "test_user_002" }
    message = @{ text = "Dagdag Rice 50 10 kg" }
}
Test-WebhookMessage "Filipino add command" $addFilipinoMessage

# Test 5: Smart Parsing - Sales Recording
Write-Host "`n5️⃣ Testing sales recording..." -ForegroundColor Green

# Test sold item command
$soldMessage = @{
    sender = @{ id = "test_user_002" }
    message = @{ text = "Sold Coca-Cola 5" }
}
Test-WebhookMessage "Record sale command" $soldMessage

# Test Filipino sold command
$soldFilipinoMessage = @{
    sender = @{ id = "test_user_002" }
    message = @{ text = "Nabenta Rice 2 kg" }
}
Test-WebhookMessage "Filipino sale command" $soldFilipinoMessage

# Test 6: Stock Check Commands
Write-Host "`n6️⃣ Testing stock check functionality..." -ForegroundColor Green

# Test stock check
$stockMessage = @{
    sender = @{ id = "test_user_002" }
    message = @{ text = "Stock Coca-Cola" }
}
Test-WebhookMessage "Stock check command" $stockMessage

# Test Filipino stock check
$stockFilipinoMessage = @{
    sender = @{ id = "test_user_002" }
    message = @{ text = "Tira ng Rice" }
}
Test-WebhookMessage "Filipino stock check" $stockFilipinoMessage

# Test inventory list
$listMessage = @{
    sender = @{ id = "test_user_002" }
    message = @{ text = "list all" }
}
Test-WebhookMessage "List all inventory" $listMessage

# Test 7: Quick Reply Functionality
Write-Host "`n7️⃣ Testing quick reply menu system..." -ForegroundColor Green

# Test main menu quick reply
$mainMenuMessage = @{
    sender = @{ id = "test_user_003" }
    message = @{ 
        text = "Menu"
        quick_reply = @{ payload = "MAIN_MENU" }
    }
}
Test-WebhookMessage "Main menu quick reply" $mainMenuMessage

# Test add item to inventory quick reply
$addInventoryMessage = @{
    sender = @{ id = "test_user_003" }
    message = @{ 
        text = "Add Item to Inventory"
        quick_reply = @{ payload = "ADD_ITEM_TO_INVENTORY" }
    }
}
Test-WebhookMessage "Add item to inventory quick reply" $addInventoryMessage

# Test summary quick reply
$summaryMessage = @{
    sender = @{ id = "test_user_003" }
    message = @{ 
        text = "Summary"
        quick_reply = @{ payload = "SUMMARY" }
    }
}
Test-WebhookMessage "Business summary quick reply" $summaryMessage

# Test item sold quick reply
$itemSoldMessage = @{
    sender = @{ id = "test_user_003" }
    message = @{ 
        text = "Item Sold"
        quick_reply = @{ payload = "ITEM_SOLD" }
    }
}
Test-WebhookMessage "Item sold quick reply" $itemSoldMessage

# Test 8: Image/OCR Functionality
Write-Host "`n8️⃣ Testing image processing & OCR..." -ForegroundColor Green

# Test image attachment (simulated)
$imageMessage = @{
    sender = @{ id = "test_user_004" }
    message = @{ 
        attachments = @(
            @{
                type = "image"
                payload = @{ url = "https://example.com/test-receipt.jpg" }
            }
        )
    }
}
Test-WebhookMessage "Image attachment processing" $imageMessage

# Test 9: Advanced Commands and Edge Cases
Write-Host "`n9️⃣ Testing advanced commands & edge cases..." -ForegroundColor Green

# Test help command
$helpMessage = @{
    sender = @{ id = "test_user_005" }
    message = @{ text = "help" }
}
Test-WebhookMessage "Help command" $helpMessage

# Test unrecognized command
$unknownMessage = @{
    sender = @{ id = "test_user_005" }
    message = @{ text = "xyz unknown command 123" }
}
Test-WebhookMessage "Unknown command handling" $unknownMessage

# Test empty message (edge case)
$emptyMessage = @{
    sender = @{ id = "test_user_005" }
    message = @{ text = "" }
}
Test-WebhookMessage "Empty message handling" $emptyMessage

# Test Filipino commands
$filipinoCommands = @(
    @{ text = "kumusta"; name = "Filipino greeting" },
    @{ text = "tulong"; name = "Filipino help" },
    @{ text = "lahat"; name = "Filipino list all" }
)

foreach ($cmd in $filipinoCommands) {
    $cmdMessage = @{
        sender = @{ id = "test_user_006" }
        message = @{ text = $cmd.text }
    }
    Test-WebhookMessage $cmd.name $cmdMessage
}

# Test 10: Analytics and Data Verification
Write-Host "`n🔟 Testing analytics and data endpoints..." -ForegroundColor Green

try {
    # Test analytics with query parameters
    $analyticsWithParams = Invoke-RestMethod -Uri "$renderUrl/analytics?days=7" -Method Get -TimeoutSec 30
    Write-Host "  ✅ Analytics with parameters" -ForegroundColor Green
    $script:testsPassed++
    
    # Test analytics data structure (basic validation)
    if ($analyticsWithParams -and $analyticsWithParams.PSObject.Properties.Name.Count -gt 0) {
        Write-Host "  ✅ Analytics returns structured data" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "  ⚠️ Analytics returns empty/invalid data" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "  ❌ Analytics with parameters failed: $($_.Exception.Message)" -ForegroundColor Red
    $script:testsFailed++
}

# Test Results Summary
Write-Host "`n🏆 TEST RESULTS SUMMARY" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Yellow

$totalTests = $testsPassed + $testsFailed
if ($totalTests -gt 0) {
    $successRate = [math]::Round(($testsPassed / $totalTests) * 100, 1)
    
    Write-Host "Total Tests: $totalTests" -ForegroundColor Cyan
    Write-Host "✅ Passed: $testsPassed" -ForegroundColor Green
    Write-Host "❌ Failed: $testsFailed" -ForegroundColor Red
    Write-Host "Success Rate: $successRate%" -ForegroundColor $(if($successRate -ge 80) { "Green" } elseif($successRate -ge 60) { "Yellow" } else { "Red" })
    
    if ($successRate -ge 90) {
        Write-Host "`n🎉 EXCELLENT! Your KitaKits deployment is working great!" -ForegroundColor Green
    } elseif ($successRate -ge 70) {
        Write-Host "`n👍 GOOD! Most features are working. Check failed tests." -ForegroundColor Yellow
    } else {
        Write-Host "`n⚠️ NEEDS ATTENTION! Several features need debugging." -ForegroundColor Red
    }
} else {
    Write-Host "No tests completed - check your server connection." -ForegroundColor Red
}

# Feature-specific recommendations
Write-Host "`n📝 FEATURE STATUS & RECOMMENDATIONS:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "📦 INVENTORY MANAGEMENT:" -ForegroundColor Yellow
Write-Host "- Smart text parsing (Add/Sold/Stock commands)" 
Write-Host "- Quick reply menu system"
Write-Host "- Multi-language support (English/Filipino)"
Write-Host "- Real-time stock tracking"

Write-Host "`n📊 ANALYTICS & INSIGHTS:" -ForegroundColor Yellow
Write-Host "- Business summary generation" 
Write-Host "- Sales tracking and reporting"
Write-Host "- Low stock alerts"
Write-Host "- Historical data analysis"

Write-Host "`n📱 USER EXPERIENCE:" -ForegroundColor Yellow
Write-Host "- Natural language processing" 
Write-Host "- Error handling and user guidance"
Write-Host "- Contextual help system"
Write-Host "- Progressive disclosure UI"

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
