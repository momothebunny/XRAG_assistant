$f = "frontend\src\components\tabs\canvas\canvasConfig.js"
$c = [System.IO.File]::ReadAllText($f)
$rx1 = [regex]::new("category:\s*'Process'")
Write-Host ("Process category count: " + $rx1.Matches($c).Count)
$rx2 = [regex]::new("(?s)category:\s*'Process'.{0,400}?colorClass:\s*'bg-amber-50 border-amber-200 text-amber-700'")
Write-Host ("Process+amber colorClass nearby: " + $rx2.Matches($c).Count)

$pattern = "(?s)(category:\s*'Process',\s*\r?\n.{0,400}?colorClass:\s*')bg-amber-50 border-amber-200 text-amber-700"
$rx = [regex]::new($pattern)
$matches = $rx.Matches($c)
Write-Host ("Replacement matches: " + $matches.Count)
$new = $rx.Replace($c, '${1}bg-cyan-50 border-cyan-200 text-cyan-700')
[System.IO.File]::WriteAllText($f, $new, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Done."
