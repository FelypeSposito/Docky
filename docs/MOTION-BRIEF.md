# Docky — brief para o vídeo de motion

Documento de base do projeto, do design e do movimento do Docky, escrito para quem vai animar o vídeo de apresentação
(Claude Enterprise / Motion). Tudo aqui foi tirado do código e do protótipo: os números são os reais.

---

## 1. O que é

**Docky** é uma **ilha dinâmica para o Windows 11**: uma pílula preta colada no topo central da tela, no estilo do
notch do iPhone, que mostra hora, música com letra sincronizada, o que o Claude Code está fazendo, timers, notas,
agenda, atalhos e uso do sistema. Passou o mouse, ela cresce; saiu, ela volta a ser uma pílula.

- **Ideia em uma frase:** "o canto da tela que estava vazio agora trabalha por você".
- **Personalidade:** uma ilha viva. Ela tem **olhos** que seguem o cursor, piscam, dormem quando você some e se
  arregalam quando algo importante acontece. É o mascote e o único elemento "fofo" do visual.
- **Público do vídeo:** gente de tecnologia e produtividade, usuários de Windows e de Claude Code.
- **Tom:** calmo, preciso, um pouco brincalhão (os olhos). Sem exagero, sem neon gritante.

### Pilares (o que o vídeo precisa passar)

1. **Vive no topo da tela**, sem atrapalhar: some quando um jogo ou vídeo está em tela cheia.
2. **Mostra o que importa na hora**: a música com a letra passando, o Claude trabalhando, o timer acabando.
3. **Resolve sem abrir nada**: atalhos, notas, arrastar arquivo para uma pasta, trocar de página no dock.
4. **Tudo fica no seu computador** (sem conta, sem telemetria).

---

## 2. Inspiração de design

- **Dynamic Island da Apple:** pílula preta que muda de forma conforme o estado, com **molas** (movimento físico, um
  leve quique no crescimento) e conteúdo que entra e sai com **desfoque + escala**, nunca de corte seco.
- **Notch do MacBook, versão Windows 11:** a ilha é presa à borda superior, com **"orelhas" côncavas** de 16 px que
  ligam a pílula à borda da tela, como se a tela tivesse sido recortada.
- **Vidro escuro:** borda fina de 1 px em degradê, **apagada no topo e acesa embaixo** (a luz vem de baixo para cima),
  mais um brilho ambiente que sobe do fundo.
- **Cor da música:** o brilho ambiente pega a cor da capa do álbum que está tocando (as cores mais vivas), então a ilha
  muda de clima a cada faixa. Sem música, o brilho padrão é rosa → roxo.
- **Minimalismo de ícones:** traço fino, uma só espessura, cantos arredondados, sem preenchimento. Logos coloridos só
  nos atalhos de apps.
- **Referência viva:** `prototype/docky-visual-v2-PROTOTYPE.html` é o protótipo aprovado de visual e movimento. Abra
  no navegador para ver o comportamento de referência.

---

## 3. Sistema visual

### Cores

| Uso | Valor |
|---|---|
| Corpo da ilha | `#000000` (preto puro) |
| Texto principal | `#FFFFFF` |
| Texto secundário | `rgba(255,255,255,0.62)` |
| Texto terciário / dicas | `rgba(255,255,255,0.36)` |
| Brilho padrão (par) | `#FF5C7A` (rosa) → `#7A3CFF` (roxo) |
| Cor do Claude | `#D97757` (laranja terroso) |
| Cards (tiles) | degradê de branco 11% → 5% sobre o preto, borda interna de 1 px a 7,5% |
| Acento de interface | vem da capa da música; padrão `#FF5C7A` |

Os cards e a ilha nunca têm cor sólida colorida: a cor aparece só no **brilho de fundo**, nos **ícones** e em **um
elemento de destaque por tela** (um botão, um anel, uma barra).

### Tipografia

- **Inter** (fallback Segoe UI Variable). Corpo 13 px / 1,35; nomes de atalho 12,5 px semibold (600); títulos de
  card 13 px semibold; legendas 10–11 px.
- **Números tabulares** (`tabular-nums`) em relógio, timers e tempos de música, para os dígitos não dançarem.
- **JetBrains Mono** só no comando que aparece no card de pedido de permissão do Claude (fonte de código).

### Forma e profundidade

- Ilha: cantos de baixo **18 px**, cantos de cima retos (colada na borda). Sombra grande e suave só quando aberta.
- Cards: raio **18 px**; ícone de atalho com raio **8 px** (26 px de lado).
- **Grão** de ruído por cima (7% de opacidade, mistura "overlay"): tira o aspecto chapado do preto.
- **Brilho ambiente:** duas manchas de cor desfocadas (26 px de blur) no fundo, que **derivam devagar** (13 s,
  vai e volta) e são mascaradas para só aparecer na metade de baixo.

### Tamanhos da ilha (pixels lógicos)

| Estado | Largura × altura | O que mostra |
|---|---|---|
| Repouso | 214 × 36 | olhos + hora |
| Letra | 410 × 36 | linha atual da letra, com equalizador |
| Carregador | 252 × 36 | raio + porcentagem da bateria |
| Volume | 270 × 36 | ícone, barra e número |
| Timer / "concluído" | 262 × 36 | check + mensagem |
| Claude trabalhando | 380 × 36 | projeto · "escrevendo código · 02:35" + anel girando |
| Claude pedindo permissão | 456 × 142 | card com o comando e Permitir / Negar |
| Aberta | 500 × 244 | página + dock |
| Aberta, versão grande | 640 × 400 | Agenda, Notas e Atalhos em tela maior |

Prioridade quando vários estados disputam a pílula: **pedido do Claude** > ilha aberta pela pessoa > avisos curtos
(carregador, volume, timer) > Claude trabalhando > letra > relógio.

---

## 4. Linguagem de movimento

> Regra de ouro: **tudo se move como um objeto físico**. Cresce com mola, encolhe sem quicar, entra desfocado e
> assenta nítido.

### Curvas e tempos reais

- **Crescer** (pílula → aberta): mola com resposta **0,46 s** e amortecimento **0,76** (quica um pouco, "estufa").
- **Encolher:** resposta **0,40 s**, amortecimento **0,88** (quase sem quique).
- **Movimento reduzido:** resposta 0,26 s, amortecimento 1 (sem quique, para acessibilidade).
- **Curva CSS padrão:** `cubic-bezier(0.22, 1, 0.36, 1)` (saída suave, "ease-out expo"), usada em quase tudo.
- **Troca de conteúdo (camadas):** a camada que sai faz **0,16 s** de fade + desfoque; a que entra faz opacidade e
  desfoque em **0,3 s** e escala de **0,965 → 1** em **0,5 s**. Desfoque inicial de **9 px**.
- **Brilho ambiente:** deriva contínua de 13 s (alternando), transição de cor de 0,9 s quando a música troca.
- **Selo do Claude** (canto da pílula de letra): um raio que **gira a cada 6 s** (linear) e **pulsa** a opacidade
  de 0,5 a 1 em 1,4 s. O anel de "trabalhando" gira em 0,8 s (linear).
- **Dock — reordenar:** segurar **280 ms** e arrastar; o botão cresce **1,08×**, os outros deslizam em **320 ms**.
- **Grade de atalhos / notas / Shelf — reordenar:** o item pega **1,06×** e sombra, os outros deslizam em **260 ms**;
  ao soltar, assenta no lugar.

### Os olhos (o mascote)

- Dois olhos brancos com pupila, no canto esquerdo da pílula.
- **Seguem o cursor** pela tela inteira, com leve atraso, e **piscam** em intervalos aleatórios (1,7 s a 5 s).
- **Humores:** `normal` (relaxado), `wide` (arregalado: carregador, timer, avisos), `work` (varre de um lado a outro,
  "lendo código", quando o Claude trabalha) e `ask` (olha para o card de permissão; **balança a cabeça** quando você nega).
- **Dormem** depois de um tempo parado, e **fecham e somem** (animação de pálpebra) quando a ilha é desligada.

### O que nunca fazer

- Corte seco, aparecer sem desfoque ou sem escala.
- Quicar na saída (só no crescimento).
- Cor chapada ou saturada fora do brilho/ícones.
- Mais de um destaque colorido por tela.

---

## 5. As páginas (o que mostrar)

O dock embaixo troca de página; os ícones são de traço fino.

| Página | Destaque visual | Para filmar |
|---|---|---|
| **Música** | capa, título, barra de progresso, controles; **letra sincronizada** (linha atual brilhando) | a cor do brilho mudando com a capa |
| **Foco** | anel do Pomodoro e contador livre | o anel fechando e o aviso "Foco concluído" |
| **Notas** | cartões com o texto; pino para fixar, lixeira com confirmação | digitar e dar Enter: a nota nova entra no topo |
| **Shelf** | área de soltar + pastas de destino | **arrastar arquivos do Explorer** para a ilha e soltar numa pasta |
| **Agenda** | eventos do Google Agenda + clima (chuva, sensação, UV, sol) | tela grande com 4 colunas |
| **Atalhos** | grade de apps com ícones coloridos, grupos que abrem vários apps de uma vez | busca, grupo "Trabalho" abrindo 3 apps; arrastar ícones como na tela inicial do iPhone |
| **Sistema** | três anéis: CPU, Memória, GPU | os anéis animando; arrastar para reordenar |
| **Claude** | sessões do Claude Code, permissões | o card de permissão aparecendo com os olhos "ask" |

### Momentos de assinatura (os melhores planos)

1. **Pílula → aberta:** passar o mouse e a ilha estufar com a mola, o conteúdo assentando do desfoque.
2. **Olhos acompanhando o cursor** atravessando a tela.
3. **Letra de música** trocando de linha com desfoque suave, e o brilho mudando de cor com a capa.
4. **Claude trabalhando:** a pílula alarga, olhos varrendo, anel girando; no fim, aviso de conclusão.
5. **Pedido de permissão** do Claude: a ilha cresce para 456 × 142, olhos olhando o card; "Negar" faz os olhos balançarem.
6. **Arrastar arquivos** para a Shelf: a ilha abre sozinha ao detectar o arrasto.
7. **Reordenar atalhos** arrastando, os vizinhos deslizando.
8. **Ícones automáticos:** adicionar um app (ex.: Blender) e o ícone aparecer sozinho no atalho.

---

## 6. Roteiro sugerido (30 a 45 s)

Formato **16:9 (1920 × 1080)**, fundo de desktop **escuro e desfocado** (papel de parede de gradiente roxo-azulado),
a ilha ampliada **2,5× a 3×** no topo central. Sem voz; música eletrônica leve; texto curto em tela.

| Tempo | Cena | Texto em tela |
|---|---|---|
| 0–3 s | Tela vazia, o canto superior. A pílula aparece (desfoque → nítido); os olhos abrem e piscam. | **Docky** |
| 3–8 s | Cursor passa; os olhos seguem. A ilha estufa para a página Música; a letra rola; o brilho vira a cor da capa. | Sua música, com a letra |
| 8–14 s | Troca para o Claude: pílula alarga, olhos varrendo, anel girando. Surge o card de permissão; Permitir. | O Claude Code, sempre à vista |
| 14–20 s | Foco: anel fecha, aviso "Foco concluído", olhos arregalados. | Foco sem sair do que faz |
| 20–27 s | Arrasta arquivos do Explorer para a Shelf e solta numa pasta. | Arraste e pronto |
| 27–34 s | Atalhos: busca, grupo "Trabalho" abre 3 apps; reordena ícones arrastando; adiciona um app e o ícone aparece. | Atalhos que se organizam sozinhos |
| 34–40 s | Todas as páginas passando no dock; Sistema com os 3 anéis. | Tudo no topo da tela |
| 40–45 s | A ilha volta a pílula, olhos piscam e dormem. Logo. | **Docky** · para Windows 11 |

**Ritmo:** cortes a cada 3–6 s, sempre começando em um movimento (a mola) e terminando em repouso. Mantenha os
olhos em tela o máximo possível: são o fio condutor.

---

## 7. Textos prontos

- **Tagline (pt-BR):** "A ilha dinâmica do Windows 11." · "O canto da tela que trabalha por você."
- **Tagline (EN):** "A Dynamic Island for Windows 11." · "The corner of your screen, finally working."
- **Legendas curtas:** Música com letra · Claude Code à vista · Foco · Arraste arquivos · Atalhos e grupos · Notas ·
  Agenda e clima · Sistema.
- **Chamada final:** "Docky. Gratuito para uso pessoal." (ajuste conforme a distribuição)

---

## 8. Base técnica (para contexto)

- **Stack:** Tauri 2 (Rust) + React 19 + TypeScript + Vite; animações de geometria com molas próprias
  (`src/lib/spring.ts`); testes com Vitest e `cargo test`.
- **Janela:** painel transparente, sem borda, fixo no topo central de cada monitor (uma ilha por tela). O Rust lê o
  cursor global e só deixa a janela receber cliques com o mouse sobre a ilha, o resto é "atravessável".
- **Integrações:** Claude Code (hooks locais, aprovações pela ilha), Google Agenda (opcional, só leitura), letras
  (LRCLIB e NetEase), clima (Open-Meteo), ícones (dashboard-icons e favicons, uma vez por atalho).
- **Privacidade:** sem servidor, conta ou telemetria; notas, arquivos e configurações ficam no computador
  (`PRIVACY.md`).
- **Atalhos de teclado:** `Ctrl+Alt+D` abre/fecha, `Ctrl+Alt+←/→` troca de página, `Ctrl+Alt+N` nota rápida.

### Como gravar as cenas

- **App completo:** `npm run tauri dev` (precisa de Rust e Build Tools do Visual Studio) ou o `docky.exe` de release.
- **Só o visual, no navegador:** `npm run dev` e abrir `http://localhost:1420`; `?w=settings` para as configurações.
  No console há atalhos de encenação: `__docky.plug(true)` (carregador), `__docky.claude("UserPromptSubmit")` (Claude
  trabalhando), `__docky.ask("pnpm build")` (pedido de permissão), `__docky.drop([...])` (arquivos soltos),
  `__docky.hotkey("toggle")`.
- **Captura:** gravar a tela em 60 fps; para o Dynamic Island ficar nítido, use zoom no vídeo em vez de aumentar a
  janela (a ilha tem resolução de tela).

### Assets no repositório

- Protótipo de referência: `prototype/docky-visual-v2-PROTOTYPE.html`.
- Biblioteca de ícones minimalistas: `src/launcher/iconLibrary.tsx` (31 desenhos, referência `lib:nome`).
- Estilos da ilha e tokens: `src/island/island.css`, `src/index.css`, tamanhos em `src/island/modes.ts`.

---

## 9. Para onde vai

Feito: ilha, mídia e letras, Claude Code com aprovações, Foco, Notas, Shelf, clima, Google Agenda, atalhos com grupos e
ícones automáticos, monitor de sistema, várias telas. Próximos passos: "Perguntar ao Claude", pílulas de dev (Vercel
e GitHub), brilho da tela e espelhar notificações. A intenção é **distribuir para algumas pessoas** antes de virar produto.
