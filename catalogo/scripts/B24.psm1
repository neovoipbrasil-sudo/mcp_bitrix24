# Cliente mínimo da REST API do Bitrix24 para PowerShell 5.1+ (sem dependências).
# Lê B24_DEFAULT_WEBHOOK do .env na raiz do repositório (ou da variável de ambiente).

$script:RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')

function Get-B24Webhook {
  if ($env:B24_DEFAULT_WEBHOOK) { return $env:B24_DEFAULT_WEBHOOK.TrimEnd('/') + '/' }
  $envFile = Join-Path $script:RepoRoot '.env'
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile -Encoding UTF8) {
      if ($line -match '^\s*B24_DEFAULT_WEBHOOK\s*=\s*(.+?)\s*$') { return $Matches[1].Trim('"').TrimEnd('/') + '/' }
    }
  }
  throw "B24_DEFAULT_WEBHOOK não configurado. Crie o arquivo .env na raiz do repo (veja .env.example)."
}

function Invoke-B24 {
  param([Parameter(Mandatory)][string]$Method, [hashtable]$Params = @{})
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $url = (Get-B24Webhook) + "$Method.json"
  $body = [Text.Encoding]::UTF8.GetBytes(($Params | ConvertTo-Json -Depth 20 -Compress))
  for ($try = 0; ; $try++) {
    try {
      Start-Sleep -Milliseconds 500   # limite de taxa do Bitrix24 (~2 req/s)
      $res = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType 'application/json; charset=utf-8'
      if ($res.error) { throw "Bitrix24 [$($res.error)]: $($res.error_description)" }
      return $res
    } catch {
      $status = $_.Exception.Response.StatusCode.value__
      if ($try -lt 3 -and $status -in 429, 502, 503) { Start-Sleep -Seconds ([math]::Pow(2, $try) * 3); continue }
      $detail = $_.ErrorDetails.Message
      if ($detail) { throw "Falha em ${Method}: $detail" }
      throw
    }
  }
}

# Os métodos catalog.* devolvem result = { <coleção>: [...] }. Pagina de 50 em 50.
function Get-B24All {
  param([Parameter(Mandatory)][string]$Method, [hashtable]$Params = @{})
  $all = @(); $start = 0
  while ($true) {
    $p = $Params.Clone(); $p.start = $start
    $res = Invoke-B24 -Method $Method -Params $p
    $r = $res.result
    $items = if ($r -is [array]) { $r } else { @($r.PSObject.Properties | Where-Object { $_.Value -is [array] } | Select-Object -First 1 -ExpandProperty Value) }
    $all += $items
    $start += 50
    if (-not $res.total -or $start -ge $res.total -or $items.Count -lt 50) { break }
  }
  return ,$all
}

Export-ModuleMember -Function Get-B24Webhook, Invoke-B24, Get-B24All
