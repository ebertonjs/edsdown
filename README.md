<div align="center">

<img src="docs/images/icone.png" width="96" alt="EdsDown">

# EdsDown

Gerenciador de downloads para Windows, escrito em Rust.

![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?style=flat-square&logo=windows11&logoColor=white)
![Rust](https://img.shields.io/badge/Made%20with-Rust-B7410E?style=flat-square&logo=rust&logoColor=white)
[![Release](https://img.shields.io/github/v/release/ebertonjs/edsdown?style=flat-square&label=vers%C3%A3o)](https://github.com/ebertonjs/edsdown/releases/latest)

<br>

<img src="docs/images/principal.png" alt="Janela principal do EdsDown" width="860">

</div>

---

## Telas

Visual escuro e profissional: barra lateral com as visões, categorias, filas e a velocidade total; barra de ferramentas; todos os downloads numa lista ordenável com o progresso em cada linha; e barra de status com velocidade, limitador e navegador.

<table>
<tr>
<td align="center"><b>Clique direito</b><br><img src="docs/images/menu-contexto.png" alt="Menu do clique direito" width="420"></td>
<td align="center"><b>Opções</b><br><img src="docs/images/opcoes.png" alt="Janela de opções" width="420"></td>
</tr>
<tr>
<td align="center"><b>Popup da extensão</b><br><img src="docs/images/popup-extensao.png" alt="Popup da extensão" width="300"></td>
<td align="center"><b>Remover com confirmação</b><br><img src="docs/images/confirmar-remocao.png" alt="Confirmação ao remover" width="420"></td>
</tr>
</table>

## Recursos

| Recurso | Detalhes |
|---|---|
| Multi-conexão | Divide o arquivo em até 32 conexões simultâneas |
| Retomada | Pausa e continua a qualquer momento, mesmo depois de fechar o programa |
| Extensão de navegador | Chrome, Edge, Brave, Opera e Firefox |
| Vídeo e áudio | Vídeos e playlists com escolha de qualidade (yt-dlp + FFmpeg próprio) |
| Torrents | Arquivos .torrent e links magnet (aria2) |
| Assistir enquanto baixa | Vídeo ou áudio abre no player antes de terminar |
| Queda de internet | Downloads esperam e continuam sozinhos quando a conexão volta |
| Categorias | Cada arquivo vai para a pasta do seu tipo |
| Filas e agendamento | Filas, horário de início e desligar o PC ao terminar |
| Limite de velocidade | Global ou por download |
| Grabber | Coleta todos os arquivos de uma página |
| Interface | Tema escuro profissional, lista com progresso por linha, barra lateral e barra de status |
| Idiomas | Português, English, Español, Français, Deutsch, Türkçe, Русский, العربية |

## Instalação

Baixe o `EdsDown-Setup.exe` do [último release](https://github.com/ebertonjs/edsdown/releases/latest) e execute.
Instala para o usuário atual (`%LOCALAPPDATA%\Programs\EdsDown`), sem precisar de administrador.

### Extensão do navegador

Pelo programa: **Help → Add EdsDown to my browser**. Ou manualmente:

**Chrome / Edge / Brave / Opera**
1. Abra `chrome://extensions` (ou `edge://extensions`, `brave://extensions`)
2. Ative o **Modo do desenvolvedor**
3. **Carregar sem compactação** → escolha `%LOCALAPPDATA%\Programs\EdsDown\extension`

**Firefox**
- Temporária: `about:debugging` → *Este Firefox* → *Carregar extensão temporária* → `extension-firefox\manifest.json`
- Permanente: release com a extensão assinada pela Mozilla (secrets `AMO_JWT_ISSUER` / `AMO_JWT_SECRET`)

## Build

Requisitos: [Rust](https://rustup.rs) (MSVC) e [Inno Setup](https://jrsoftware.org/isinfo.php) (o script tenta instalar via winget).

Rode `BUILD.bat`. O instalador sai em `dist\EdsDown-Setup.exe`.
O `ffmpeg.exe` usado no build local fica em `tools\ffmpeg\win64` (gerado por `tools/ffmpeg/build.sh`; no GitHub o CI gera a cada release).
O primeiro build em release leva vários minutos; evite pastas no Desktop/OneDrive e exclua a pasta do projeto do antivírus.

## Requisitos

- Windows 10 ou 11 (64-bit)

## O que o programa faz sozinho

| Função | Detalhes |
|---|---|
| Atualização | Na inicialização e a cada 6 h lê `version.json` do último release deste repositório. A atualização só é instalada se a assinatura Ed25519 bater com a chave pública embutida no programa e o SHA-256 do instalador conferir. |
| Ferramentas | O yt-dlp (pasta `tools`) é atualizado uma vez por dia a partir do release oficial, conferindo o SHA-256 publicado. O FFmpeg é um build próprio e enxuto (`tools/ffmpeg/build.sh`) e o aria2 é uma versão fixa conferida por SHA-256; os dois vêm com o instalador. |
| API local | Porta `127.0.0.1:9614` usada só pela extensão do navegador. |
| Cookies | A extensão envia ao programa apenas os cookies e o referer do arquivo baixado, para links que exigem login. Nada sai da máquina. |
| Área de transferência | Detecta links copiados (desativável nas opções). |
| Dados | `%APPDATA%\ebertonjs\EdsDown\data`. Senhas e cookies cifrados com DPAPI. |

Sem telemetria.

## Releases

Um push na `main` com `[release]` na mensagem do commit publica o release `v<versão>`.
O secret `UPDATE_SIGNING_KEY` do repositório assina o `version.json`.

## Estrutura

```
├─ crates/engine/   motor de download
├─ crates/app/      aplicativo (interface Slint)
│  ├─ ui/           janelas
│  └─ lang/         traduções
├─ extension/       extensão do navegador
└─ BUILD.bat        build
```

## Licença

MIT. Ver `LICENSE`.

A interface usa o [Slint](https://slint.dev), sob a licença Slint Royalty-free 2.0:

[![Made with Slint](https://raw.githubusercontent.com/slint-ui/slint/master/logo/MadeWithSlint-logo-whitebg.png)](https://slint.dev)
