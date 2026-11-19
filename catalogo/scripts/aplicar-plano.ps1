# Aplica um plano (data/plano-*.json) no Bitrix24, uma fase por vez.
# Retomável: as operações já feitas ficam em <plano>.estado.json e não são repetidas.
#
#   powershell -ExecutionPolicy Bypass -File catalogo\scripts\aplicar-plano.ps1 -Plano catalogo\data\plano-ab.json -Fase A
#   (use -Simular para só mostrar o que seria feito)

param(
  [Parameter(Mandatory)][string]$Plano,
  [Parameter(Mandatory)][string]$Fase,
  [switch]$Simular
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'B24.psm1') -Force

$planFile = Resolve-Path $Plano
$stateFile = "$planFile".Replace('.json', '.estado.json')
$plan = Get-Content $planFile -Raw -Encoding UTF8 | ConvertFrom-Json
$state = if (Test-Path $stateFile) { Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { [pscustomobject]@{ keys = [pscustomobject]@{}; feitas = @(); log = @() } }

function Save-State { [IO.File]::WriteAllText($stateFile, ($state | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding $false)) }
function Resolve-Ref($v) {
  if ($v -is [string] -and $v.StartsWith('@')) {
    $id = $state.keys.($v.Substring(1))
    if (-not $id) { throw "Pasta nova '$v' ainda não foi criada (aplique a fase A antes)." }
    return [int]$id
  }
  return $v
}
function To-Hash($obj) { $h = [ordered]@{}; foreach ($p in $obj.PSObject.Properties) { $h[$p.Name] = Resolve-Ref $p.Value }; return $h }

$ops = @($plan.ops)
$n = 0; $ok = 0; $err = 0
for ($i = 0; $i -lt $ops.Count; $i++) {
  $o = $ops[$i]
  if ($o.fase -ne $Fase) { continue }
  if ($state.feitas -contains $i) { continue }
  $n++
  try {
    switch ($o.op) {
      'section.create' {
        $f = To-Hash $o.fields
        if ($Simular) { "[sim] criar pasta '$($f.name)' em $($f.iblockSectionId)"; break }
        $r = Invoke-B24 'catalog.section.add' @{ fields = $f }
        $state.keys | Add-Member -NotePropertyName $o.key -NotePropertyValue $r.result.section.id -Force
        $msg = "pasta criada '$($f.name)' -> id $($r.result.section.id)"
      }
      'section.update' {
        $f = To-Hash $o.fields
        if ($Simular) { "[sim] pasta $($o.id) -> '$($f.name)' em $($f.iblockSectionId)"; break }
        [void](Invoke-B24 'catalog.section.update' @{ id = $o.id; fields = $f })
        $msg = "pasta $($o.id) -> '$($f.name)' (pai $($f.iblockSectionId))"
      }
      'product.move' {
        $sec = Resolve-Ref $o.section
        if ($Simular) { "[sim] item $($o.id) -> pasta $sec"; break }
        [void](Invoke-B24 'catalog.product.update' @{ id = $o.id; fields = @{ iblockSectionId = $sec; iblockSection = @($sec) } })
        $msg = "item $($o.id) -> pasta $sec"
      }
      'product.update' {
        $f = To-Hash $o.fields
        if ($Simular) { "[sim] item $($o.id): $($f | ConvertTo-Json -Compress)"; break }
        # Serviços (tipo 7) usam catalog.product.service.update
        $method = if ("$($o.tipo)" -eq '7') { 'catalog.product.service.update' } else { 'catalog.product.update' }
        [void](Invoke-B24 $method @{ id = $o.id; fields = $f })
        $msg = "item $($o.id) atualizado: $($f.Keys -join ', ')"
      }
      'section.delete' {
        # Segurança: excluir pasta apaga os itens dela. Só segue se ela e as subpastas estiverem vazias.
        $all = Get-B24All 'catalog.section.list' @{ select = @('id', 'iblockSectionId'); filter = @{ iblockId = 14 } }
        $tree = @([int]$o.id); $grew = $true
        while ($grew) { $grew = $false; foreach ($x in $all) { if ($tree -contains [int]$x.iblockSectionId -and $tree -notcontains [int]$x.id) { $tree += [int]$x.id; $grew = $true } } }
        $inside = Get-B24All 'catalog.product.list' @{ select = @('id', 'iblockId'); filter = @{ iblockId = 14; iblockSectionId = $tree } }
        if ($inside.Count) { throw "pasta $($o.id) não está vazia ($($inside.Count) itens: $(($inside.id) -join ',')) — não excluída" }
        if ($Simular) { "[sim] excluir pasta $($o.id) (vazia; subpastas: $($tree -join ','))"; break }
        [void](Invoke-B24 'catalog.section.delete' @{ id = $o.id })
        $msg = "pasta $($o.id) excluída"
      }
      default { throw "Operação desconhecida: $($o.op)" }
    }
    if (-not $Simular) {
      $state.feitas = @($state.feitas) + $i
      $state.log = @($state.log) + "$((Get-Date).ToString('s')) OK  $msg"
      Save-State; $ok++; Write-Host "OK  $msg"
    }
  } catch {
    $err++
    $state.log = @($state.log) + "$((Get-Date).ToString('s')) ERRO op#$i $($o.op) $($o.id): $_"
    Save-State; Write-Host "ERRO op#$i $($o.op) $($o.id): $_" -ForegroundColor Red
  }
}
Write-Host ''
Write-Host "Fase ${Fase}: $n operações pendentes, $ok aplicadas, $err com erro."
