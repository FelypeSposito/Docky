# Docky

Uma ilha dinâmica para o Windows 11: uma pílula no topo da tela com hora, mídia com letras sincronizadas,
atividade do Claude Code, timers, notas e mais. Uso pessoal por enquanto, com arquitetura pensada para virar produto.

## Instalar

Baixe o `Docky_x.y.z_x64-setup.exe` mais recente em **Releases** e execute. A instalação é só para o seu usuário (não
pede administrador) e o Docky abre sozinho no fim. Requer Windows 11 (ou o 10 com o WebView2, que já vem instalado).

O instalador ainda não é assinado digitalmente, então o Windows SmartScreen pode avisar "O Windows protegeu o seu PC":
clique em **Mais informações → Executar assim mesmo**. Para o Docky abrir junto com o Windows, ligue a opção em
Configurações → Geral. Para desinstalar, use Configurações do Windows → Aplicativos. As suas configurações ficam em
`%APPDATA%\com.docky.desktop` (o desinstalador pergunta se deve apagá-las).

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
docs/          MOTION-BRIEF.md: base do projeto, design e movimento (para animação e divulgação)
```

## Sugestões e seções dos atalhos

Em Configurações → Atalhos, depois de a pessoa clicar em **Permitir**, o Docky lê o que está instalado neste
computador (Menu Iniciar, apps da Loja, biblioteca da Steam e manifestos da Epic Games) e sugere atalhos prontos, com o
ícone do próprio jogo ou app (`src-tauri/src/apps.rs`). Sem a permissão, nada é lido. Tudo é local.

Na tela grande dos atalhos, eles ficam em **seções** que abrem e fecham pela setinha (Jogos, Comunicação,
Utilitários…). "Organizar automaticamente" separa os atalhos sem seção nas seções prontas (`src/launcher/sections.ts`);
a seção de cada atalho se escolhe na linha dele, nas configurações ou no modo Editar da ilha. Os grupos ficam numa parte
própria, fechada de início.

## Ícones automáticos

Um atalho novo sem ícone ganha o do app (`src-tauri/src/icons.rs`): o Docky procura a imagem uma vez (biblioteca
dashboard-icons via jsDelivr; favicon para sites) e, se não achar, extrai o ícone que o Windows já mostra para o app
(`shell_icon.rs`). Fica na pasta de ícones (padrão `Documentos\Docky\icons`, trocável em Configurações → Atalhos) e o
atalho guarda `asset:nome.png`, então mudar a pasta de lugar não quebra nada. Dá para desligar nas configurações.

## Google Agenda

Opcional e somente leitura (escopo `calendar.readonly`, OAuth de app para computador com PKCE). O ID do cliente vai na
configuração e a chave secreta e o token de renovação ficam no Gerenciador de Credenciais do Windows. O passo a passo
para criar o ID do cliente está em Configurações → Integrações. Veja também a [política de privacidade](PRIVACY.md).

## Páginas

Música (com letra sincronizada), Foco (Pomodoro e contador livre), Notas (fixar e excluir para a Lixeira), Shelf,
Agenda (clima com chuva, sensação, umidade, vento, UV e sol), Atalhos (apps, jogos, pastas, sites e grupos, com ícone
próprio e confirmação ao abrir), Sistema e Claude.

Os ícones de atalhos e pastas da Shelf podem ser uma foto, um emoji ou um desenho da biblioteca minimalista do
Docky (`lib:nome`, em `src/launcher/iconLibrary.tsx`). Na tela expandida dos atalhos, o botão Sugestões oferece grupos
prontos (Trabalho, Jogos, Estudos…) e os apps que você mais usa: o Docky lê o Menu Iniciar, os apps fixados na barra,
os que estão abertos e o histórico do Windows, tudo no seu computador (`src-tauri/src/apps.rs`).

O botão pequeno do cabeçalho da ilha abre a tela maior da página (Agenda, Notas e Atalhos têm uma) e, dentro dela, os
ajustes da própria página, sem abrir a janela de configurações. Para dar uma tela maior ou ajustes a uma página, é só
preencher `Large` e `Settings` dela em `registry.ts`.

A ilha pode aparecer em várias telas (Configurações → Geral): cada tela tem a sua janela, e o Foco é compartilhado.
Cada janela só escuta os eventos dela (`getCurrentWebviewWindow().listen`); o `listen` solto recebe os de todas as
janelas e faria uma ilha abrir e fechar a outra. Apps, links, notas e configurações abrem na tela da ilha clicada.

Com a letra da música ativa e o Claude Code trabalhando, a letra continua e um selo animado do Claude aparece no
canto da pílula; sem letra, a faixa "Claude trabalhando" aparece como antes.

## Teclas globais

Ctrl+Alt+D abre e fecha a ilha, Ctrl+Alt+←/→ trocam de página e Ctrl+Alt+N abre a nota rápida.

## Fases

Feitas: 0. Protótipo visual · 1. Base: janela, tamanhos, hora, olhos, bateria, bandeja, início com o Windows ·
2. Mídia e letras (LRCLIB), volume, páginas e dock · 3. Atividade do Claude Code com aprovações ·
4. Foco, notas em `brain/Inbox`, Shelf, clima e Google Agenda (OAuth opcional) · 5. Lançador e monitor de sistema.

Pendentes: "Perguntar ao Claude" (precisa de chave de API e onde guardá-la), pílulas de dev (Vercel e GitHub),
brilho da tela e espelhar notificações (após teste de viabilidade).
