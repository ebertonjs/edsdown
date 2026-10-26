<p align="center"><img src="https://raw.githubusercontent.com/ebertonjs/edsdown/main/docs/images/main-claro.png" alt="EdsDown 0.1.2" width="800"></p>

## Desempenho

- **Escrita em disco mais rápida**: cada conexão junta até 2 MB antes de gravar e grava fora do lock, em thread própria. Menos chamadas de disco e nenhuma conexão esperando outra.
- **Retomada segura**: bytes recebidos mas ainda não gravados nunca são salvos como baixados. Fechar o programa no meio não corrompe o arquivo.
- **Vídeo + áudio**: a junção não regrava mais o arquivo inteiro uma segunda vez (`faststart` removido).
- **Lista de downloads**: `downloads.json` compacto e gravado em segundo plano; a lista só é redesenhada quando algo muda.
- **Extensão**: o monitor de mídia ignora imagens, scripts, CSS e fontes.

## Extensão (desde 0.1.1)

<p align="center"><img src="https://raw.githubusercontent.com/ebertonjs/edsdown/main/docs/images/popup.png" alt="Popup da extensão" width="640"></p>

- Português e inglês, conforme o idioma do navegador.
- Colar um link e enviar, "Baixar o vídeo desta página" e liga/desliga da captura direto no popup.
- Tema escuro automático.
- Cookies do site só vão para o programa quando o site exige login.

<p align="center"><img src="https://raw.githubusercontent.com/ebertonjs/edsdown/main/docs/images/botao-video.png" alt="Botão Baixar este vídeo" width="584"></p>

## Instalação

Baixe o **EdsDown-Setup.exe** abaixo. Quem já tem o EdsDown instalado recebe esta versão sozinho (ou em **Help → Check for updates**).

Lista completa de mudanças: [CHANGELOG.md](https://github.com/ebertonjs/edsdown/blob/main/CHANGELOG.md)
