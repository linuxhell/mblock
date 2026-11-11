# Validação e critérios de evolução

## Estado

Esta alfa não demonstrou ser mais leve, mais completa ou menos detectável que o uBlock Origin. Os resultados de testes automatizados ficam nos artefatos do workflow e não substituem testes no Edge e Firefox reais.

A integração Chromium passou em 11/11/2026, incluindo bloqueio, CSS, pausa, logger, falhas de atualização, rollback, exportação e fixture do carregador FC Portables. O teste identificou e corrigiu uma expressão regular que excedia a memória permitida pela API nativa; as duas expressões menores são verificadas antes de qualquer troca de regras.

O ambiente local de desenvolvimento restringe sockets de IPC do Chromium, então a execução de navegador ocorre em GitHub Actions. Não se deve interpretar uma análise de código ou um teste de expressão regular como confirmação de uma correção no site ao vivo.

## Camadas de teste

1. **Unidade:** semântica do compilador, exceções, limites, domínios, privacidade, includes remotos, assinatura FC Portables e seletores.
2. **Validação Firefox:** `web-ext lint` verifica o pacote e o manifesto. Referências a domínios de mineração nas listas de bloqueio podem gerar `COINMINER_USAGE_DETECTED`; o wrapper mantém esses avisos visíveis e admite somente esse falso positivo em dados JSON. Nenhum outro aviso é dispensado.
3. **Integração Chromium:** instalação real da extensão descompactada; bloqueio de um script com preservação de script essencial; CSS; pausa global e por site; diagnóstico; falha de download; rejeição da API nativa; rollback; exportação e correção do carregador FC Portables em fixture controlada.
4. **Site ao vivo:** pendente de confirmação com navegação real, incluindo páginas internas e alguns minutos de uso. Acesso automatizado pode receber respostas diferentes ou um desafio do Cloudflare.
5. **Firefox e Edge reais:** pendente de execução funcional. Gerar manifestos e passar no linter não comprova equivalência de comportamento.

## Benchmark

`scripts/benchmark.mjs` mede um cenário local repetido. Produz JSON com a configuração, amostras e mediana. CPU é a soma da diferença de `cpuTime` dos processos Chromium informados por CDP. RSS é a soma dos processos capturados no Linux, pode contar páginas compartilhadas mais de uma vez e deve ser interpretado como indicador aproximado. A memória privada real requer ferramentas do navegador/OS em estudo separado. As métricas da página não cobrem sozinhas o custo da extensão.

As versões e as listas efetivas de uma extensão externa devem ser verificadas manualmente; algumas extensões precisam de configuração inicial antes de bloquear. O benchmark mantém os perfis temporários separados e usa uma fixture específica, sem alegar que ela represente o comportamento no FC Portables ou na web.

Não aceitar uma otimização se ela diminuir CPU às custas de perder filtros, permitir rastreamento, quebrar conteúdo essencial ou simplesmente desativar recursos presentes no concorrente. Métricas de bloqueio, detecção, compatibilidade e consumo devem ser consideradas juntas.

## Prioridade das próximas mudanças

- Corrigir e validar regressões do FC Portables em navegação real.
- Fechar lacunas de sintaxe com componentes maduros e licenciados, especialmente scriptlets e correções de compatibilidade; medir seu custo antes de ativá-los amplamente.
- Criar uma matriz de páginas e cenários com resultados do uBlock completo e uBlock Lite.
- Otimizar apenas gargalos medidos, incluindo inicialização e acesso ao índice de CSS.
- Adicionar assinatura, publicação e atualização do código depois de validação dos pacotes.
