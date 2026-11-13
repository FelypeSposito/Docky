# Docky privacy policy

Last updated: 2026-11-02

Docky is a desktop app for Windows 11, developed by Felype Sposito for personal use. This page explains what the
app does with your data. The short version: everything stays on your computer.

## What Docky does not do

- It has no server, no account system, no analytics and no telemetry.
- It does not send your data to the developer or to any third party for advertising or any other purpose.
- It does not sell, share or transfer Google user data.

## Google Calendar (optional)

Docky can show your upcoming events if you connect your Google account in Settings → Integrações.

- **Scope requested:** `https://www.googleapis.com/auth/calendar.readonly` (read-only access to your calendars).
- **What is read:** the titles, times, locations and meeting links of the events in the next 36 hours of your primary
  calendar. Docky never creates, edits or deletes anything.
- **Where it goes:** straight from Google to the app running on your PC. Events are kept in memory only, to draw the
  Agenda page, and are never written to disk or sent anywhere else.
- **Credentials:** the OAuth client secret and the refresh token are stored in the Windows Credential Manager, not in
  a file. You can remove them at any time with the Desconectar button, or by revoking Docky at
  <https://myaccount.google.com/permissions>.
- Docky's use of information received from Google APIs adheres to the
  [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
  including the Limited Use requirements.

## Other network requests

- **Lyrics:** the title, artist and duration of the track playing are sent to [LRCLIB](https://lrclib.net) to find synced lyrics.
- **Weather:** the city you type in Settings is sent to [Open-Meteo](https://open-meteo.com) to get its coordinates and forecast.
- **Automatic shortcut icons (can be turned off in Settings → Atalhos):** when a shortcut has no icon, Docky asks
  [jsDelivr](https://www.jsdelivr.com) (the open [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) library)
  for an image named after the app, and, for websites, Google's favicon service for the site's address. Only that
  name or web address is sent, once per shortcut; the image is saved in your icons folder (by default
  `Documents\Docky\icons`) and never requested again. If nothing is found, Docky uses the icon Windows already shows
  for the installed app, with no request at all.

No other request is made.

**Installed apps and games (only after you click Permitir in Settings → Atalhos):** to suggest shortcuts, Docky reads
the Start Menu, the Microsoft Store app list, the Steam library files and the Epic Games launcher manifests on your PC.
This reading never leaves your computer, and you can turn it off at any time with "Não procurar". Notes, Shelf files, Focus timers and settings stay on your computer; the Claude Code
integration only talks to a local server on `127.0.0.1`.

## Contact

Questions or removal requests: contact the developer through his GitHub profile, <https://github.com/FelypeSposito>.

---

# Política de privacidade do Docky

O Docky é um app de desktop para Windows 11, feito por Felype Sposito para uso pessoal. Ele não tem servidor, conta,
análise de uso nem telemetria, e não envia seus dados ao desenvolvedor nem a terceiros.

- **Google Agenda (opcional):** com o escopo somente leitura `calendar.readonly`, o app lê os eventos das próximas
  36 horas da sua agenda principal. Eles ficam só na memória do app, para desenhar a página Agenda, e nunca são
  gravados em disco nem enviados para outro lugar. A chave secreta e o token de renovação ficam no Gerenciador de
  Credenciais do Windows. Para apagar, use Desconectar nas configurações ou revogue o acesso em
  <https://myaccount.google.com/permissions>.
- **Letras:** título, artista e duração da faixa vão para o LRCLIB. **Clima:** a cidade que você digitou vai para o Open-Meteo.
- **Ícones automáticos (dá para desligar em Configurações → Atalhos):** para um atalho sem ícone, o Docky pede ao jsDelivr
  (biblioteca aberta dashboard-icons) uma imagem com o nome do app e, para sites, ao serviço de favicons do Google o
  endereço do site. Só esse nome ou endereço é enviado, uma vez por atalho; a imagem fica na sua pasta de ícones.
- **Apps e jogos instalados (só depois de clicar em Permitir, em Configurações → Atalhos):** para sugerir atalhos, o
  Docky lê o Menu Iniciar, os apps da Loja, a biblioteca da Steam e os manifestos da Epic Games. Nada disso sai do
  computador, e dá para desligar em "Não procurar".
- Notas, arquivos do Shelf, timers e configurações ficam no seu computador.
- Contato: pelo perfil do desenvolvedor no GitHub, <https://github.com/FelypeSposito>.
