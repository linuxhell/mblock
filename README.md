# mBlock

[Português](README.md) · [English](README.en.md) · [简体中文](README.zh-CN.md)

Bloqueador para Chrome, Edge e Firefox, com regras nativas Manifest V3, controle por site e diagnóstico local. Versão **0.3.0**, sem o rótulo alfa. A mudança de nome não certifica equivalência ou superioridade ao uBlock Origin.

## O que oferece

- Bloqueio de anúncios e rastreadores com `declarativeNetRequest`, incluindo as regras padrão empacotadas para proteger a primeira inicialização antes de o worker terminar.
- **Bloquear elemento** no popup: clique, confira a prévia e salve uma regra CSS somente para o domínio atual. Esc ou Cancelar desfaz a prévia. A regra persiste após recarregar; remova-a em **Minhas regras** para desfazer permanentemente. O seletor funciona no documento principal; frames e Shadow DOM não são selecionáveis nesta versão.
- Atualização automática de listas, ativada por padrão, com intervalo de **1, 6, 12, 24 ou 48 horas**. Listas antigas são verificadas após iniciar; filtros com hashes iguais reutilizam a compilação.
- Atualizações transacionais e restauração da configuração anterior. Uma lista inválida não substitui parcialmente as regras.
- Perfis por domínio, pausa global, CSS por site, importação TXT/JSON com prévia e exportação de regras/backup.
- Diagnóstico opcional de 30 segundos a 5 minutos, com URLs reduzidas, limites de memória e exportação local. Sem telemetria.
- Perfil YouTube com scriptlets do uBlock empacotados sob GPLv3 e recuperação conservadora de reprodução. Não promete bloqueio universal de anúncios nem ausência de detecção.
- Assistente local de anti-adblock por assinaturas e heurísticas. Não é IA generativa. A correção FC Portables aplica-se somente à assinatura de carregador conhecida.
- Interface em português, inglês e chinês simplificado. Doação opcional pelo PayPal para `jv12802@gmail.com`.

## Instalação

Use os arquivos da [release](https://github.com/linuxhell/mblock/releases). Releases futuras distribuem somente os pacotes Chrome/Edge, o XPI **assinado pela Mozilla** e seus checksums; não há ZIP de fontes como asset. O GitHub gera seus próprios links automáticos de código-fonte a partir das tags.

| Navegador | Instalação |
| --- | --- |
| Chrome 121+ | Extraia `mblock-chrome-VERSÃO.zip`; em `chrome://extensions`, ative Modo do desenvolvedor e escolha Carregar sem compactação. |
| Edge 121+ | Extraia `mblock-edge-VERSÃO.zip`; em `edge://extensions`, ative Modo de desenvolvedor e escolha Carregar sem pacote. |
| Firefox 142+ | Instale `mblock-firefox-VERSÃO.xpi` assinado. Um ZIP renomeado para XPI não tem assinatura válida. |

Atualize Chrome/Edge na mesma pasta instalada e clique em Recarregar na página de extensões para preservar ID e dados. No Firefox mantenha o ID `mblock@linuxhell.github.io`. Recarregue páginas abertas após mudar filtros, pausa ou CSS. As listas atualizam separadamente do código: scriptlets e correções empacotadas exigem nova versão da extensão.

## Comparação com uBlock Origin

A missão é superar o uBlock Origin em resultados reproduzíveis. **Ainda não há evidência de superioridade geral.** Element picker e atualização automática também existem no uBO; aqui são novos para o mBlock.

| Aspecto | mBlock | uBlock Origin completo |
| --- | --- | --- |
| Rede | Motor nativo DNR, sujeito às quotas MV3 | Motor próprio de filtragem |
| Sintaxe | Parte de ABP/uBO; incompatibilidades aparecem no painel | Sintaxe mais ampla, scriptlets e filtros procedurais |
| CSS genérico padrão | Desativado; pode ser ativado por site | Ativado por padrão |
| Diagnóstico | Sessão temporária, exportação com redução de URLs | Logger e ferramentas avançadas |
| Objetivo de melhoria | Menos trabalho na página, atualizações verificáveis e diagnóstico simples | Referência de eficácia e compatibilidade |

A compilação das listas coletadas em 12/11/2026 ainda encontra cerca de 20 mil filtros incompatíveis, incluindo muitos scriptlets e filtros procedurais. Isso impede tratar o mBlock como substituto equivalente. Menos regras ou menor uso de CPU não demonstram melhor bloqueio se funções forem omitidas.

A [segunda redução de memória](docs/MEMORY-SECOND-2026-11-12.md) economizou mais 54–55 MiB contra o build anterior e manteve menor CPU/tempo que o uBO no teste; ainda restaram cerca de 40–44 MiB extras.

A [otimização de memória](docs/MEMORY-2026-11-12.md) reduziu o RSS total em 6,6–8,0% contra a versão anterior e manteve menor CPU/tempo que o uBO nesta fixture. Veja [resultados medidos contra o uBO](docs/BENCHMARK-2026-11-12.md): houve menor CPU/tempo nesta fixture, com maior memória. Consulte [auditoria](docs/AUDIT-0.3.0.md) e [validação e benchmark](docs/VALIDATION.md). O benchmark recusa medir uma extensão inativa, registra CPU/RAM/tempo e confirma bloqueio e conteúdo essencial. A comparação controlada usa um Chromium histórico comum aos motores MV2/MV3; não representa a experiência em todos os navegadores atuais ou sites reais.

## Privacidade e limites

Listas são dados; nenhum código remoto é executado. As URLs públicas das listas recebem requisições de atualização. Cookies, corpos e cabeçalhos não são lidos pelo diagnóstico. Caminhos opcionais podem conter dados pessoais; revise o relatório antes de compartilhar. As permissões HTTP/HTTPS permitem CSS e ferramentas na aba escolhida. Os listeners de rede do diagnóstico só são ligados durante a sessão.

Não há garantia de invisibilidade a anti-adblock. O log nativo exato no Chromium exige instalação descompactada. O seletor salva CSS, portanto oculta elementos; não impede sozinho o download dos recursos desses elementos. Seletores podem precisar de revisão se o site mudar.

## Desenvolvimento

Node.js 22+, Python 3, Git:

```sh
npm ci
npm test
npm run fetch:lists
npm run build
node scripts/lint-firefox.mjs
npx playwright install --with-deps chromium
npm run test:browser
npm run benchmark
npm run package
```

`npm run package` gera somente Chrome/Edge e checksums em `artifacts/`. Para a distribuição completa, obtenha o XPI da Mozilla e execute `python3 scripts/package.py --require-firefox --signed-firefox /caminho/assinado.xpi`. O script verifica versão, ID e presença dos registros de assinatura; a origem confiável é a assinatura obtida da Mozilla, não uma verificação criptográfica feita pelo script.

O workflow manual **Signed installation release** valida, assina na Mozilla e publica os três instaladores. Requer os secrets `AMO_JWT_ISSUER` e `AMO_JWT_SECRET` configurados no repositório. Falha antes de publicar se a assinatura não for obtida. Veja [assinatura Firefox](docs/FIREFOX_SIGNING.md).

GPL-3.0-only. Fontes ficam neste repositório; atribuições e licenças acompanham os instaladores. Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
