# Assinatura e distribuição Firefox

A release 0.3.1 deve conter apenas Chrome, Edge, XPI assinado e checksums. Não publique ZIP Firefox sem assinatura nem ZIP de fontes como assets.

## Caminho automatizado

Configure no repositório os secrets `AMO_JWT_ISSUER` e `AMO_JWT_SECRET`, obtidos na conta de desenvolvedor Mozilla autorizada para o complemento `mblock@linuxhell.github.io`. Execute manualmente o workflow **Signed installation release** no commit revisado.

O workflow executa os testes e linter, pede assinatura unlisted à Mozilla com `web-ext sign`, empacota e publica os arquivos de instalação. A assinatura é obtida antes da criação da release. Secrets não são impressos nem armazenados nos instaladores. A publicação falha se a assinatura ou qualquer validação falhar. Não reutilize o XPI de uma versão anterior nem tente reassinar localmente.

## Caminho manual

1. Compile `dist/firefox` e compacte seu conteúdo com `manifest.json` na raiz, fora de `artifacts/`.
2. Envie esse ZIP à [Mozilla](https://addons.mozilla.org/developers/addon/submit/), mantendo o ID existente. Se houver revisão de fontes, forneça-as pelo canal de revisão; isso não exige criar um asset de fontes na release pública.
3. Baixe o XPI assinado retornado pela Mozilla.
4. Execute `python3 scripts/package.py --require-firefox --signed-firefox /caminho/retornado.xpi`.

O empacotador confere versão, ID e presença dos registros `META-INF/mozilla.rsa` e `META-INF/mozilla.sf`; isso não substitui verificação criptográfica. Sua fonte confiável deve ser o resultado da Mozilla. Renomear ZIP para XPI não produz uma assinatura.

Firefox mínimo: 142. Sem telemetria; permissões HTTP/HTTPS para CSS e ferramentas por aba; diagnóstico de rede opcional e temporário. O assistente usa heurísticas locais. Não declare superioridade geral ao uBO ou invisibilidade a sites sem evidências.

O linter pode reportar `COINMINER_USAGE_DETECTED` nos JSONs de listas que **bloqueiam** domínios de mineração. O wrapper preserva esses avisos e aceita apenas esse caso em dados, rejeitando outros avisos e todos os erros. A decisão da Mozilla é independente do linter local.
