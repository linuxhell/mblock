# Validação e comparação de desempenho

## Escopo

A remoção do rótulo alfa em 0.3.0 não demonstra superioridade geral ao uBlock Origin. Os logs e resultados de cada commit ficam em Actions. A auditoria está em [AUDIT-0.3.0.md](AUDIT-0.3.0.md).

## Verificações

- `npm test`: testes de parser, escopo, prioridades, quotas, includes, privacidade, traduções, importação e agendamento.
- `python3 -m unittest discover -s tests -p '*_test.py'`: política dos assets e rejeição de XPI incorreto.
- `npm run build`: Chrome, Edge e Firefox, com estatísticas e proveniência do perfil YouTube.
- `node scripts/lint-firefox.mjs`: erros e avisos inesperados do linter causam falha.
- `node scripts/verify-cosmetic-index.mjs dist/chrome`: compara o índice de CSS compacto em todos os domínios das listas, com e sem CSS genérico, e confirma que os buckets globais permanecem idênticos.
- `npm run test:browser`: Chromium real, regras de rede/CSS, migração, falha de atualização, rollback, importação, diagnóstico, YouTube, seletor interativo, token inválido e gravações concorrentes.

O host local desta auditoria bloqueia IPC de navegador (`socket(): Operation not permitted`), antes de carregar a extensão. Isso não é resultado de performance nem falha de bloqueio. A integração e o benchmark são executados no runner do GitHub, sem tentar contornar essa restrição.

## Benchmark

```sh
MBLOCK_BROWSER_PATH=/caminho/chromium npm run benchmark
MBLOCK_BROWSER_PATH=/caminho/chromium-compativel-mv2 MBLOCK_BASELINE=/caminho/uBlock0.chromium MBLOCK_BENCH_RUNS=7 npm run benchmark
```

O workflow **Controlled comparison with uBlock Origin** baixa o pacote oficial uBO 1.76.0, confere SHA-256 e usa Chromium 134 para ambos os bloqueadores. Esse navegador histórico é somente uma ferramenta de laboratório, não uma recomendação para navegação. Os testes correntes de integração usam o Chromium do Playwright atual.

O workflow executa a página simples e uma variante com 24 frames da mesma origem, em duas ordens. Todos os scripts essenciais dos frames devem executar. A página local contém conteúdo essencial e 60 scripts de um domínio de publicidade conhecido, servido por fixture local. Há aquecimento e 3–20 navegações por cenário. O teste recusa prosseguir se o bloqueador não estiver carregado e não confirmar bloqueio efetivo. Verifica a execução do script essencial em todas as amostras.

`MBLOCK_BENCH_FRAMES=24` habilita os frames. `MBLOCK_MAINTENANCE_RUNS=3` mede separadamente três pares de pausa/retomada global usando o mesmo painel, apenas nos builds mBlock anterior/novo. Cada par deve terminar com a proteção ativa; uma navegação adicional confirma o bloqueio. CPU, duração e RSS após a operação ficam em `maintenance`; essas medidas não são CPU por navegação nem uma comparação de controles com uBO.

`test-results/benchmark.json` contém versão, ambiente, amostras, mediana do tempo de navegação/idle, CPU dos processos do navegador, RSS em Linux, tempo load e número de requests que chegaram ao servidor. `comparisonToUBlockOriginComplete` só é verdadeiro para uma referência carregada com nome exato uBlock Origin e Manifest V2; mesmo assim significa conclusão desta fixture, não comparação geral completa.

### Limites de interpretação

- As listas padrão diferem e o CSS genérico começa desativado no mBlock. Não declarar eficácia equivalente a partir dos tempos.
- Ordem dos cenários é sequencial; atualizações de fundo e variação da máquina podem influenciar CPU/RAM.
- RSS soma processos do navegador, não memória exclusiva da extensão, e páginas compartilhadas podem ser contadas mais de uma vez.
- `networkidle` inclui espera fixa do Playwright; avaliar também load e CPU.
- A fixture cobre um padrão de anúncios simples. Não mede anti-adblock, anúncios first-party, todos os sites, consumo de bateria ou Firefox.
- Não comparar mBlock ativo com um uBO MV2 desativado por Chromium moderno.

Para alegar superioridade, ampliar corpus e navegadores, verificar conteúdo/quebras e privacidade, alternar a ordem e apresentar dispersão e diferenças de listas. Os resultados atuais devem ser descritos apenas no escopo medido.

## Comparação de memória antes/depois

O workflow compila o commit `3d7d8874c152720a72ad224ecd29b86c49899e5b` com exatamente a mesma cópia das listas do build novo. `MBLOCK_PREVIOUS` aponta para esse pacote; `MBLOCK_BENCH_REVERSE=1` inverte a ordem. Os hashes e estatísticas dos dois builds mBlock devem coincidir. Antes de medir, `scripts/verify-equivalence.mjs` compara todas as regras, cosméticos, exceções, estatísticas, relatórios, textos e origens, reconstruindo a proveniência compactada.

Os relatórios incluem consumo por processo e heap das extensões, sem GC forçado. O processo completo do navegador, incluindo painel quando a operação exige, participa das medidas de CPU/RSS. As amostras de navegação e heap são tomadas antes das alterações de configuração. O RSS posterior à manutenção inclui reservas do alocador e o painel; não é memória exclusiva ou permanentemente retida da extensão.

A rodada atual está em [PERFORMANCE-2026-11-12.md](PERFORMANCE-2026-11-12.md). As etapas anteriores usaram referências diferentes: [primeira](MEMORY-2026-11-12.md), [segunda](MEMORY-SECOND-2026-11-12.md) e [terceira](MEMORY-THIRD-2026-11-12.md). Esses resultados históricos não devem ser somados ou comparados como se fossem amostras da mesma máquina/execução. A aproximação ao uBO numa rodada não garante paridade em outros cenários nem permite atribuir variações do próprio uBO à otimização.
