# Conta em quantos negócios (deals) cada produto aparece e quando foi usado pela última vez.
# Somente leitura. Resultado: catalogo/data/uso-produtos.json
#
#   powershell -ExecutionPolicy Bypass -File catalogo\scripts\uso-em-negocios.ps1

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'B24.psm1') -Force
$dataDir = Join-Path $PSScriptRoot '..\data'

Write-Host 'Listando negócios...'
$deals = @(); $start = 0
while ($true) {
  $r = Invoke-B24 'crm.deal.list' @{ select = @('ID', 'DATE_CREATE', 'STAGE_SEMANTIC_ID'); order = @{ ID = 'ASC' }; start = $start }
  $deals += $r.result
  if (-not $r.next) { break }
  $start = $r.next
}
Write-Host "$($deals.Count) negócios. Lendo produtos de cada um (lotes de 50)..."

$uso = @{}
for ($i = 0; $i -lt $deals.Count; $i += 50) {
  $chunk = $deals[$i..([math]::Min($i + 49, $deals.Count - 1))]
  $cmd = @{}
  foreach ($d in $chunk) { $cmd["d$($d.ID)"] = "crm.deal.productrows.get?id=$($d.ID)" }
  $res = Invoke-B24 'batch' @{ halt = 0; cmd = $cmd }
  foreach ($d in $chunk) {
    $rows = $res.result.result."d$($d.ID)"
    foreach ($row in @($rows)) {
      if (-not $row -or -not $row.PRODUCT_ID -or $row.PRODUCT_ID -eq 0) { continue }
      $k = "$($row.PRODUCT_ID)"
      if (-not $uso[$k]) { $uso[$k] = [ordered]@{ productId = [int]$k; negocios = 0; ganhos = 0; ultimo = ''; nomeNoNegocio = $row.PRODUCT_NAME } }
      $uso[$k].negocios++
      if ($d.STAGE_SEMANTIC_ID -eq 'S') { $uso[$k].ganhos++ }
      if ("$($d.DATE_CREATE)" -gt $uso[$k].ultimo) { $uso[$k].ultimo = "$($d.DATE_CREATE)" }
    }
  }
  Write-Progress -Activity 'Produtos em negócios' -PercentComplete (100 * $i / $deals.Count)
}

$out = [ordered]@{ readAt = (Get-Date).ToString('s'); totalNegocios = $deals.Count; uso = @($uso.Values) }
[IO.File]::WriteAllText((Join-Path $dataDir 'uso-produtos.json'), ($out | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding $false))
Write-Host "Produtos distintos usados em negócios: $($uso.Count)"
