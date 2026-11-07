# Docky v0.1.0

A primeira versão publicada do Docky: uma ilha dinâmica para o Windows 11, uma pílula no topo da tela com hora, música
com letra sincronizada, atividade do Claude Code, timers, notas, agenda, atalhos e uso do sistema.
*The first public build of Docky: a Dynamic Island for Windows 11.*

## Baixar / Download

**`Docky_0.1.0_x64-setup.exe`** (2,4 MB, Windows 10/11 64 bits)

SHA-256: `2a079deca65e2b298a6a5fa060f24c83fb33be0a5c3b7a96b888ee7c149625b9`

## Instalar

1. Baixe o instalador abaixo e execute. A instalação é só para o seu usuário (não pede administrador).
2. O instalador ainda **não é assinado digitalmente**, então o Windows SmartScreen pode mostrar "O Windows protegeu o
   seu PC". Clique em **Mais informações → Executar assim mesmo**.
3. No fim, o Docky abre sozinho no topo da tela. Passe o mouse (ou use `Ctrl+Alt+D`) para abrir a ilha.

Para abrir junto com o Windows, ligue a opção em Configurações → Geral. Para desinstalar: Configurações do Windows →
Aplicativos. Suas configurações ficam em `%APPDATA%\com.docky.desktop`.

## O que tem

- **Música** com letra sincronizada (LRCLIB e NetEase) e a cor do brilho vinda da capa.
- **Claude Code**: veja o que ele está fazendo, aprove ou negue permissões pela ilha (opcional, instala hooks só com o seu aval).
- **Foco** (Pomodoro e contador livre), **Notas** (fixar, excluir, arrastar), **Shelf** (arraste arquivos do Explorer
  para suas pastas), **Agenda** (Google Agenda opcional, somente leitura, e clima), **Sistema** (CPU, memória, GPU).
- **Atalhos** com grupos, sugestões de apps instalados e **ícones automáticos**; arraste tudo para reordenar.
- Várias telas, atalhos de teclado globais, olhinhos que seguem o cursor.

## Privacidade

Sem servidor, conta ou telemetria. Os pedidos de rede (letras, clima, ícones de atalhos e, se você ligar, o Google
Agenda) estão listados em [PRIVACY.md](../PRIVACY.md).

## Limitações conhecidas

- Instalador sem assinatura digital (aviso do SmartScreen).
- Só Windows. O Google Agenda precisa de um ID de cliente do Google Cloud criado por você (passo a passo em Configurações → Integrações).
- É a primeira versão: bugs e pedidos são bem-vindos nas Issues.
