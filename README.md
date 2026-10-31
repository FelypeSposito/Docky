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
src-tauri/src  config, island (janela), pointer (cursor/hover), power, fullscreen, tray, settings_window
prototype/     protótipos visuais descartáveis (Fase 0); a v2 é a referência de visual e movimento
```

## Teclas globais

Ctrl+Alt+D abre e fecha a ilha, Ctrl+Alt+←/→ trocam de página e Ctrl+Alt+N abre a nota rápida.

## Fases

0. Protótipo visual (feito) · 1. Base: janela, tamanhos, hora, olhos, bateria, bandeja, início com o Windows ·
2. Mídia e letras (LRCLIB), volume e brilho, páginas e dock · 3. Atividade do Claude Code com aprovações ·
4. Pomodoro, notas em `brain/Inbox`, Shelf (Drive sincronizado), clima, Google Calendar (OAuth opcional) ·
5. Lançador, pílulas de dev, monitor de sistema, "Perguntar ao Claude" · 6. Espelhar notificações (após teste de viabilidade).
