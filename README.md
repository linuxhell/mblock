# mBlock

Bloqueador experimental para **Chrome, Edge e Firefox**, com foco em bloqueio nativo, diagnóstico local e correções de anti-adblock verificáveis.

**Meta: superar o uBlock Origin em casos demonstráveis, sem perder desempenho ou compatibilidade. Isso ainda não foi demonstrado.** Esta é uma base alfa; não é um substituto equivalente ao motor completo do uBlock Origin. Não existe promessa de invisibilidade a sites.

## O que esta versão faz

- Bloqueia anúncios e rastreadores pela API nativa `declarativeNetRequest`; não executa JavaScript da extensão a cada requisição no modo normal.
- Compila EasyList, EasyPrivacy e listas do uBlock; agrupa domínios com condições iguais, deduplica e respeita exceções e limites do navegador.
- Atualiza dados das listas a cada 12 horas. Falhas de download, compilação ou validação mantêm a configuração anterior. Uma transação pendente é recuperada após reinício.
- Aplica CSS por domínio com estilos de origem `USER`, sem adicionar uma tag de estilo à página. Ocultação genérica começa desativada.
- Permite pausa global, perfis por site, regras pessoais e restauração da configuração anterior.
- Registra diagnósticos de uma aba por 15 minutos: requisições, erros de rede, correspondência nativa de regras quando disponível, origem dos filtros, seletores aplicados, limites e sinais de anti-adblock.
- Exporta JSON para análise, sem enviar os logs automaticamente. Cookies, cabeçalhos, corpos de requisição e valores de parâmetros não são coletados.
- Inclui uma correção específica para o carregador anti-adblock observado no FC Portables em 11/11/2026. Sua assinatura de URL e o comportamento de fallback têm teste de regressão; isso não certifica todos os fluxos ou versões futuras do site.

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

O compilador inicial suporta filtros ABP de URL, domínios, tipos de recurso, first/third-party, exceções, `important`, `badfilter` e CSS comum, incluindo `:has()` nativo. Ele **não implementa o motor completo do uBlock**: scriptlets gerais `+js`, filtros procedurais, substituição de resposta, redirecionamentos de recursos e parte da sintaxe estendida são rejeitados e contabilizados. Essa lacuna pode causar anúncios, detecção ou quebras onde o uBlock completo já funciona. Cada lista mostra motivos e amostras no painel.

As regras de rede e CSS suportadas recebem atualização automática. A correção de código específica do FC Portables muda apenas com uma versão nova da extensão. Não há execução de código baixado das listas.

A versão Chromium utiliza até 30 mil regras dinâmicas; a quantidade disponível é consultada na API. Uma configuração que ultrapasse esse limite é recusada por inteiro. As regras agrupadas representam muitos filtros; sua quantidade não é uma medida de eficácia.

O registro exato por `onRuleMatchedDebug` é uma capacidade de depuração de extensões descompactadas no Chrome/Edge. Um erro de rede ou uma frase na página é um sinal, não prova de detecção pelo site. A leitura de texto para encontrar avisos ocorre apenas durante o diagnóstico, em algumas amostras limitadas; não existe varredura contínua de todo o DOM no modo normal.

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
