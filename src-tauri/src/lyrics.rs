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

#[cfg(test)]
mod tests {
    use super::allowed;

    #[test]
    fn aceita_so_get_e_search() {
        assert!(allowed("get?track_name=a"));
        assert!(allowed("search?track_name=a"));
        assert!(!allowed("../admin"));
        assert!(!allowed("publish"));
    }
}
