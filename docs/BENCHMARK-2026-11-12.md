# Resultado controlado — 12/11/2026

[Execução e logs](https://github.com/linuxhell/mblock/actions/runs/43232983777) · [Dados brutos](benchmarks/2026-11-12.json)

mBlock 0.3.0 no commit `9f56a38b2fb7f165f60142404bbf7363149d36d2` e uBlock Origin 1.76.0, ambos no Chromium 134.0.6998.35, em perfis novos. Sete navegações após aquecimento por cenário, na mesma máquina Linux AMD EPYC 9V74 (4 CPUs lógicas). A configuração é padrão de cada extensão; listas e CSS genérico não são equivalentes. O mBlock teve autoatualização desligada após a inicialização.

| Mediana | mBlock | uBlock Origin |
| --- | ---: | ---: |
| Load da página | 26.0 ms | 47.7 ms |
| Navegação + espera de idle | 529.33 ms | 549.82 ms |
| CPU somada dos processos | 90 ms | 230 ms |
| RSS somada do navegador | 1185.8 MiB | 1047.3 MiB |
| Scripts de anúncio bloqueados | 60/60 | 60/60 |
| Script essencial executou | Sim, em todas as amostras | Sim, em todas as amostras |

Nesta fixture, o mBlock teve menor tempo de carregamento e menor CPU, mas maior RSS. Isso é um ganho específico acompanhado de uma desvantagem de memória; não prova superioridade geral ou equivalência de proteção. O RSS inclui processos, reservas e páginas compartilhadas do navegador; não é memória exclusiva da extensão.

O resultado corresponde ao conjunto padrão completo de bootstrap antes da divisão dos arquivos exigida pelo linter Mozilla. Essa divisão preserva as regras; os resultados devem sempre ser vinculados ao commit medido. Verificações posteriores ficam em Actions.

A página local só mede 60 scripts num domínio conhecido e conteúdo essencial simples. Não cobre anúncios first-party, eficácia das quase 20 mil regras não suportadas, anti-adblock, navegação real ou Firefox. A execução é sequencial e pode ter ruído/atualizações de fundo; não houve randomização nem estudo estatístico. O Chromium histórico serve para permitir MV2/MV3 no mesmo laboratório, não para navegação diária. Consulte [VALIDATION.md](VALIDATION.md) antes de generalizar.

A prioridade para superar o uBO de forma mais ampla é reduzir o custo de memória e ampliar a cobertura sem aumentar falsos positivos. O seletor de elementos e a atualização automática também existem no uBO; não são diferenciais exclusivos.
