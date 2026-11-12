mBlock 0.3.2

- Corrige a versão exibida no popup e no painel: agora a interface lê `runtime.getManifest().version`, sem número hardcoded.
- Nova versão de código para Chrome, Edge e Firefox; a 0.3.0 assinada permanece como versão anterior.
- Redução de RSS em estado estacionário: diagnóstico pesado sai do caminho normal e passa a ser carregado sob demanda apenas no frame principal.
- Scanner AntiAdblockCore global mais leve; a lógica pesada de recuperação só é alocada quando os marcadores conhecidos aparecem.
- Menos alocações no worker: regras DNR compiladas são reutilizadas sem clonagem em massa e a promise de inicialização é liberada após o bootstrap.
- Regras AntiAdblockCore aprendidas usam o caminho leve de controle e redirecionamento DNR por host de loader rotativo.
- Correção AntiAdblockCore v4 com aprendizado de loaderHost, native redirect e fallback de document-start verificado.
- Seletor visual mais robusto contra modais que recriam elementos com IDs dinâmicos.
- Benchmark de memória corrigido para excluir renderer do dashboard e medir estado estacionário após GC de forma equivalente entre extensões.
- Em benchmark sintético controlado, o mBlock ficou abaixo do uBlock Origin 1.76.0 em RSS total nos cenários simples e de 24 frames; isso não demonstra superioridade geral em todos os sites ou máquinas.
- Mantidas as políticas de distribuição: Chrome/Edge em ZIP, Firefox apenas como XPI assinado na release pública e checksums SHA-256.

O compilador ainda suporta apenas parte da sintaxe uBO. Resultados de desempenho são sintéticos e não substituem validação de eficácia, compatibilidade e cobertura de filtros.
