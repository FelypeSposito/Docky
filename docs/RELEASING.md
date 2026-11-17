# Como publicar uma versão

1. Suba a versão nos três lugares: `package.json`, `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`.
2. Faça o commit no `main` e crie a tag: `git tag v0.3.0 && git push origin v0.3.0`.
3. O workflow **Release** gera o instalador e abre um rascunho em *Releases*. Confira e clique em **Publish**.
4. A partir daí, quem tem o Docky com "Procurar atualizações" ligado vê o aviso em Configurações, Geral, Sobre
   (em até 12 horas), com o botão para baixar.

O workflow **CI** roda em cada push e pull request: tipos, testes da interface (vitest) e testes do Rust.

## Atualização automática (depois)

Hoje o Docky avisa e leva até a página da versão; quem instala é você. Para ele baixar e instalar sozinho, é preciso
assinar as atualizações (plugin `tauri-plugin-updater`):

1. Gere o par de chaves uma vez, no seu PC: `npx tauri signer generate -w %USERPROFILE%\.tauri\docky.key`.
   A chave privada nunca vai para o repositório.
2. Em *Settings → Secrets and variables → Actions* do GitHub, crie `TAURI_SIGNING_PRIVATE_KEY` (o conteúdo do arquivo)
   e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (a senha, se usou uma).
3. Ponha a chave pública em `plugins.updater.pubkey` do `tauri.conf.json`, com o endpoint
   `https://github.com/FelypeSposito/Docky/releases/latest/download/latest.json`, e ligue
   `bundle.createUpdaterArtifacts`.
