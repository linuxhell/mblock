# Envio para assinatura do Firefox

Pacote: `mblock-firefox-0.2.1.zip`. Ele já contém `manifest.json` na raiz; envie o próprio ZIP, sem colocar os arquivos em outra pasta.

1. Acesse https://addons.mozilla.org/developers/addon/submit/ com sua conta Mozilla.
2. Escolha distribuição pelo site da Mozilla se deseja uma listagem pública, ou distribuição própria se deseja somente um XPI assinado para instalar e compartilhar.
3. Envie o ZIP Firefox e siga a validação. Se o processo pedir o código-fonte, envie `mblock-fontes-0.2.1.zip`.
4. Descreva como versão experimental, sem prometer superioridade ao uBlock Origin ou ausência de detecção. O assistente atual usa heurísticas locais, sem modelo de IA remoto.
5. Depois que a Mozilla assinar, baixe o `.xpi` produzido por ela. Renomear nosso ZIP para `.xpi` não o torna assinado.

ID: `mblock@linuxhell.github.io`. Versão mínima: Firefox 142. Os três idiomas e o link de doação já estão no pacote.

O linter pode mencionar `COINMINER_USAGE_DETECTED` em arquivos de dados da EasyPrivacy. São referências a endereços que a lista **bloqueia**, não código de mineração executado. As advertências são preservadas no relatório, e o wrapper de validação só admite esse falso positivo em JSON de listas. A análise e aprovação da Mozilla são independentes da nossa validação local.

Permissões amplas de HTTP/HTTPS são usadas para CSS por site e diagnóstico da aba escolhida. `webRequest` é passivo e seus listeners só são ligados durante uma sessão de diagnóstico. Não há telemetria, upload de logs, cookies ou leitura de corpos de requisições. O PayPal abre somente por clique do usuário.

Para reproduzir os arquivos da extensão, extraia o arquivo de fontes, mantenha seu diretório `data/cache` e execute `npm ci`, `npm test` e `npm run build`. Compacte o conteúdo de `dist/firefox`, mantendo `manifest.json` na raiz do ZIP. O comando `npm run package` é usado em um checkout Git; o ZIP de fontes não contém o histórico Git. Os dados e hashes correspondem à coleta usada nesta versão; não execute `fetch:lists` se deseja reproduzir o mesmo snapshot.
