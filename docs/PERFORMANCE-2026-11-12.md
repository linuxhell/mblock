# RAM e CPU: controles leves e cache CSS — 12/11/2026

A principal economia desta etapa está nas alterações de configuração: **90,5–90,9% menos CPU**, operação **81,3–81,5% mais rápida** e **229–251 MiB menos RSS após um par de pausa/retomada**, comparando com o próprio mBlock anterior. Na navegação, a redução de RAM foi pequena e a CPU não melhorou consistentemente contra esse build. O mBlock continuou usando menos CPU que o uBO nas duas fixtures, sem demonstrar superioridade geral.

[CI da comparação](https://github.com/linuxhell/mblock/actions/runs/43261969701) · [CI de integração](https://github.com/linuxhell/mblock/actions/runs/43261990163)

## Método

Anterior: `3d7d8874c152720a72ad224ecd29b86c49899e5b`. Novo: `c4f7565377539b12a1553bee580b01278bef1b88`. Referência: uBO 1.76.0 oficial, com SHA-256 verificado. Chromium 134.0.6998.35 comum aos motores MV2/MV3; runner Linux AMD EPYC 9V45, quatro CPUs lógicas. Perfis novos, aquecimento, sete navegações por extensão/cenário e repetição em ordem inversa. Os dois builds mBlock usam as mesmas listas e hashes, com atualização automática desligada após inicialização. As listas padrão do uBO diferem e podem receber atualizações em segundo plano.

A página simples contém 60 scripts publicitários e um script essencial. A variante acrescenta 24 frames da mesma origem, cada um com script essencial. Todos os bloqueadores ficaram ativos, bloquearam 60/60 scripts e preservaram os scripts essenciais em todas as amostras. Não foi forçado GC.

Os pares de pausa/retomada são medidos separadamente, depois das navegações e sondagens de heap, usando o mesmo painel. Há três pares por build mBlock em cada ordem. O teste confirma proteção reativada e bloqueio numa nova navegação. Não há comparação dessa operação com os controles do uBO.

## Alterações de configuração

Medianas; CPU soma o tempo dos processos do navegador, podendo exceder o tempo de parede em máquina com vários núcleos. RSS soma os processos, incluindo o painel aberto e reservas do alocador. Não é memória exclusiva da extensão, uma medição de pico ou prova de vazamento permanente.

| Medida por par de pausa/retomada | Anterior, direta | Novo, direta | Anterior, inversa | Novo, inversa |
| --- | ---: | ---: | ---: | ---: |
| CPU | 5.450 ms | 520 ms | 5.830 ms | 530 ms |
| Duração | 3.112 ms | 575 ms | 3.188 ms | 596 ms |
| RSS após a operação | 1.298,4 MiB | 1.069,2 MiB | 1.325,2 MiB | 1.074,6 MiB |

A economia de RSS após a operação foi 229,2 MiB na ordem direta e 250,6 MiB na inversa. Não confundir esse ganho com o consumo da navegação normal: o caminho antigo recarregava grandes estruturas e regravava índices ao alterar controles locais.

## Navegação

Cada célula mostra **direta / inversa**, não um intervalo estatístico. CPU e load em milissegundos; RSS em MiB. O tempo de `networkidle` também está nos dados brutos, mas inclui espera fixa do Playwright.

| Página simples | mBlock anterior | mBlock novo | uBO |
| --- | ---: | ---: | ---: |
| CPU | 60 / 50 | 60 / 60 | 100 / 140 |
| Load | 18,5 / 19,0 | 20,1 / 17,3 | 22,7 / 27,4 |
| RSS | 1.047,6 / 1.040,9 | 1.041,9 / 1.041,0 | 1.006,4 / 1.026,9 |

O novo mBlock economizou 5,7 MiB numa ordem e usou 0,1 MiB a mais na outra. Ficou **14,1–35,4 MiB acima do uBO** nesta página. A CPU foi 40–57% menor que uBO, mas não houve melhoria consistente contra o mBlock anterior; uma mediana subiu de 50 para 60 ms. Load também variou entre antes/depois.

| Página com 24 frames | mBlock anterior | mBlock novo | uBO |
| --- | ---: | ---: | ---: |
| CPU | 450 / 460 | 460 / 470 | 890 / 980 |
| Load | 170,6 / 166,7 | 170,1 / 170,5 | 265,9 / 270,1 |
| RSS | 1.182,3 / 1.184,1 | 1.181,2 / 1.182,6 | 1.300,4 / 1.303,4 |

Nesta variante, o novo mBlock usou **48–52% menos CPU e 119–121 MiB menos RSS que o uBO**. Contra o próprio build anterior, economizou apenas 1,1–1,5 MiB; a CPU subiu 10 ms nas duas ordens. Portanto, a vantagem frente ao uBO já existia em grande parte, e não deve ser atribuída integralmente às mudanças desta etapa.

O empate aproximado de RAM com uBO observado na terceira etapa não se repetiu na página simples. Runner, alocações, atualização de listas e atividade de fundo variam. Não somar economias ou deduzir ganho a partir da variação do uBO entre execuções.

## Implementação

- Controles globais, políticas por site e preferências CSS leem apenas o envelope da configuração. Mantêm os dados imutáveis das listas e atualizam somente a pequena cauda de regras locais. Não carregam nem regravam todas as regras de rede ou o índice cosmético.
- A intenção persistente e o commit atômico preservam recuperação e rollback. Um identificador de transação impede que recuperar uma operação já concluída substitua o snapshot anterior por ele mesmo. Datas de configuração são monotônicas, inclusive em mudanças rápidas e ajuste do relógio.
- Falha no espelho opcional de preferências não desfaz um commit válido nem deixa a configuração em memória divergente das regras aplicadas. O banco permanece a referência; a falha fica registrada.
- CSS calculado é reutilizado por host e modo genérico. O cache tem 64 entradas e orçamento contábil de 512 KiB para texto/chaves, com estimativa de overhead por entrada; isso não é um limite exato da RAM do motor JavaScript. Até 32 consultas em andamento são compartilhadas. Uma geração impede reutilização de resultados invalidados por mudanças de regras/políticas. Leituras de CSS e exceções usam uma única transação consistente.
- Frames evitam uma consulta extra à aba quando o contexto do remetente já informa o host. A aplicação de CSS continua separada por documento/frame e respeita pausa da página superior.
- O índice cosmético guarda somente o domínio correspondente a cada bucket, preservando os filtros originais completos no snapshot. O tamanho UTF-8 serializado desse índice cai de **9.733.136 para 4.768.066 bytes, cerca de 51%**. Isso mede representação do índice, não RSS nem tamanho exato do banco em disco. Índices antigos continuam legíveis; reconstruções passam a usar a representação menor.

## Verificação e limites

Passaram **56 testes Node, três Python, 39 verificações no Chromium atual**, builds Chrome/Edge/Firefox, linter Firefox e empacotamento. Os testes novos cobrem cache aquecido, invalidação após excluir um filtro, limites/coalescência, substituição apenas de regras locais, rejeição nativa e falha do espelho de configurações. Migração, recuperação, rollback, importação, seletor, YouTube e diagnóstico permanecem cobertos.

A comparação completa preservou **19.499 regras de rede compiladas, 29.127 filtros cosméticos e 116.390 referências de origem**. O teste adicional do índice realizou 44.178 comparações em 22.089 hosts, com/sem CSS genérico, e verificou buckets globais idênticos. Nenhuma lista, regra ou recurso foi removido para economizar RAM/CPU.

As fixtures são locais e sintéticas. As listas e capacidades de filtragem diferem do uBO; aproximadamente 20 mil filtros das fontes ainda são incompatíveis com o compilador. RSS pode contar páginas compartilhadas várias vezes. Os resultados não medem bateria, todos os sites, Firefox ou RAM exclusiva da extensão. Não há evidência de que este seja um mínimo absoluto de memória ou de superioridade geral. O Chromium histórico serve ao laboratório; a integração usa a versão atual do Playwright. Veja [VALIDATION.md](VALIDATION.md).

## Dados brutos

- [Página simples, direta](benchmarks/2026-11-12-performance-forward.json)
- [Página simples, inversa](benchmarks/2026-11-12-performance-reverse.json)
- [24 frames, direta](benchmarks/2026-11-12-performance-frames-forward.json)
- [24 frames, inversa](benchmarks/2026-11-12-performance-frames-reverse.json)
