param(
    [string]$Query = "",
    [string]$Origin = "LHR",
    [string]$Destination = "BCN",
    [string]$DateFrom = "2026-08-15",
    [int]$Adults = 1,
    [string]$Currency = "CAD",
    [int]$MaxStops = -1,
    [int]$PollAttempts = 12,
    [int]$PollSeconds = 10
)

$ErrorActionPreference = "Stop"

$token = [Environment]::GetEnvironmentVariable("LETSFG_API_KEY", "User")
if (-not $token) {
    Write-Error "LETSFG_API_KEY is not set in the Windows User environment."
}

$trimmed = $token.Trim()
$authorization = if ($trimmed.StartsWith("Bearer ")) { $trimmed } else { "Bearer $trimmed" }

$searchBody = if ($Query.Trim()) {
    @{
        query = $Query.Trim()
    }
} else {
    @{
        origin = $Origin
        destination = $Destination
        date_from = $DateFrom
        adults = $Adults
        currency = $Currency
    }
}

if (-not $Query.Trim() -and $MaxStops -ge 0) {
    $searchBody.max_stops = $MaxStops
}

$body = $searchBody | ConvertTo-Json -Depth 5 -Compress

function Invoke-LetsFGJson {
    param(
        [string]$Method,
        [string]$Uri,
        [string]$Body = $null
    )

    $tempFile = New-TemporaryFile
    try {
        $args = @(
            "-sS",
            "-w", "`nHTTP_STATUS:%{http_code}`n",
            "-X", $Method,
            $Uri,
            "-H", "Authorization: $authorization",
            "-H", "Content-Type: application/json"
        )
        if ($Body) {
            $args += @("--data", $Body)
        }

        $raw = & curl.exe @args
        $statusLine = $raw | Select-String -Pattern "^HTTP_STATUS:"
        $status = [int]($statusLine.Line -replace "HTTP_STATUS:", "")
        $jsonText = ($raw | Where-Object { $_ -notmatch "^HTTP_STATUS:" }) -join "`n"
        $json = if ($jsonText.Trim()) { $jsonText | ConvertFrom-Json } else { $null }

        [PSCustomObject]@{
            Status = $status
            Json = $json
            Raw = $jsonText
        }
    } finally {
        Remove-Item -LiteralPath $tempFile -ErrorAction SilentlyContinue
    }
}

if ($Query.Trim()) {
    Write-Host "Starting LetsFG search: $($Query.Trim())"
} else {
    Write-Host "Starting LetsFG search: $Origin to $Destination on $DateFrom"
}
$start = Invoke-LetsFGJson -Method "POST" -Uri "https://letsfg.co/api/search" -Body $body
Write-Host "Search HTTP $($start.Status)"

if ($start.Status -ne 200) {
    if ($start.Json -and $start.Json.error) {
        Write-Host "Error: $($start.Json.error)"
        if ($start.Json.retry_after_seconds) {
            Write-Host "Retry after seconds: $($start.Json.retry_after_seconds)"
        }
    } else {
        Write-Host $start.Raw
    }
    exit 1
}

$searchId = $start.Json.search_id
if (-not $searchId) {
    Write-Host "No search_id returned."
    Write-Host $start.Raw
    exit 1
}

Write-Host "search_id: $searchId"

for ($attempt = 1; $attempt -le $PollAttempts; $attempt++) {
    if ($attempt -gt 1) {
        Start-Sleep -Seconds $PollSeconds
    }

    $result = Invoke-LetsFGJson -Method "GET" -Uri "https://letsfg.co/api/results/$searchId"
    Write-Host "Poll $attempt HTTP $($result.Status): $($result.Json.status)"

    if ($result.Status -ne 200) {
        if ($result.Json -and $result.Json.error) {
            Write-Host "Error: $($result.Json.error)"
        } else {
            Write-Host $result.Raw
        }
        exit 1
    }

    if ($result.Json.status -eq "completed") {
        Write-Host "completed total_results=$($result.Json.total_results) cheapest_price=$($result.Json.cheapest_price)"
        $offer = @($result.Json.offers | Sort-Object price | Select-Object -First 1)[0]
        if ($offer) {
            Write-Host "best_offer price=$($offer.price) currency=$($offer.currency) google_flights_price=$($offer.google_flights_price) airline=$($offer.airline_code)"
        }
        exit 0
    }

    if ($result.Json.status -eq "expired") {
        Write-Host "Search expired."
        exit 1
    }
}

Write-Host "Timed out waiting for completed results."
exit 1
