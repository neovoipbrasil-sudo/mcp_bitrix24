# Gera o plano das fases A (estrutura de pastas) e B (mover itens) da reorganização
# descrita em catalogo/docs/diagnostico-e-proposta.md. Não altera nada: só escreve data/plano-ab.json.
#
# Referências a pastas novas usam "@chave" (resolvidas na hora de aplicar).

$ErrorActionPreference = 'Stop'
$IB = 14
$ops = New-Object System.Collections.ArrayList
function Sec-New($key, $name, $parent, $sort) { [void]$ops.Add([ordered]@{ fase = 'A'; op = 'section.create'; key = $key; fields = [ordered]@{ iblockId = $IB; name = $name; iblockSectionId = $parent; sort = $sort; active = 'Y' } }) }
function Sec-Upd($id, $name, $parent, $sort, $active = 'Y') { [void]$ops.Add([ordered]@{ fase = 'A'; op = 'section.update'; id = $id; fields = [ordered]@{ iblockId = $IB; name = $name; iblockSectionId = $parent; sort = $sort; active = $active } }) }
function Mover($section, [int[]]$ids) { foreach ($i in $ids) { [void]$ops.Add([ordered]@{ fase = 'B'; op = 'product.move'; id = $i; section = $section }) } }

# ── Fase A: pastas ──────────────────────────────────────────────────────────────
# 1. Telefonia Fixa · Neo Vox
Sec-Upd 12 'Telefonia Fixa · Neo Vox' $null 100
Sec-Upd 80 'Full Nuvem Ilimitado' 12 110
Sec-Upd 82 'Smart Nuvem Ilimitado' 12 120
Sec-New 'classica' 'Nuvem Ilimitado (linha clássica)' 12 130
Sec-Upd 84 'Pós-pago (POS / Flex)' 12 140
Sec-New 'pre' 'Pré-pago' 12 150
Sec-New '0800' '0800' 12 160
Sec-Upd 8 'Revenda (Partner)' 12 170
# 2. PABX em Nuvem · Neo Phone
Sec-Upd 10 'PABX em Nuvem · Neo Phone' $null 200
Sec-New 'np-lic' 'Licenças' 10 210
Sec-New 'np-rec' 'Recursos adicionais' 10 220
# 3. Atendimento Digital
Sec-Upd 52 'Atendimento Digital · MSN Talk / Neo Chat' $null 300
Sec-New 'ad-lic' 'Licenças e planos' 52 310
Sec-New 'ad-pac' 'Pacotes e adicionais' 52 320
Sec-New 'ad-imp' 'Implantação e suporte' 52 330
# 4. Internet
Sec-Upd 16 'Internet · Links' $null 400
# 5. Telefonia Móvel
Sec-Upd 116 'Telefonia Móvel · Neo Vox Mobile' $null 500
# 6. Equipamentos
Sec-New 'equip' 'Equipamentos' $null 600
Sec-Upd 64 'Telefones IP' '@equip' 610
Sec-Upd 68 'Headsets e Áudio' '@equip' 620
Sec-Upd 66 'Conversores e ATAs' '@equip' 630
Sec-Upd 70 'Rede e Acessórios' '@equip' 640
# 7. Serviços
Sec-Upd 14 'Serviços · Instalação, Ativação e Portabilidade' $null 700
# 8. Parceiro EMI Telecom
Sec-Upd 56 'Parceiro EMI Telecom · UnVoIP' $null 800
Sec-Upd 38 'UnVoIP SIP' 56 810
Sec-Upd 40 'UnVoIP ME' 56 820
Sec-Upd 74 'Licença PRO' 56 830
Sec-Upd 76 'Licença Enterprise' 56 840
Sec-Upd 62 'Ramais' 56 850

# ── Fase B: itens ───────────────────────────────────────────────────────────────
Mover '@classica' 70, 74, 78, 82, 86, 90
Mover 8 312, 328, 336, 344, 352, 360, 364, 368, 372, 636, 1032
Mover 84 94, 98, 102, 824
Mover '@pre' 266, 270, 274, 278, 282, 286
Mover '@0800' 138, 412, 416, 740
Mover 38 862, 858

Mover '@np-lic' 766, 752, 902, 748, 918, 914, 816, 820, 898, 906, 1104, 1108
Mover '@np-rec' 1016, 166, 320, 324, 174, 178, 452

Mover '@ad-lic' 996, 980, 874, 948, 828, 1048, 964, 772, 736, 456
Mover '@ad-pac' 836, 854, 850, 832, 968, 894, 1020, 984, 878, 972, 956, 976
Mover '@ad-imp' 870, 840, 866, 464, 776, 780, 468, 988, 992, 1000, 1028

Mover 16 664, 672, 1040, 1044, 616, 668, 676

Mover 64 472, 952, 574
Mover 68 640, 882, 910, 846
Mover 66 660, 744, 644, 648, 652, 656
Mover 70 960

Mover 14 890, 1036, 886, 628, 578, 582, 620, 572, 536

Mover 74 476, 460
Mover 62 562

$plan = [ordered]@{ geradoEm = (Get-Date).ToString('s'); descricao = 'Fases A e B — estrutura de pastas e mover itens'; ops = $ops }
$file = Join-Path $PSScriptRoot '..\data\plano-ab.json'
[IO.File]::WriteAllText($file, ($plan | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding $false))
"Plano com $($ops.Count) operações salvo em $file"
