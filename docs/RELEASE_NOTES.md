mBlock 0.3.0

- Proteção nativa com o conjunto padrão completo na primeira inicialização, antes do término do worker.
- Removido o rótulo alfa; isso não certifica superioridade ao uBlock Origin.
- Seletor visual de elementos com prévia, cancelamento e regras persistentes por domínio.
- Atualização automática configurável em 1, 6, 12, 24 ou 48 horas; restauração do agendamento conforme a idade das listas.
- Reutilização da compilação e dos índices quando o conteúdo não mudou; preferências simples não recompilam listas.
- Correção de atualizações simultâneas de perfis e identidade do cache CSS por documento.
- Melhor compatibilidade com `denyallow`, opções `_` e domínios sem âncora explícita.
- README em português, inglês e chinês simplificado.
- Distribuição apenas de Chrome, Edge e XPI assinado pela Mozilla, com checksums. Sem ZIP de fontes como asset.

O compilador ainda suporta parte da sintaxe uBO. Consulte a auditoria e as limitações no README. Resultados sintéticos de desempenho não demonstram superioridade em todos os sites.
