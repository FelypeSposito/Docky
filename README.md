# Docky

Uma ilha dinâmica para o Windows 11: uma pílula no topo da tela com hora, mídia com letras sincronizadas,
atividade do Claude Code, timers, notas e mais. Uso pessoal por enquanto, com arquitetura pensada para virar produto.

## Instalar

Baixe o `Docky_x.y.z_x64-setup.exe` mais recente em **Releases** e execute. A instalação é só para o seu usuário (não
pede administrador) e o Docky abre sozinho no fim.

### Onde roda

| Windows | Funciona? |
| --- | --- |
| Windows 11 (x64) | Sim, tudo. É onde o Docky é feito e testado. |
| Windows 10 versão 1903 ou mais nova (x64) | Sim, tudo. O visual é o mesmo, só sem os cantos arredondados do 11 nas janelas. |
| Windows 10 1809 | Quase tudo: a pílula de chamada não aparece (o Windows ainda não registrava o uso do microfone). |
| Windows 10 anterior ao 1809 | Não: falta o controle de mídia do Windows (música, letras). |
| Windows 11 em ARM | Deve rodar pela emulação x64 do Windows; não testado. |
| Windows 7 e 8.1, macOS, Linux | Não. |

O WebView2 (o motor das telas) já vem no Windows 11 e nas versões atualizadas do 10; se faltar, o instalador baixa.
Os hooks do Claude Code usam o `curl`, que vem no Windows desde o 10 versão 1803.

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

Música (com letra sincronizada), Foco (Pomodoro e contador livre), Notas (fixar, colorir e excluir para a Lixeira), Shelf (pastas de destino e a Lixeira do Windows),
Agenda (clima com chuva, sensação, umidade, vento, UV e sol), Atalhos (apps, jogos, pastas, sites e grupos, com ícone
próprio e confirmação ao abrir), e Claude. Com os olhinhos desligados, o Clawd aparece no lugar deles enquanto o
Claude Code trabalha. Com sessões abertas e nada rodando, a página Claude mostra o Clawd conforme a hora: dormindo
de madrugada, tomando café de manhã e jogando à noite. Quando um turno acaba, cada sessão diz o que ele fez: "editou 4 arquivos em
3 min" ou "respondeu em 42 s". O aviso na pílula vem a cada sessão que termina, com o nome do projeto, mesmo
com outras ainda rodando.

A ilha fica no centro do topo ou em qualquer ponto dele, até encostada num canto: arraste pela pílula (ou pelo
cabeçalho, com ela aberta) ou escolha em Configurações, Aparência. Duplo clique numa parte vazia a traz de volta ao
centro.

Quando um fone Bluetooth conecta, a pílula mostra a carga dele por alguns segundos, e avisa de novo quando ela fica em
20%. Vale para fones que informam a carga ao Windows (a mesma que aparece em Configurações, Bluetooth).

Lembretes rápidos: no campo da nota, comece com um tempo, como "15 min tirar a pizza", "em 2h ligar pro banco" ou
"às 18h buscar as crianças", e o Enter cria um lembrete (Shift+Enter salva como nota). Os lembretes esperando aparecem
no começo das Notas, com um × para cancelar, e na hora a pílula mostra o lembrete com um toque. Eles continuam depois
de reiniciar o PC; um que venceu com o Docky fechado aparece assim que ele abre.

A página Copiados guarda os últimos 10 textos que você copiou; um clique põe um deles de volta na área de
transferência. O histórico fica só na memória (some quando o Docky fecha) e ignora o que os gerenciadores de senha
marcam como privado, como o histórico do Windows (Win+V) faz. Dá para desligar em Configurações, Geral.

Em Configurações, Aparência, a ilha pode seguir a cor da capa da música ou ficar sempre numa cor (rosa, âmbar, verde,
azul, lilás ou grafite), com o brilho ambiente mais forte ou mais fraco, com ou sem a borda de vidro, e o relógio em
24 ou 12 horas.

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

Na primeira vez que o Docky abre, a ilha se abre sozinha com um cartão de boas-vindas: como ela abre, as teclas que
funcionam de qualquer lugar e onde criar atalhos.

Em Configurações, Aparência, Material, a ilha pode ser preta ou de **vidro líquido**, inspirado no Liquid Glass da
Apple: o fundo aparece escurecido por trás, a luz da borda acompanha o mouse, a ilha se acende e flexiona ao toque,
estica como gel quando muda de forma e os avisos aparecem a partir da luz. No Windows a janela não enxerga a área de
trabalho, então o vidro escurece o fundo mas não o distorce. "Reduzir movimento" desliga a parte elástica.

## Idiomas

A interface fala português (Brasil) e inglês. Em Configurações, Geral, Idioma, "Automático" segue o idioma do Windows.
O texto é escrito em português e a própria frase é a chave: `t("Abrir no GitHub")`. As traduções ficam em
`src/i18n/en.ts`; uma frase sem tradução aparece em português, então nada quebra. Para um idioma novo, copie o `en.ts`
e acrescente o código em `src/i18n/index.ts`.

## Licença

MIT: veja [LICENSE](LICENSE). As animações do Clawd vêm do clawd-pet, também MIT (`src/assets/clawd/LICENSE`).

## Desinstalar

O desinstalador tira os hooks do Docky do `~/.claude/settings.json` (só os do Docky; os seus ficam). As
configurações ficam em `%APPDATA%\com.docky.desktop`, e o registro de erros em `%LOCALAPPDATA%\com.docky.desktop\logs`
(Configurações, Geral, Sobre, Registros).

## Teclas globais

Ctrl+Alt+D abre e fecha a ilha, Ctrl+Alt+←/→ trocam de página, Ctrl+Alt+N abre a nota rápida e Ctrl+Alt+M muta ou
ativa o microfone (a pílula avisa). Na página Som, uma linha abaixo do volume geral escolhe a saída de som e muta o
microfone.

## Fases

Feitas: 0. Protótipo visual · 1. Base: janela, tamanhos, hora, olhos, bateria, bandeja, início com o Windows ·
2. Mídia e letras (LRCLIB), volume, páginas e dock · 3. Atividade do Claude Code com aprovações ·
4. Foco, notas em `brain/Inbox`, Shelf, clima e Google Agenda (OAuth opcional) · 5. Lançador e monitor de sistema.

Pendentes: "Perguntar ao Claude" (precisa de chave de API e onde guardá-la), pílulas de dev (Vercel e GitHub),
brilho da tela e espelhar notificações (após teste de viabilidade).
