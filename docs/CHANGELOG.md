# 0.2.1

- Recuperação adicional no player do YouTube para anúncios que escapam dos filtros: botão de pular visível primeiro, avanço limitado da mídia apenas com estado de anúncio e sinais visuais corroborando. Sem alteração de velocidade, volume ou autoplay.
- Observação apenas da classe do player no modo normal. Tentativas a cada 300 ms existem somente enquanto o player indica anúncio; busca inicial do player tem limite de 20 segundos.
- Perfil e código da recuperação participam do hash empacotado. O diagnóstico distingue registro para navegações futuras da execução efetiva na aba atual, e exporta contadores de tentativas sem URLs de mídia.
- A análise usa sondagem isolada sob demanda e funciona sem um receptor residente em abas antigas. A coleta de logs pode reconectar o script de diagnóstico após atualização.
- Ativar a correção conhecida também aplica o perfil à aba aberta, respeitando pausa global/por site e evitando duplicar o módulo de recuperação.

# 0.2.0

- Exportação de regras pessoais como TXT e backup JSON de regras, perfis, preferências e IDs das listas selecionadas.
- Importação com prévia, mesclagem ou substituição, deduplicação, aviso de regras incompatíveis, validação de esquema e proteção contra alteração concorrente da configuração. O rollback restaura o estado anterior.
- Limite de regras pessoais ampliado de 100 KB para 2 MiB, preservados os limites nativos de regras do navegador.
- Perfil YouTube gerado com o parser e o gerador de scriptlets do uBlock Origin. Inclui proteção para dados iniciais do player e respostas de player, playlists e navegação interna conforme os filtros empacotados. Os scripts são registrados em `document_start` nos mundos MAIN e ISOLATED apenas nos domínios suportados, em páginas de nível superior.
- A pausa global, a pausa por site e o controle específico de YouTube atualizam os scripts registrados. É necessário recarregar uma página já aberta para remover ou instalar seus hooks.
- A atualização de uma instalação 0.1.0 preserva preferências e regras pessoais e recompila o índice local sem depender de um download inicial.
- O assistente passa a reconhecer a origem YouTube e retorna o hash do perfil, o estado do registro e sinais do player. Ausência de um aviso anti-adblock não é interpretada como ausência de anúncios.
- Coleta de diagnóstico de 30 segundos por padrão, com duração selecionável até 5 minutos, contagem regressiva e parada manual. Amostras de texto limitadas sem forçar layout de toda a página.
- Botões indisponíveis usam cursor normal, com motivo explícito para a correção conhecida indisponível ou já ativa. O indicador de progresso aparece apenas durante uma operação; a sondagem do site tem tempo limite.
- Ícone, doação e os três idiomas são preservados.

Os filtros avançados do perfil YouTube são código empacotado e mudam com a versão da extensão. Atualizar listas em tempo de uso não baixa nem executa código novo. Não há promessa de bloqueio de todos os experimentos de anúncios do YouTube; navegação em conta autenticada e anúncios inseridos no fluxo devem ser verificados com diagnóstico real. Frames incorporados em sites de terceiros ainda não recebem esse perfil avançado.
