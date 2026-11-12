# Terceira redução de memória — 12/11/2026

O índice de diagnóstico agora também mantém as origens compactadas. A economia antes/depois foi de **7,2–11,1 MiB de RSS total**, com as mesmas regras, listas e funções. A vantagem de CPU e load sobre o uBO permaneceu nesta fixture.

[CI da comparação](https://github.com/linuxhell/mblock/actions/runs/43256310144) · [CI de integração](https://github.com/linuxhell/mblock/actions/runs/43256310234) · [Amostras diretas](benchmarks/2026-11-12-memory-third-forward.json) · [Amostras inversas](benchmarks/2026-11-12-memory-third-reverse.json)

## Resultado

Anterior: `67a00f87782fd21ef41eee8bf03e173e1f2424ec`. Novo: `47643533cb2b26a2c5f09bb7866bf149f843c422`. Referência: uBO 1.76.0 oficial. Chromium 134.0.6998.35, mesmo runner Linux, perfis novos, aquecimento e sete navegações por cenário em cada ordem. Os builds mBlock usam exatamente as mesmas listas; as listas padrão do uBO diferem.

As faixas abaixo são as duas medianas observadas, não intervalos de confiança.

| Medida | mBlock anterior | mBlock novo | uBlock Origin |
| --- | ---: | ---: | ---: |
| RSS total do navegador | 1.047,9–1.051,3 MiB | 1.040,2–1.040,7 MiB | 1.037,8–1.040,9 MiB |
| CPU por navegação | 100 ms | 90–100 ms | 270 ms |
| Load da página | 30,7–31,5 ms | 31,1–35,0 ms | 42,7–44,5 ms |
| Scripts publicitários bloqueados | 60/60 | 60/60 | 60/60 |
| Script essencial executou | Sim | Sim | Sim |

O ganho de RAM atribuível à alteração é a comparação antes/depois do próprio mBlock: 7,2 MiB na ordem direta e 11,1 MiB na inversa. O heap JavaScript do worker diminuiu 21,3–21,5%.

Nesta rodada, a diferença de RSS novo mBlock menos uBO foi de **+2,9 MiB** na ordem direta e **−0,7 MiB** na inversa: um empate aproximado nessa execução. Isso não demonstra que os 40–44 MiB extras da rodada anterior foram eliminados permanentemente. O próprio uBO variou entre execuções e pode atualizar listas em segundo plano. Não atribuir toda a aproximação ao código novo.

O novo load foi um pouco maior que o build anterior em uma rodada, embora continuasse menor que o uBO nas duas. A inicialização mais aquecimento ficou em 4,38–4,48 s no novo e 4,42–4,43 s no anterior. São medições da preparação da fixture, não uma garantia sobre qualquer inicialização real.

## Implementação

Antes, o snapshot já usava tuplas e dicionários para representar as origens dos filtros, mas o índice de diagnóstico reconstruía e salvava novamente todas as origens expandidas. Agora o índice salva a tupla compacta junto da regra e mantém um único dicionário no banco. O texto original é reconstruído apenas ao consultar a regra.

A regra e o dicionário são lidos na mesma transação para não misturar gerações durante uma atualização. Registros antigos que já contêm origens expandidas continuam legíveis. Controles locais conservam sua explicação anterior. O formato público da consulta e do diagnóstico exportado não muda.

## Validação

Passaram 49 testes Node, 3 testes Python e 36 verificações reais de navegador, três builds, linter Firefox e empacotamento. A nova integração verifica que o índice está compacto e que a consulta devolve origens originais legíveis. Migração, recuperação, rollback, seletor e YouTube continuam cobertos.

A checagem diferencial completa antes do benchmark confirmou 19.499 regras compiladas de rede, 29.127 filtros cosméticos e 116.390 origens preservados. Não foram removidos filtros, diagnóstico ou listas para obter o ganho.

## Limites

A fixture é uma página local simples. RSS inclui processos e reservas do navegador e pode contar memória compartilhada mais de uma vez; não é memória exclusiva da extensão. Não foi forçada coleta de lixo. A ordem foi invertida, mas duas rodadas não substituem estudo estatístico, sites reais e testes em Firefox. O Chromium histórico permite MV2/MV3 no mesmo laboratório e não é indicado para navegação diária. Veja [VALIDATION.md](VALIDATION.md).
