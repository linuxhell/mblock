# Auditoria mBlock 0.3.0 — 12/11/2026

Base auditada: `2a61f02eee7df4bae025dd7a79a888bef20a0f13` (0.2.1). Revisão de código, build de três destinos, testes unitários, linter Firefox e integração/benchmark em CI. Não constitui teste de penetração independente nem certificação de estabilidade em todos os sites.

## Achados corrigidos

| Achado | Efeito | Correção |
| --- | --- | --- |
| Perfis calculados antes de entrar na fila serial | Duas gravações simultâneas podiam sobrescrever o outro site | Ler e mesclar o estado dentro da operação serial |
| Cache CSS usava frameId quando documentId faltava | Nova navegação no mesmo frame podia deixar de receber CSS | Identidade aleatória por documento fornecida pelo content script; sem identidade, não usar cache |
| Consulta de cosméticos antes de checar o cache | Leitura repetida de IndexedDB sem necessidade | Verificar cache primeiro |
| Toda mudança de preferências recompilava as listas | CPU e latência desnecessárias ao pausar ou mudar opções | Recompilar apenas quando listas/regras pessoais mudam; não reindexar cosméticos/regras idênticos |
| Atualizações idênticas recompilavam tudo | Trabalho repetido mesmo com hashes iguais | Comparar hashes por fonte e reutilizar a compilação |
| Alarme fixo criado dois minutos após cada reinício | Download precoce mesmo com listas recentes | Agendar conforme a fonte mais antiga e o intervalo configurado |
| Intervalo do backup era validado, mas não preservado | Nova opção configurável não sobreviveria à importação | Validar e exportar/importar os intervalos aceitos |
| Adição de fontes alterava o objeto de rollback | Snapshot anterior podia ter metadados de fontes novos | Copiar fontes antes de alterar |
| Restauração de scriptlets condicionada à mudança DNR | Falha após modificar scripts poderia deixá-los com outra configuração | Restaurar registro de scripts mesmo quando DNR não muda |
| Domínio simples tratado como substring de URL | Diferença de semântica frente ao uBO, com possíveis falsos positivos | Converter hostname simples em âncora de domínio |
| `denyallow` e `_` recusados | Menor cobertura da sintaxe das listas | Compilar denyallow apenas com contexto positivo e preservar todas as restrições; aceitar placeholders |
| Placeholders em blocos de relatório ignorados pela tradução | Interface misturava idiomas mesmo após escolher inglês/chinês | Traduzir também placeholders estáticos em PRE, mantendo CODE intacto |
| Apenas três regras estáticas de emergência na primeira inicialização | Proteção parcial enquanto o worker e o banco iniciavam | Empacotar o conjunto padrão completo como bootstrap nativo, desativado após ativação dinâmica |
| ZIP de fontes/Firefox sem assinatura no empacotamento | Assets fora da política de distribuição solicitada | Somente Chrome/Edge por padrão; XPI Mozilla da mesma versão para release completa |

## Novos recursos e fronteiras

Seletor visual sob demanda, no mundo isolado, com prévia reversível, Esc, limite de cinco minutos e regra CSS por hostname. Gravação exige capacidade aleatória emitida pelo painel, aba correspondente, frame principal e hostname correspondente. O backend rejeita seletores inválidos e só persiste após validar a sintaxe no documento. O token não é colocado no DOM. A UI fica em Shadow DOM fechado. O seletor não cobre iframes/Shadow DOM e não cria filtros de rede.

Atualização automática já existia. Agora oferece intervalos, preserva idade entre reinícios e elimina recompilação quando hashes não mudam. Reutilizar resultados não remove a validação de HTTPS, includes, tamanho, quotas e transação.

## Pontos mantidos após revisão

- URLs de listas conhecidas, HTTPS, credenciais omitidas, sem redirects, timeout e limites de bytes/includes.
- Modificadores desconhecidos rejeitam o filtro inteiro, sem ampliar silenciosamente seu escopo.
- Regras de rede atualizadas atomicamente; intenção durável e snapshot para recuperação/rollback.
- Código executável empacotado; listas remotas não fornecem JavaScript.
- Diagnóstico limitado, opcional e sem cookies, cabeçalhos, corpos ou valores de query.
- Licença GPLv3 e atribuição ao código uBlock vendorizado mantidas.

## Riscos e lacunas ainda presentes

- Aproximadamente 20 mil filtros incompatíveis nas listas atuais. Scriptlets gerais, filtros procedurais e várias ações avançadas continuam sem suporte. Não ocultar essa lacuna ao comparar eficiência.
- Motor DNR tem quotas e semântica diferentes do uBO completo; não é possível prometer paridade apenas traduzindo mais regras.
- Ausência de testes reais abrangentes em Firefox/Edge, de corpus amplo de sites com falso positivo e de estudo de CPU/RAM com ordem aleatória e listas idênticas.
- O seletor CSS pode deixar de funcionar quando o site muda estrutura. A alteração não impede downloads por si só.
- O diagnóstico detalhado pode incluir informações pessoais nos caminhos. O usuário deve revisar exportações.
- `npm audit --omit=dev`: zero vulnerabilidades na auditoria local. A árvore de ferramentas contém aviso baixo em `deepmerge` 4.3.1 via `addons-linter`/`web-ext`, sem versão corrigida publicada identificada. Não está no instalador. Não foi aplicado o downgrade incompatível sugerido pelo audit.
- A checagem estrutural de XPI no empacotador não é validação criptográfica: usar somente XPI retornado pela Mozilla.

## Evidência coletada

41 testes unitários Node e 3 testes Python passaram localmente e no CI. A integração anterior à divisão do bootstrap completou 34 verificações no Chromium 158, sem erros de console. O [benchmark com uBO](BENCHMARK-2026-11-12.md) confirmou bloqueio de 60/60 scripts e conteúdo essencial em ambos; o mBlock usou menos CPU/tempo e mais RSS nessa fixture. A revisão final deve consultar os checks do commit mais recente.

## Como avaliar a missão de superar o uBO

1. Medir cobertura e quebras com o mesmo corpus de requests e sites, além de listas equivalentes e versões registradas.
2. Expandir cobertura de sintaxe com testes diferenciais antes de anunciar equivalência.
3. Comparar CPU, memória total do navegador, tempo e eficácia no mesmo navegador, alternando ordem e repetindo amostras.
4. Testar reinício, suspensão do worker, interrupção de atualização, rollback e migração em cada navegador real.
5. Publicar ganhos somente para os cenários medidos e manter os casos em que uBO vence.

Referências primárias: [uBO 1.76.0](https://github.com/gorhill/uBlock/releases/tag/1.76.0), [sintaxe](https://github.com/gorhill/uBlock/wiki/Static-filter-syntax), [element picker](https://github.com/gorhill/uBlock/wiki/Element-picker), [atualização](https://github.com/gorhill/uBlock/wiki/Dashboard:-Filter-lists). O seletor e a atualização automática não são novidades em relação ao uBO.

## Atualização de memória

A [medição posterior](MEMORY-2026-11-12.md) compara o mesmo conjunto de listas antes/depois, em duas ordens. O compartilhamento de snapshots, a fila limitada e a gravação compacta das preferências de atualização reduziram RSS total em 6,6–8,0% e heap do worker em 55,4%, mantendo a vantagem de CPU/tempo sobre o uBO nesta fixture. RAM total continua maior que a do uBO. A validação passou a 45 testes Node, 3 Python e 35 verificações de navegador. Snapshots legados e recuperação após interrupção permanecem testados.

## Segunda etapa de memória

Comparação de regras sem serialização integral e proveniência com dicionários retiraram mais 54–55 MiB de RSS contra 525d676. A diferença para uBO ficou em 39,5–44,4 MiB, mantendo menor CPU/load na fixture. Nenhuma regra ou referência foi removida: a checagem diferencial percorre o conjunto completo antes de medir. Validado com 48 testes Node, 3 Python e 35 verificações de navegador. [Dados e limites](MEMORY-SECOND-2026-11-12.md).

## Índice de diagnóstico compacto

A [terceira medição](MEMORY-THIRD-2026-11-12.md) mantém as origens compactadas também no índice de regras e as reconstrói sob demanda, com leitura atômica da regra e de seu dicionário. Economia antes/depois de 7–11 MiB de RSS e 21,3–21,5% do heap do worker. CPU/load seguem menores que uBO na fixture. A RAM ficou próxima do uBO nesta execução; variações do próprio uBO impedem atribuir toda a diferença entre rodadas ao código. Validado por 49 testes Node, 3 Python, 36 verificações de navegador e comparação completa de filtros/origens.

## Controles leves, cache e índice cosmético

A [rodada de RAM/CPU](PERFORMANCE-2026-11-12.md) evita carregar os filtros completos ao alterar controles locais. Mantém intenção persistente, rollback e índice de proveniência; uma falha no espelho de preferências é registrada sem invalidar o commit. Cache CSS por host/modo tem orçamento limitado, coalescência e invalidação por geração. O índice por domínio reduz repetições de includes, preservando os filtros completos no snapshot.

O ganho principal foi em pausa/retomada: 90,5–90,9% menos CPU e 229–251 MiB menos RSS após a operação. Na navegação simples, RAM variou de 5,7 MiB a menos a 0,1 MiB a mais, e permaneceu 14–35 MiB acima do uBO. Em 24 frames, mBlock usou 48–52% menos CPU e 119–121 MiB menos RSS que uBO; a CPU não melhorou consistentemente contra o próprio build anterior. Não generalizar esses resultados.

Validado com 56 testes Node, 3 Python, 39 verificações reais, equivalência de todas as regras/origens e 44.178 comparações do índice cosmético em 22.089 hosts. O novo código é `c4f7565`; CI e dados brutos estão no relatório.
