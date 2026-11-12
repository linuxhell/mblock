# mBlock

Bloqueador experimental para **Chrome, Edge e Firefox**, com foco em bloqueio nativo, diagnóstico local e correções de anti-adblock verificáveis.

**Meta: superar o uBlock Origin em casos demonstráveis, sem perder desempenho ou compatibilidade. Isso ainda não foi demonstrado.** Esta é uma base alfa; não é um substituto equivalente ao motor completo do uBlock Origin. Não existe promessa de invisibilidade a sites.

A versão **0.2.0** adiciona importação/exportação e um perfil avançado específico para YouTube. Veja [o histórico](docs/CHANGELOG.md).

## O que esta versão faz

- Bloqueia anúncios e rastreadores pela API nativa `declarativeNetRequest`; não executa JavaScript da extensão a cada requisição no modo normal.
- Compila EasyList, EasyPrivacy e listas do uBlock; agrupa domínios com condições iguais, deduplica e respeita exceções e limites do navegador.
- Atualiza dados das listas a cada 12 horas. Falhas de download, compilação ou validação mantêm a configuração anterior. Uma transação pendente é recuperada após reinício.
- Aplica CSS por domínio com estilos de origem `USER`, sem adicionar uma tag de estilo à página. Ocultação genérica começa desativada.
- Permite pausa global, perfis por site, regras pessoais e restauração da configuração anterior.
- Exporta regras pessoais como TXT e backup JSON com perfis, preferências e IDs das listas. Importa com prévia, mesclagem/substituição, deduplicação e aviso de incompatibilidades. O arquivo de backup não contém logs nem dados de navegação.
- Usa componentes GPL do uBlock Origin para gerar e empacotar o perfil de scriptlets do YouTube. Os hooks entram antes dos scripts da página e só são registrados nos domínios suportados do YouTube, em páginas de nível superior. A opção pode ser desligada e respeita a pausa por site.
- Registra diagnósticos de uma aba por 15 minutos: requisições, erros de rede, correspondência nativa de regras quando disponível, origem dos filtros, seletores aplicados, limites e sinais de anti-adblock.
- Exporta JSON para análise, sem enviar os logs automaticamente. Cookies, cabeçalhos, corpos de requisição e valores de parâmetros não são coletados.
- Inclui uma correção específica para o carregador anti-adblock observado no FC Portables em 11/11/2026. Sua assinatura de URL e o comportamento de fallback têm teste de regressão; isso não certifica todos os fluxos ou versões futuras do site.
- Interface em inglês, português do Brasil e chinês simplificado, com detecção inicial do idioma e seletor manual. O ícone é um escudo preto com M vermelho.
- Doação opcional via PayPal para `jv12802@gmail.com`, com textos e link nos três idiomas. Não há pagamento dentro da extensão nem abertura automática do PayPal.
- Assistente local que identifica assinaturas conhecidas de AntiAdblockCore, Ad Inserter e da família BlockAdBlock/FuckAdBlock, informa confiança e oferece a correção empacotada quando a assinatura verificada do FC Portables está presente.

O assistente inicial é **heurístico, não uma IA generativa**. Não promete identificar versões ocultas, gerar regras arbitrárias ou validar automaticamente qualquer site. Uma IA para investigar mecanismos novos precisa de um componente adicional e de um ciclo de teste e reversão; esse recurso não está concluído nesta alfa.

## Instalação de teste

Os pacotes são produzidos na aba **Actions → Build and browser checks → Artifacts**. Baixe `mblock-installation-packages`, extraia o arquivo de artefatos e depois extraia o ZIP do seu navegador.

| Navegador | Instalar |
| --- | --- |
| Chrome 121+ | Abra `chrome://extensions`, ative **Modo do desenvolvedor**, clique em **Carregar sem compactação** e selecione a pasta que contém `manifest.json`. |
| Edge 121+ | Abra `edge://extensions`, ative **Modo de desenvolvedor**, clique em **Carregar sem pacote** e selecione a pasta que contém `manifest.json`. |
| Firefox 142+ | Abra `about:debugging#/runtime/this-firefox`, clique em **Carregar extensão temporária** e selecione `manifest.json` na pasta Firefox. A instalação temporária termina ao fechar o Firefox. |

Os pacotes não são assinados nem publicados nas lojas. Instalação permanente no Firefox exige assinatura pela Mozilla. Atualização automática das **listas** já está implementada; atualização automática do **código da extensão** depende da distribuição assinada por uma loja ou canal próprio futuro.

Para comparar resultados, use um perfil de teste com um bloqueador ativo de cada vez. Dois bloqueadores simultâneos alteram exceções e dificultam identificar qual deles acionou uma detecção.

## Primeiro caso: FC Portables

1. Instale o pacote Edge em um perfil de teste e acesse `https://www.fcportables.com/`.
2. Abra o mBlock e clique em **Diagnosticar site**.
3. Recarregue a aba e reproduza o aviso, inclusive na página interna em que ele ocorre.
4. No painel, clique em **Exportar diagnóstico JSON**. O relatório identifica a versão, fontes e SHA-256, regras acionadas e eventuais falhas.

O carregador observado usa um subdomínio e caminhos variáveis, além de alternativas no domínio principal. A correção redireciona apenas scripts com essa assinatura para um pequeno recurso empacotado que satisfaz a verificação de carregamento da página. Não libera redes de anúncios, não modifica APIs globais do navegador e não remove avisos genericamente. A extensão permite desligar essa correção no perfil do site.

## Limitações que importam para a meta

O compilador inicial suporta filtros ABP de URL, domínios, tipos de recurso, first/third-party, exceções, `important`, `badfilter` e CSS comum, incluindo `:has()` nativo. Ele **não implementa o motor completo do uBlock**: scriptlets gerais `+js` importados pelo usuário, filtros procedurais, substituição de resposta, redirecionamentos de recursos e parte da sintaxe estendida são rejeitados e contabilizados. Essa lacuna pode causar anúncios, detecção ou quebras onde o uBlock completo já funciona. Cada lista mostra motivos e amostras no painel.

O perfil YouTube específico é código empacotado, com fontes, commit e hash registrados no diagnóstico; sua atualização requer uma nova versão da extensão. Ele não significa suporte geral a qualquer scriptlet em listas importadas.

As regras de rede e CSS suportadas recebem atualização automática. A correção de código específica do FC Portables muda apenas com uma versão nova da extensão. Não há execução de código baixado das listas.

A versão Chromium utiliza até 30 mil regras dinâmicas; a quantidade disponível é consultada na API. Uma configuração que ultrapasse esse limite é recusada por inteiro. As regras agrupadas representam muitos filtros; sua quantidade não é uma medida de eficácia.

O registro exato por `onRuleMatchedDebug` é uma capacidade de depuração de extensões descompactadas no Chrome/Edge. Um erro de rede ou uma frase na página é um sinal, não prova de detecção pelo site. A leitura de texto para encontrar avisos ocorre apenas durante o diagnóstico, em algumas amostras limitadas; não existe varredura contínua de todo o DOM no modo normal.

## Importar, exportar e atualizar

No painel, **Minhas regras** exporta o texto salvo em TXT ou um backup JSON. Em **Importar regras e backup**, escolha o arquivo, o modo de mesclagem ou substituição e valide a prévia. Só então aplique. Regras não suportadas são preservadas como texto apenas se você aceitar; elas não são executadas. O limite de regras pessoais é 2 MiB, sempre sujeito ao limite de regras nativas. Listas públicas são identificadas pelos IDs e baixadas de suas origens conhecidas, não embutidas no backup.

Ao atualizar uma instalação Chrome/Edge descompactada, substitua os arquivos **na mesma pasta já instalada** e clique em Recarregar na página de extensões. Isso preserva o ID e as configurações. No Firefox, assine o novo ZIP mantendo o mesmo ID do complemento e instale-o como atualização. Recarregue também as abas do YouTube.

## Desenvolvimento

Requisitos: Node.js 22+, Python 3 e Git. O build usa apenas a biblioteca padrão do Python para gerar ícones.

```sh
npm ci
npm test
npm run fetch:lists
npm run build
node scripts/lint-firefox.mjs
npx playwright install --with-deps chromium
npm run test:browser
npm run package
```

Os pacotes ficam em `artifacts/`. As listas com seus cabeçalhos e hashes são incluídas nos pacotes, junto da licença e atribuições. `dist/build-report.json` contém as estatísticas da compilação.

## Como avaliar uma vantagem real

O próximo critério de evolução é um comparativo reproduzível: mesma versão do navegador, hardware, páginas, estado de cache e seleções de listas; perfis isolados; logs detalhados desligados durante medições normais. Medir bloqueio de anúncios e rastreadores, avisos anti-adblock, funcionamento do site, tempo de carregamento, CPU e memória. Compare o **uBlock Origin completo no Firefox** e a versão exata que estiver instalada no Edge; uBlock Origin Lite é um produto diferente.

`npm run benchmark` executa uma medição local controlada com o mBlock. Para comparar outra extensão Chromium descompactada, defina `MBLOCK_BASELINE=/caminho/da/extensao`. O teste não declara equivalência ao uBlock Origin completo nem representa toda a web. Veja [docs/VALIDATION.md](docs/VALIDATION.md).

Fontes das APIs: [Chrome DNR](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest), [Manifest V3 no Firefox](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/) e [regras de código remoto do Chrome](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements).

GPLv3. Atribuições e licenças de filtros em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
