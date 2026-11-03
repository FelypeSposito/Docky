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

No other request is made. Notes, Shelf files, Focus timers and settings stay on your computer; the Claude Code
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
- Notas, arquivos do Shelf, timers e configurações ficam no seu computador.
- Contato: pelo perfil do desenvolvedor no GitHub, <https://github.com/FelypeSposito>.
