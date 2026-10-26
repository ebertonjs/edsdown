# Changelog

## 0.1.3

Visual NetLAB (o mesmo do NetNOC):
- Dois temas novos, **NetLAB escuro** (padrão) e **NetLAB claro**: fundo de ondas, painéis de vidro translúcidos com cantos arredondados, fonte Inter embutida e destaque laranja.
- Quem estava no tema padrão antigo (Claro) passa para o NetLAB escuro uma vez; quem escolheu outro tema continua nele.
- Diálogos com o gradiente do NetLAB, menus e botões arredondados.
- Extensão: popup, configurações e botão "Baixar este vídeo" no mesmo visual (vidro, ondas, Inter, laranja), claro e escuro automáticos.

## 0.1.2 — 2026-10-25

Desempenho:
- Cada conexão junta até 2 MB antes de gravar e grava fora do lock, em thread própria: menos chamadas de disco e nenhuma conexão esperando outra.
- Bytes recebidos mas ainda não gravados nunca são salvos como baixados (retomada segura após fechar o app).
- Segmentos terminados vizinhos são juntados ao retomar.
- Junção de vídeo + áudio sem `faststart`: uma regravação completa do arquivo a menos.
- `downloads.json` em JSON compacto, gravado fora do runtime e sem gravações sobrepostas.
- Lista principal só é redesenhada quando algo muda; ordenação, contagens e seleção mais baratas.
- Extensão: o monitor de mídia ignora imagens, scripts, CSS e fontes.

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
