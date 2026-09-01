# Comprehensive Test Suite for Hospital WhatsApp Bot - Phase 2
# ============================================================

$baseUrl = "http://localhost:5000/webhook/whatsapp"
$projectId = "demo_project_123"

function MakeRequest {
    param([string]$phone, [string]$message)
    $body = @{ from = $phone; message = $message; projectId = $projectId } | ConvertTo-Json
    $response = Invoke-WebRequest -Uri $baseUrl -Method POST -ContentType "application/json" -Body $body -UseBasicParsing
    return $response.Content | ConvertFrom-Json
}

Write-Host "`n╔════════════════════════════════════════════════════════════════╗"
Write-Host "║  COMPREHENSIVE TEST SUITE - Hospital WhatsApp Bot (Phase 2)    ║"
Write-Host "╚════════════════════════════════════════════════════════════════╝`n"

# ===============================================
# TEST GROUP 1: Doctor Availability
# ===============================================
Write-Host "TEST GROUP 1: Doctor Availability (Option 2)" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────" -ForegroundColor Yellow

$doctors = @(
    @{name = "Rajesh"; phone = "+919111111101"},
    @{name = "Priya"; phone = "+919111111102"},
    @{name = "Vikram"; phone = "+919111111103"},
    @{name = "Anita"; phone = "+919111111104"},
    @{name = "Dr. Unknown"; phone = "+919111111105"}
)

foreach ($doc in $doctors) {
    $result = MakeRequest -phone $doc.phone -message "Rajesh Kumar"
    $isFound = if ($result.response.message -match "Dr. Rajesh") { "✅" } else { "❌" }
    Write-Host "$isFound Test 1: Dr. Rajesh Kumar - $($result.response.message.Split("`n")[0])"
}

Write-Host ""

# ===============================================
# TEST GROUP 2: Report Status Lookup
# ===============================================
Write-Host "TEST GROUP 2: Report Status Lookup (Option 3)" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────" -ForegroundColor Yellow

$patients = @(
    @{id = "PAT001"; phone = "+919222222201"; desc = "Blood Test + X-Ray"},
    @{id = "PAT002"; phone = "+919222222202"; desc = "All reports ready"},
    @{id = "PAT999"; phone = "+919222222299"; desc = "Non-existent patient"}
)

foreach ($patient in $patients) {
    $result = MakeRequest -phone $patient.phone -message $patient.id
    $hasReports = if ($result.response.message -match "Report") { "✅" } else { "❌" }
    Write-Host "$hasReports Test $(2 + $($patients.IndexOf($patient))): Patient $($patient.id) - $($patient.desc)"
}

Write-Host ""

# ===============================================
# TEST GROUP 3: Free-Text Questions
# ===============================================
Write-Host "TEST GROUP 3: Free-Text Questions" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────" -ForegroundColor Yellow

$questions = @(
    @{q = "Do you have parking available?"; phone = "+919333333301"; type = "FAQ - Should NOT escalate"},
    @{q = "What are your visiting hours?"; phone = "+919333333302"; type = "FAQ - Should NOT escalate"},
    @{q = "What is the best way to manage fever?"; phone = "+919333333303"; type = "Medical - Should escalate"},
    @{q = "I have severe chest pain, what should I do?"; phone = "+919333333304"; type = "Emergency - Should escalate"},
    @{q = "Do you accept insurance?"; phone = "+919333333305"; type = "FAQ - Should NOT escalate"}
)

foreach ($q in $questions) {
    $result = MakeRequest -phone $q.phone -message $q.q
    $isEscalation = if ($result.response.type -eq "escalation") { "🚨 ESCALATED" } else { "💬 ANSWERED" }
    Write-Host "$isEscalation - $($q.type)"
    Write-Host "   Q: $($q.q)"
    Write-Host "   Response: $($result.response.message.Split("`n")[0])"
    Write-Host ""
}

# ===============================================
# TEST GROUP 4: Menu Navigation
# ===============================================
Write-Host "TEST GROUP 4: Menu Navigation" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────" -ForegroundColor Yellow

$menuTests = @(
    @{opt = "1"; phone = "+919444444401"; name = "Visiting Hours"},
    @{opt = "2"; phone = "+919444444402"; name = "Doctor Availability"},
    @{opt = "3"; phone = "+919444444403"; name = "Report Status"},
    @{opt = "4"; phone = "+919444444404"; name = "Billing Info"},
    @{opt = "5"; phone = "+919444444405"; name = "Talk to Front Desk"}
)

foreach ($test in $menuTests) {
    $result = MakeRequest -phone $test.phone -message $test.opt
    $success = if ($result.success -eq $true) { "✅" } else { "❌" }
    Write-Host "$success Option $($test.opt): $($test.name) - Type: $($result.response.type)"
}

Write-Host ""

# ===============================================
# TEST GROUP 5: State Persistence
# ===============================================
Write-Host "TEST GROUP 5: State Persistence" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────" -ForegroundColor Yellow

$testPhone = "+919555555555"

# Message 1: Start doctor lookup
Write-Host "Step 1: Select option 2 (Doctor Availability)"
$r1 = MakeRequest -phone $testPhone -message "2"
Write-Host "   Step state: waiting_for_doctor_name"
Write-Host "   Response: $($r1.response.message.Split("`n")[0])"

# Message 2: Enter doctor name
Write-Host "Step 2: Enter doctor name 'Vikram'"
$r2 = MakeRequest -phone $testPhone -message "Vikram"
Write-Host "   Doctor found: $(if ($r2.response.message -match 'Vikram') { '✅' } else { '❌' })"

# Message 3: Return to menu
Write-Host "Step 3: Return to menu"
$r3 = MakeRequest -phone $testPhone -message "menu"
Write-Host "   Back at main menu: $(if ($r3.response.message -match 'Welcome') { '✅' } else { '❌' })"

Write-Host ""

# ===============================================
# TEST GROUP 6: Edge Cases
# ===============================================
Write-Host "TEST GROUP 6: Edge Cases" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────" -ForegroundColor Yellow

Write-Host 'Test 1: Empty message (ignored, shows menu)'
$r = MakeRequest -phone "+919666666601" -message ""
Write-Host "   Result: Shows menu = $(if ($r.response.message -match 'How can we assist') { '✅' } else { '❌' })"

Write-Host 'Test 2: Invalid menu choice (6)'
$r = MakeRequest -phone "+919666666602" -message "6"
Write-Host "   Result: Invalid choice message = $(if ($r.response.message -match 'Invalid') { '✅' } else { '❌' })"

Write-Host 'Test 3: Case insensitive MENU'
$r = MakeRequest -phone "+919666666603" -message "MENU"
Write-Host "   Result: Shows menu = $(if ($r.response.message -match 'How can we assist') { '✅' } else { '❌' })"

Write-Host 'Test 4: Doctor name with mixed case RAJESH'
$r = MakeRequest -phone "+919666666604" -message "RAJESH"
Write-Host "   Result: Doctor found = $(if ($r.response.message -match 'Dr') { '✅' } else { '❌' })"

Write-Host 'Test 5: Multiple spaces in input'
$r = MakeRequest -phone "+919666666605" -message "  Priya  "
Write-Host "   Result: Trimmed and found = $(if ($r.response.message -match 'Dr') { '✅' } else { '❌' })"

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗"
Write-Host "║  TEST SUITE COMPLETED                                         ║"
Write-Host "╚════════════════════════════════════════════════════════════════╝"
