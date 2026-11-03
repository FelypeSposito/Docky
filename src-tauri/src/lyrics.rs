//! Acesso ao LRCLIB (letras sincronizadas, gratuito e sem chave). O LRCLIB não envia cabeçalhos CORS,
//! então o frontend não consegue chamá-lo direto; o pedido passa por aqui.

/// Só estes dois caminhos da API são aceitos, para o comando não virar um proxy genérico.
fn allowed(path: &str) -> bool {
    path.starts_with("get?") || path.starts_with("search?")
}

/// Devolve o corpo da resposta, ou `None` quando o LRCLIB responde 404 (faixa sem letra).
#[tauri::command]
pub async fn lrclib(path: String) -> Result<Option<String>, String> {
    if !allowed(&path) {
        return Err("caminho não permitido".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("https://lrclib.net/api/{path}");
        match ureq::get(&url).header("User-Agent", "Docky/0.1").call() {
            Ok(mut response) => response
                .body_mut()
                .read_to_string()
                .map(Some)
                .map_err(|e| e.to_string()),
            Err(ureq::Error::StatusCode(404)) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Fonte reserva, com bem mais música brasileira que o LRCLIB. É uma API pública não oficial do NetEase Music
/// (sem conta nem chave); só a busca e a letra são aceitas.
fn netease_allowed(path: &str) -> bool {
    path.starts_with("api/search/get?") || path.starts_with("api/song/lyric?")
}

/// Devolve o corpo da resposta do NetEase (JSON), ou um erro se o serviço não responder.
#[tauri::command]
pub async fn netease(path: String) -> Result<String, String> {
    if !netease_allowed(&path) {
        return Err("caminho não permitido".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("https://music.163.com/{path}");
        ureq::get(&url)
            .header("User-Agent", "Mozilla/5.0")
            .header("Referer", "https://music.163.com")
            .call()
            .map_err(|e| e.to_string())?
            .body_mut()
            .read_to_string()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{allowed, netease_allowed};

    #[test]
    fn aceita_so_get_e_search() {
        assert!(allowed("get?track_name=a"));
        assert!(allowed("search?track_name=a"));
        assert!(!allowed("../admin"));
        assert!(!allowed("publish"));
    }

    #[test]
    fn netease_so_busca_e_letra() {
        assert!(netease_allowed("api/search/get?s=a&type=1"));
        assert!(netease_allowed("api/song/lyric?id=1&lv=1"));
        assert!(!netease_allowed("api/user/account"));
        assert!(!netease_allowed("../api/search/get?s=a"));
    }
}
