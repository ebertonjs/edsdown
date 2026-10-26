# Changelog

## 0.1.1 — 2026-10-25

Extensão do navegador:
- Português e inglês (segue o idioma do navegador).
- Popup: colar um link e enviar, "Baixar o vídeo desta página" e liga/desliga da captura de downloads.
- Configurações: botão "Testar conexão" com o app.
- Tema escuro automático e cores da nova identidade.
- Cookies do site só são enviados ao app quando o site exige login.
- Removida a permissão `tabs`.
- Correções: vazamento de memória do botão de vídeo, cliques sem tecla não acordam mais a extensão, páginas sem vídeo não fazem trabalho em segundo plano, padrões inválidos na lista de sites não quebram a página.

App:
- `/resolve` informa `needLogin` e aceita `login: true` para usar os cookies direto.
- Avisos de propriedades obsoletas do Slint corrigidos.

## 0.1.0 — 2026-10-25

- Primeira versão do EdsDown.
- Atualização automática assinada (Ed25519) a partir dos releases deste repositório.
- Novo ícone e identidade.
