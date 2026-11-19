# Gera o plano das fases C (nomes, unidade de medida, descrição) e D (desativar itens, excluir pastas vazias).
# Decisões do usuário em 2026-11-12 — ver catalogo/docs/diagnostico-e-proposta.md, seção 4.
# Não altera nada: lê data/snapshot-atual.json e escreve data/plano-cd.json + docs/revisao-fase-cd.md.

$ErrorActionPreference = 'Stop'
$dataDir = Join-Path $PSScriptRoot '..\data'
$s = Get-Content (Join-Path $dataDir 'snapshot-atual.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$items = @{}; foreach ($p in ($s.products | Where-Object iblockId -eq 14)) { $items["$($p.id)"] = $p }

$UN = 10   # Unidade
$MES = 14  # Mês

# ── Nomes novos (só os que mudam além de tirar espaços sobrando) ────────────────
$nomes = @{
  # Atendimento Digital
  870 = 'MSN Talk — 1 hora de suporte (mensal, não acumulativo)'
  840 = 'Talk Chat — 1 hora de suporte (mensal, não acumulativo)'
  984 = 'API Meta de Coexistência (Híbrida)'
  878 = 'MSN Talk — API'
  832 = 'Armazenamento adicional — 1 GB (mensal)'
  988 = 'Neo Zap API — Ativação'
  992 = 'Neo Zap Connect — Ativação'
  1020 = 'MSN Talk — Canal adicional'
  996 = 'MSN Talk — 1 canal WhatsApp, 3 usuários, 1 GB (mensal)'
  980 = 'MSN Talk — 1 canal WhatsApp, 5 usuários, 4 GB (mensal)'
  874 = 'MSN Talk — 5 mil mensagens, 1 GB (mensal)'
  948 = 'Talk Chat — 1 GB (mensal)'
  828 = 'Talk Chat — 5 mil mensagens, 1 GB (mensal)'
  1048 = 'MSN Talk — 25 usuários'
  964 = 'MSN Talk — 5 usuários'
  1000 = 'MSN Talk — Ativação'
  866 = 'MSN Talk — Implantação (pagamento único)'
  464 = 'Talk Chat — Implantação (pagamento único)'
  776 = 'Neo Chat Flex — 4 horas de suporte/mês'
  468 = 'Neo Chat Flex — 16 horas de suporte/mês'
  456 = 'Neo Chat Flex — 5 mil mensagens, 2 GB'
  780 = 'Talk Chat Flex — 4 horas de suporte/mês'
  772 = 'Talk Chat Flex — 20 mil mensagens'
  736 = 'Talk Chat Flex — 5 mil mensagens'
  836 = 'Pacote 1.000 mensagens pré-pago — acima de 431 mil msg/mês'
  854 = 'Pacote 1.000 mensagens pré-pago — 5 a 62 mil msg/mês'
  850 = 'Pacote 1.000 mensagens pré-pago — 63 a 430 mil msg/mês'
  972 = 'Servidor MSN Talk (2 núcleos, 4 GB RAM)'
  968 = 'MSN Talk — Usuário adicional'
  894 = 'MSN Talk — Usuário simultâneo'
  # Serviços
  620 = 'Frete'
  # Internet
  632 = 'Link Dedicado Full — 10 MB'; 150 = 'Link Dedicado Full — 20 MB'; 664 = 'Link Dedicado Full — 30 MB'
  684 = 'Link Dedicado Full — 50 MB'; 146 = 'Link Dedicado Full — 200 MB'
  1040 = 'Link Corporativo Full — 300 MB'; 1044 = 'Link Corporativo Full — 500 MB'
  672 = 'Link FTTH — 100 MB (secundário)'; 676 = 'Instalação FTTH'
  616 = 'Instalação de Link Dedicado — 36 meses'
  # Telefones IP
  494 = 'Fanvil X1S (Fast, com fonte) — Venda'; 500 = 'Fanvil X1S (Fast, com fonte) — Locação 12 meses'
  506 = 'Fanvil X1S (Fast, com fonte) — Locação 24 meses'; 512 = 'Fanvil X1S (Fast, com fonte) — Locação 36 meses'
  498 = 'Fanvil X1SG (Giga, PoE, com fonte) — Venda'; 504 = 'Fanvil X1SG (Giga, PoE, com fonte) — Locação 12 meses'
  510 = 'Fanvil X1SG (Giga, PoE, com fonte) — Locação 24 meses'; 516 = 'Fanvil X1SG (Giga, PoE, com fonte) — Locação 36 meses'
  496 = 'Fanvil X1SP (Fast, PoE, com fonte) — Venda'; 502 = 'Fanvil X1SP (Fast, PoE, com fonte) — Locação 12 meses'
  508 = 'Fanvil X1SP (Fast, PoE, com fonte) — Locação 24 meses'; 514 = 'Fanvil X1SP (Fast, PoE, com fonte) — Locação 36 meses'
  600 = 'Fanvil X301 (Fast, com fonte) — Venda'; 604 = 'Fanvil X301 (Fast, com fonte) — Locação 12 meses'
  608 = 'Fanvil X301 (Fast, com fonte) — Locação 24 meses'; 612 = 'Fanvil X301 (Fast, com fonte) — Locação 36 meses'
  602 = 'Fanvil X303P (Fast, PoE, com fonte) — Venda'; 606 = 'Fanvil X303P (Fast, PoE, com fonte) — Locação 12 meses'
  610 = 'Fanvil X303P (Fast, PoE, com fonte) — Locação 24 meses'; 614 = 'Fanvil X303P (Fast, PoE, com fonte) — Locação 36 meses'
  518 = 'Fanvil X4U V2 (Giga, PoE, com fonte) — Venda'
  524 = 'Fanvil X7 V2 (Giga, PoE, com fonte) — Venda'
  520 = 'Fanvil X7C V2 (Giga, PoE, com fonte) — Venda'
  1004 = 'Fanvil X210 V2 (Giga, PoE, com fonte) — Venda'
  1024 = 'Fanvil X303G (Giga, PoE, com fonte) — Venda'
  1008 = 'Fanvil W710D + W610D (base DECT + telefone IP) — Venda'
  1012 = 'Fanvil W610D (monofone DECT para base W710D) — Venda'
  568 = 'Grandstream GXP1610 — Venda'; 566 = 'Grandstream GXP1610 — Locação 24 meses'
  922 = 'Grandstream GXP1610 — Comodato 36 meses'
  624 = 'Grandstream GRP2602G — Locação 24 meses'
  952 = 'Telefone IP (Fast, PoE)'
  # Headsets
  530 = 'Headset Fanvil HT301 — Venda'; 910 = 'Headset Fanvil HT301 — Locação 12 meses'
  532 = 'Headset Zox DH60 USB — Venda'
  640 = 'Headset Intelbras CHS 40'; 882 = 'Headset Intelbras CHS 55'
  # Conversores
  644 = 'Khomp KAP 204 FXS — Venda'; 656 = 'Khomp KAP 204 FXS — Locação 12 meses'
  652 = 'Khomp KAP 204 FXS — Locação 24 meses'; 648 = 'Khomp KAP 204 FXS — Locação 36 meses'
  680 = 'Khomp KAP 204 FXS (ATA 4 portas FXS)'
  756 = 'Grandstream HT812BR (ATA) — Venda'; 526 = 'Grandstream HT812BR (ATA) — Locação 12 meses'
  528 = 'Grandstream HT812BR (ATA) — Locação 24 meses'
  660 = 'Intelbras ATA 400 (adaptador para telefone analógico) — Venda'
  # Rede
  534 = 'Roteador MikroTik RB3011UiAS-RM — Venda'; 960 = 'Fonte 5V 600 mA'
  # Neo Vox — linha clássica, Full, Smart, POS, 0800, Partner
  70 = 'Neo Vox Nuvem Ilimitado 1 — 12 meses'; 74 = 'Neo Vox Nuvem Ilimitado 2 — 24 meses'; 78 = 'Neo Vox Nuvem Ilimitado 3 — 36 meses'
  82 = 'Neo Vox Nuvem Ilimitado 4 — 12 meses'; 86 = 'Neo Vox Nuvem Ilimitado 5 — 24 meses'; 90 = 'Neo Vox Nuvem Ilimitado 6 — 36 meses'
  688 = 'Neo Vox Full Nuvem Ilimitado 1 — 12 meses'; 692 = 'Neo Vox Full Nuvem Ilimitado 2 — 24 meses'; 696 = 'Neo Vox Full Nuvem Ilimitado 3 — 36 meses'
  700 = 'Neo Vox Full Nuvem Ilimitado 4 — 12 meses'; 704 = 'Neo Vox Full Nuvem Ilimitado 5 — 24 meses'; 708 = 'Neo Vox Full Nuvem Ilimitado 6 — 36 meses'
  712 = 'Neo Vox Smart Nuvem Ilimitado 1 — 12 meses'; 716 = 'Neo Vox Smart Nuvem Ilimitado 2 — 24 meses'; 720 = 'Neo Vox Smart Nuvem Ilimitado 3 — 36 meses'
  724 = 'Neo Vox Smart Nuvem Ilimitado 4 — 12 meses'; 728 = 'Neo Vox Smart Nuvem Ilimitado 5 — 24 meses'; 732 = 'Neo Vox Smart Nuvem Ilimitado 6 — 36 meses'
  94 = 'Neo Vox Full Nuvem POS 1 — 12 meses'; 98 = 'Neo Vox Full Nuvem POS 2 — 24 meses'; 102 = 'Neo Vox Full Nuvem POS 3 — 36 meses'
  770 = 'Neo Vox Flex Nuvem Ilimitado 3'
  138 = 'Neo Vox 0800 Tarifado — 12 meses'; 412 = 'Neo Vox 0800 Tarifado — 24 meses'; 416 = 'Neo Vox 0800 Tarifado — 36 meses'
  312 = 'Neo Vox Nuvem Ilimitado 1 Partner — 12 meses'; 328 = 'Neo Vox Nuvem Ilimitado 2 Partner — 24 meses'; 336 = 'Neo Vox Nuvem Ilimitado 3 Partner — 36 meses'
  344 = 'Neo Vox Nuvem Ilimitado 4 Partner — 12 meses'; 352 = 'Neo Vox Nuvem Ilimitado 5 Partner — 24 meses'; 360 = 'Neo Vox Nuvem Ilimitado 6 Partner — 36 meses'
  364 = 'Neo Vox Full Nuvem POS Partner 1 — 12 meses'; 368 = 'Neo Vox Full Nuvem POS Partner 2 — 24 meses'; 372 = 'Neo Vox Full Nuvem POS Partner 3 — 36 meses'
  636 = 'Neo Vox Nuvem 0800 Tarifado Partner — 36 meses'
  # Neo Phone
  766 = 'Neo Phone Licença Basic — 36 meses'
  914 = 'Neo Phone Licença Standard — 12 meses'; 918 = 'Neo Phone Licença Standard — 24 meses'; 748 = 'Neo Phone Licença Standard — 36 meses'
  816 = 'Neo Phone Licença Essentials — 12 meses'; 752 = 'Neo Phone Licença Essentials — 24 meses'; 820 = 'Neo Phone Licença Essentials — 36 meses'
  898 = 'Neo Phone Licença Essentials Cond — 12 meses'; 902 = 'Neo Phone Licença Essentials Cond — 24 meses'; 906 = 'Neo Phone Licença Essentials Cond — 36 meses'
  1108 = 'Neo Phone Talk — Licença Basic'
  1016 = 'Neo Phone Servidor on-premises Medium — Locação'
  166 = 'Gravação de Chamadas — 1 ano'; 320 = 'Gravação de Chamadas — 2 anos'; 324 = 'Gravação de Chamadas — 5 anos'
  452 = 'Backup Redundância em Nuvem — 36 meses'
  # Parceiro EMI / UnVoIP
  862 = 'UnVoIP Full Nuvem Ilimitado 1'; 858 = 'UnVoIP Full Nuvem Ilimitado 3'
  476 = 'UnVoIP Talk PRO 1 (4CS-12R) — 12 meses'
  538 = 'UnVoIP Talk PRO 1 (4CS-12R) — Locação 1 ano'; 540 = 'UnVoIP Talk PRO 2 (8CS-24R) — Locação 1 ano'
  542 = 'UnVoIP Talk PRO 3 (16CS-48R) — Locação 1 ano'; 544 = 'UnVoIP Talk PRO 4 (24CS-72R) — Locação 1 ano'
  546 = 'UnVoIP Talk PRO 5 (32CS-96R) — Locação 1 ano'; 548 = 'UnVoIP Talk PRO 6 (48CS-144R) — Locação 1 ano'
  550 = 'UnVoIP Talk Enterprise 1 (4CS-12R) — Locação 1 ano'; 552 = 'UnVoIP Talk Enterprise 2 (8CS-24R) — Locação 1 ano'
  554 = 'UnVoIP Talk Enterprise 3 (16CS-48R) — Locação 1 ano'; 556 = 'UnVoIP Talk Enterprise 4 (24CS-72R) — Locação 1 ano'
  558 = 'UnVoIP Talk Enterprise 5 (32CS-96R) — Locação 1 ano'; 560 = 'UnVoIP Talk Enterprise 6 (48CS-144R) — Locação 1 ano'
  562 = 'UnVoIP Talk PRO Ramal (gravação 90 dias inclusa) — Locação 12 meses'
}

# ── Itens a desativar (decisões do usuário) ─────────────────────────────────────
$desativar = @{
  572 = 'Portabilidade duplicada (fica a 130)'; 536 = 'Portabilidade duplicada (fica a 130)'
  522 = 'Fanvil X7 V2 Venda duplicado (fica o 524, R$ 1.674,97)'
  564 = 'GXP1610 Venda duplicado (fica o 568, R$ 345,97)'; 472 = 'GXP1610 Venda duplicado (fica o 568, R$ 345,97)'
  590 = 'GPX 1630 fora de linha'; 592 = 'GPX 1630 fora de linha'; 594 = 'GPX 1630 fora de linha'
  596 = 'GPX 1630 fora de linha'; 598 = 'GPX 1630 fora de linha'
  886 = 'Instalação remota duplicada (fica a 420)'; 582 = 'Instalação remota duplicada (fica a 420)'
  578 = 'Taxa de inst — nunca usada'; 846 = 'Headset HT301 duplicado, nunca usado'; 460 = 'Neo Talk PRO 1 — nunca usado'
}

# ── Unidade de medida: Unidade para venda/taxas/serviços únicos; Mês para o resto ─
$unidade = @(494, 498, 496, 600, 602, 518, 524, 520, 1004, 1024, 1008, 1012, 568, 922, 952, 574,
  530, 532, 640, 882, 644, 680, 756, 660, 744, 534, 960, 1056,
  890, 1036, 628, 620, 448, 424, 420, 130,
  616, 668, 676, 740, 988, 992, 1000, 866, 464, 1028, 1100)

$ops = New-Object System.Collections.ArrayList
$review = New-Object System.Collections.ArrayList
foreach ($k in ($items.Keys | Sort-Object { [int]$_ })) {
  $p = $items[$k]; $id = [int]$k
  if ($desativar.ContainsKey($id)) {
    if ($p.active -ne 'N') { [void]$ops.Add([ordered]@{ fase = 'D'; op = 'product.update'; id = $id; tipo = $p.type; fields = [ordered]@{ active = 'N' } }) }
    [void]$review.Add([pscustomobject]@{ id = $id; antes = $p.name; depois = '(desativar)'; obs = $desativar[$id] })
    continue
  }
  $f = [ordered]@{}
  $old = [string]$p.name
  $new = if ($nomes.ContainsKey($id)) { $nomes[$id] } else { ($old -replace '\s+', ' ').Trim() }
  if ($new -cne $old) { $f.name = $new }   # -cne: diferença só de maiúsculas também conta
  # Texto contratual longo que saiu do nome vai para a descrição, se ela estiver vazia
  if ($nomes.ContainsKey($id) -and $old.Length -gt 45 -and -not ([string]$p.detailText).Trim()) { $f.detailText = $old.Trim(); $f.detailTextType = 'text' }
  $m = if ($unidade -contains $id) { $UN } else { $MES }
  if ("$($p.measure)" -ne "$m") { $f.measure = $m }
  if ($f.Count) {
    [void]$ops.Add([ordered]@{ fase = 'C'; op = 'product.update'; id = $id; tipo = $p.type; fields = $f })
    if ($f.name) { [void]$review.Add([pscustomobject]@{ id = $id; antes = $old; depois = $new; obs = '' }) }
  }
}
# Pastas vazias — excluídas por último (o aplicador confere que estão vazias antes)
foreach ($sid in 60, 72, 78, 54) { [void]$ops.Add([ordered]@{ fase = 'D'; op = 'section.delete'; id = $sid }) }

$plan = [ordered]@{ geradoEm = (Get-Date).ToString('s'); descricao = 'Fases C e D — nomes, medidas, desativações, exclusão de pastas vazias'; ops = $ops }
[IO.File]::WriteAllText((Join-Path $dataDir 'plano-cd.json'), ($plan | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding $false))

# Lista de revisão legível
$sec = @{}; foreach ($x in $s.sections) { $sec["$($x.id)"] = $x.name }
$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine('# Revisão das fases C e D')
[void]$md.AppendLine('')
[void]$md.AppendLine("Gerado em $((Get-Date).ToString('yyyy-MM-dd HH:mm')) a partir do snapshot atual. Nada foi aplicado ainda.")
[void]$md.AppendLine('')
$c = @($ops | Where-Object fase -eq 'C'); $d = @($ops | Where-Object { $_.fase -eq 'D' -and $_.op -eq 'product.update' })
[void]$md.AppendLine("- **$($c.Count)** itens atualizados na fase C ($(@($c | Where-Object { $_.fields.name }).Count) renomeados, $(@($c | Where-Object { $_.fields.measure }).Count) com unidade de medida ajustada, $(@($c | Where-Object { $_.fields.detailText }).Count) com o nome antigo movido para a descrição)")
[void]$md.AppendLine("- **$($d.Count)** itens desativados na fase D, mais 4 pastas vazias excluídas: Telefone (60), Portabilidade (72), Ramal (78) e Neo VoIP (54, com Neo Talks e Revenda - Waldey Junior)")
[void]$md.AppendLine('- Unidade de medida: **Unidade** para venda de equipamento, taxas, instalação e ativação; **Mês** para planos, licenças, locação e pacotes')
[void]$md.AppendLine('')
[void]$md.AppendLine('| ID | Pasta | Nome atual | Nome novo |')
[void]$md.AppendLine('|---|---|---|---|')
foreach ($r in ($review | Sort-Object { $sec["$($items["$($_.id)"].iblockSectionId)"] }, depois)) {
  $pasta = $sec["$($items["$($r.id)"].iblockSectionId)"]
  $dep = if ($r.obs) { "_(desativar — $($r.obs))_" } else { $r.depois }
  [void]$md.AppendLine("| $($r.id) | $pasta | $(($r.antes -replace '\|', '/').Trim()) | $dep |")
}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot '..\docs\revisao-fase-cd.md'), $md.ToString(), (New-Object Text.UTF8Encoding $false))
"Plano: $($ops.Count) operações (C: $($c.Count), D: $($d.Count) desativações + 4 pastas)"
