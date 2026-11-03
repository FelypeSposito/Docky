# Docky

Uma ilha dinâmica para o Windows 11: uma pílula no topo da tela com hora, mídia com letras sincronizadas,
atividade do Claude Code, timers, notas e mais. Uso pessoal por enquanto, com arquitetura pensada para virar produto.

## Stack

- **Tauri 2** (Rust) + **React + TypeScript** (Vite). Animação de geometria com molas próprias (`src/lib/spring.ts`).
- A janela `island` é um painel transparente, sem borda, fixo no topo central do monitor principal. A ilha é
  desenhada pelo frontend; o Rust lê o cursor global e só deixa a janela receber cliques quando o mouse está sobre a ilha.
- Segunda janela `settings`, criada sob demanda pela bandeja ou pelo dock da ilha.

## Comandos

```bash
npm install
npm run tauri dev     # app completo (precisa de Rust + Build Tools do Visual Studio)
npm run dev           # só o frontend no navegador: http://localhost:1420 (?w=settings para as configurações)
npm test              # vitest
npm run typecheck
```

No navegador, `__docky.plug(true)` no console simula o carregador conectado.

## Organização

```
src/lib        molas, formatação, ponte com o Rust (ipc.ts), cursor global
src/config     tipos e store da configuração (espelha src-tauri/src/config.rs)
src/island     a ilha: modos/tamanhos, hover, olhos, estilos
src/settings   janela de configurações
src-tauri/src  config, island (uma janela por tela), pointer (cursor/hover), power, fullscreen, tray, settings_window,
               file_drop (arrastar arquivos do Explorer), picker (seletor de arquivo), lyrics (LRCLIB e NetEase)
prototype/     protótipos visuais descartáveis (Fase 0); a v2 é a referência de visual e movimento
```

## Google Agenda

Opcional e somente leitura (escopo `calendar.readonly`, OAuth de app para computador com PKCE). O ID do cliente vai na
configuração e a chave secreta e o token de renovação ficam no Gerenciador de Credenciais do Windows. O passo a passo
para criar o ID do cliente está em Configurações → Integrações. Veja também a [política de privacidade](PRIVACY.md).

## Páginas

Música (com letra sincronizada), Foco (Pomodoro e contador livre), Notas (fixar e excluir para a Lixeira), Shelf,
Agenda (clima com chuva, sensação, umidade, vento, UV e sol), Atalhos (apps, jogos, pastas, sites e grupos, com ícone
próprio e confirmação ao abrir), Sistema e Claude.

O botão pequeno do cabeçalho da ilha abre a tela maior da página (Agenda, Notas e Atalhos têm uma) e, dentro dela, os
ajustes da própria página, sem abrir a janela de configurações. Para dar uma tela maior ou ajustes a uma página, é só
preencher `Large` e `Settings` dela em `registry.ts`.

A ilha pode aparecer em várias telas (Configurações → Geral): cada tela tem a sua janela, e o Foco é compartilhado.

## Teclas globais

Ctrl+Alt+D abre e fecha a ilha, Ctrl+Alt+←/→ trocam de página e Ctrl+Alt+N abre a nota rápida.

## Fases

Feitas: 0. Protótipo visual · 1. Base: janela, tamanhos, hora, olhos, bateria, bandeja, início com o Windows ·
2. Mídia e letras (LRCLIB), volume, páginas e dock · 3. Atividade do Claude Code com aprovações ·
4. Foco, notas em `brain/Inbox`, Shelf, clima e Google Agenda (OAuth opcional) · 5. Lançador e monitor de sistema.

Pendentes: "Perguntar ao Claude" (precisa de chave de API e onde guardá-la), pílulas de dev (Vercel e GitHub),
brilho da tela e espelhar notificações (após teste de viabilidade).
