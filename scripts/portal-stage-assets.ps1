$ErrorActionPreference = "Stop"

Write-Host "Staging portal build artifacts..."

# Stage both index.html and all hashed assets, including deletions.
git add -A public/portal-app

$status = git status --short public/portal-app
if ([string]::IsNullOrWhiteSpace($status)) {
  Write-Host "No portal artifact changes detected."
} else {
  Write-Host "Portal artifact changes staged:"
  Write-Host $status
}
