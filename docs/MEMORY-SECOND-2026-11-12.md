# Segunda redução de memória — 12/11/2026

Continuação: [terceira etapa, com mais 7–11 MiB de economia](MEMORY-THIRD-2026-11-12.md). Os dados abaixo correspondem à segunda etapa.

A nova etapa retirou **54,4–54,6 MiB** de RSS total em relação ao build que ainda apresentava aproximadamente 90 MiB extras. A diferença para o uBlock Origin ficou em **39,5–44,4 MiB** nesta execução, mantendo menor CPU e tempo de carregamento. A diferença não foi zerada.

[CI da comparação](https://github.com/linuxhell/mblock/actions/runs/43247823270) · [CI de integração](https://github.com/linuxhell/mblock/actions/runs/43247822971) · [Amostras diretas](benchmarks/2026-11-12-memory-second-forward.json) · [Amostras inversas](benchmarks/2026-11-12-memory-second-reverse.json)

## Medição

Anterior: `525d676c969cbb5d30a740a1f2012982fce2d40c`. Novo: `f759533c0cf014cca95a9b11df3cd425ec93c676`. Referência: uBlock Origin 1.76.0 oficial. Todos no Chromium 134.0.6998.35, no mesmo runner, com perfis novos. Duas rodadas de sete navegações por cenário; a segunda inverte a ordem. As listas dos dois builds mBlock são cópias idênticas. As listas padrão do uBO diferem.

Os intervalos são as duas medianas observadas, não intervalos de confiança.

| Medida | mBlock anterior | mBlock novo | uBlock Origin |
| --- | ---: | ---: | ---: |
| RSS total do navegador | 1.103,1 MiB | 1.048,5–1.048,7 MiB | 1.004,3–1.008,9 MiB |
| CPU por navegação | 60–70 ms | 60 ms | 110–120 ms |
| Load da página | 18,7–19,3 ms | 18,2–18,6 ms | 28,5–34,7 ms |
| Scripts publicitários bloqueados | 60/60 | 60/60 | 60/60 |
| Script essencial executou | Sim | Sim | Sim |

A economia foi de 4,93–4,95% contra o build anterior. O tempo de inicialização mais aquecimento ficou em 2,54–2,65 s no novo e 2,61–2,74 s no anterior. Esse tempo inclui a preparação do perfil e do teste; não representa todo início de navegador em uso real.

## Alterações mantidas

1. A ativação compara regras individualmente e sai imediatamente quando as quantidades diferem. Não cria dois textos gigantes para comparar os conjuntos completos.
2. A proveniência dos filtros usa dicionários de fontes e sufixos. Em grupos de domínios, reutiliza o hostname já presente na regra nativa. O texto original é reconstruído ao gravar o índice de diagnóstico e continua disponível na explicação da regra. Formatos antigos continuam legíveis.

Na cópia local das listas desta auditoria, os dados de proveniência caíram de 9.975.792 para 2.348.795 bytes, cerca de 76%, sem remover informação. A redução do arquivo não deve ser confundida com igual redução de RAM.

## Preservação de proteção e diagnóstico

Antes do benchmark, `scripts/verify-equivalence.mjs` verifica todos os filtros de rede, cosméticos, exceções, estatísticas, relatórios, textos de entrada e referências de origem contra o build anterior. A cópia local e o CI preservaram 19.499 regras compiladas de rede, 29.127 filtros cosméticos e 116.390 origens. As correções locais continuam cobertas pelos testes de integração.

Passaram 48 testes Node, 3 testes Python e 35 verificações de navegador, além dos builds, linter Firefox e empacotamento.

## Escolha e limites

Um experimento adicional persistia textos em gzip para reduzir o heap. Apesar de diminuir o heap JavaScript, usou mais RSS total do que a implementação acima e foi removido. Não foi usada coleta de lixo forçada para favorecer os números.

RSS soma processos do navegador, pode contar páginas compartilhadas mais de uma vez e não é memória exclusiva da extensão. O teste mede uma página local simples; não garante paridade de memória, superioridade em todos os sites, Firefox ou autonomia de bateria. A vantagem de CPU/tempo se manteve nesta fixture, mas ainda há RAM extra e lacunas de sintaxe de filtros frente ao uBO. O Chromium histórico permite MV2/MV3 no mesmo laboratório e não é recomendação para navegação diária. Veja [VALIDATION.md](VALIDATION.md).
