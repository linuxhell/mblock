# Listas e atribuições

O código original do mBlock é distribuído sob GPL-3.0-only. mBlock é um projeto independente e não é afiliado ao uBlock Origin, EasyList, AdGuard ou HaGeZi. A seleção de listas não implica recomendação ou revisão do projeto por seus autores.

Os arquivos de assinatura distribuídos dentro de `data/default.json` preservam o texto, cabeçalhos e atribuições das listas. Regras JSON e índices de seletores são derivados dessas listas. O compilador não implementa toda a sintaxe do uBlock Origin; o painel mostra as rejeições.

| Conteúdo | Origem | Licença / informações |
| --- | --- | --- |
| EasyList e EasyPrivacy | https://easylist.to/ e espelho https://github.com/uBlockOrigin/uAssets/tree/master/thirdparties/easylist | https://easylist.to/pages/licence.html |
| uBlock filters, Privacy, Unbreak, Quick Fixes e Badware | https://github.com/uBlockOrigin/uAssets | GPLv3, https://github.com/uBlockOrigin/uAssets/blob/master/LICENSE |
| Lista em português (opcional) | https://github.com/AdguardTeam/FiltersRegistry | GPLv3, https://github.com/AdguardTeam/FiltersRegistry/blob/master/LICENSE |
| HaGeZi Multi PRO (opcional) | https://github.com/hagezi/dns-blocklists | GPLv3, https://github.com/hagezi/dns-blocklists/blob/main/LICENSE |

As listas opcionais são baixadas somente quando habilitadas. URLs e SHA-256 de cada coleta constam no relatório de compilação e no diagnóstico. SHA-256 identifica os bytes recebidos; não é uma assinatura de autenticidade. As atualizações usam HTTPS das origens configuradas.

O ícone e a interface do mBlock são originais. A correção FC Portables foi escrita a partir da inspeção do carregador público da página em 11/11/2026; o código remoto do site não integra a extensão.

## Componentes do uBlock Origin no perfil YouTube

O gerador de scriptlets, o parser e seus auxiliares em `vendor/ublock` foram obtidos de https://github.com/gorhill/uBlock, commit `2bc679d99afe5bddd8fe3ab60137966a12123f41`. Copyright Raymond Hill e colaboradores, GPL-3.0-or-later. Os avisos originais e licenças dos componentes auxiliares foram preservados no diretório vendorizado.

O build seleciona apenas os filtros de scriptlets específicos dos domínios do YouTube nas fontes uAssets, gera os arquivos em `site/` e os inclui no pacote. Esse código é distribuído com a extensão; não é compilado nem executado a partir de downloads feitos em tempo de uso. O código-fonte para revisão inclui o gerador, os componentes vendorizados e o snapshot das listas utilizado.
