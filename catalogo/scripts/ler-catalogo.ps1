# Lê o catálogo comercial completo (catálogos, pastas, produtos, serviços, preços e referências)
# e grava um snapshot JSON em catalogo/data/. Somente leitura — não altera nada no Bitrix24.
#
#   powershell -ExecutionPolicy Bypass -File catalogo\scripts\ler-catalogo.ps1

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'B24.psm1') -Force

$dataDir = Join-Path $PSScriptRoot '..\data'
New-Item -ItemType Directory -Force $dataDir | Out-Null

Write-Host 'Lendo catálogos...'
$catalogs = Get-B24All 'catalog.catalog.list' @{ select = @('id', 'iblockId', 'name', 'productIblockId', 'skuPropertyId') }

$sections = @(); $products = @()
$productFields = @('id', 'iblockId', 'name', 'type', 'iblockSectionId', 'active', 'code', 'xmlId', 'sort',
  'previewText', 'detailText', 'measure', 'vatId', 'vatIncluded', 'purchasingPrice', 'purchasingCurrency',
  'dateCreate', 'timestampX', 'createdBy', 'modifiedBy')

foreach ($c in $catalogs) {
  $ib = [int]$c.iblockId
  Write-Host "Catálogo '$($c.name)' (iblock $ib): pastas..."
  $sections += Get-B24All 'catalog.section.list' @{
    select = @('id', 'iblockId', 'iblockSectionId', 'name', 'code', 'sort', 'active', 'description', 'xmlId')
    filter = @{ iblockId = $ib }
  }
  Write-Host "Catálogo '$($c.name)' (iblock $ib): produtos e serviços..."
  $products += Get-B24All 'catalog.product.list' @{ select = $productFields; filter = @{ iblockId = $ib } }
}

Write-Host 'Lendo preços e referências...'
$prices = Get-B24All 'catalog.price.list' @{ select = @('id', 'productId', 'catalogGroupId', 'price', 'currency', 'quantityFrom', 'quantityTo') }
$priceTypes = Get-B24All 'catalog.priceType.list' @{}
$measures = Get-B24All 'catalog.measure.list' @{}
$vats = Get-B24All 'catalog.vat.list' @{}

$snapshot = [ordered]@{
  readAt     = (Get-Date).ToString('s')
  portal     = ([uri](Get-B24Webhook)).Host
  catalogs   = $catalogs
  sections   = $sections
  products   = $products
  prices     = $prices
  priceTypes = $priceTypes
  measures   = $measures
  vats       = $vats
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$file = Join-Path $dataDir "snapshot-$stamp.json"
$json = $snapshot | ConvertTo-Json -Depth 20
[IO.File]::WriteAllText($file, $json, (New-Object Text.UTF8Encoding $false))
Copy-Item $file (Join-Path $dataDir 'snapshot-atual.json') -Force

$types = $products | Group-Object type | ForEach-Object { "tipo $($_.Name): $($_.Count)" }
Write-Host ''
Write-Host "Snapshot salvo em $file"
Write-Host "$($catalogs.Count) catálogos, $($sections.Count) pastas, $($products.Count) itens ($($types -join ', ')), $($prices.Count) preços"
