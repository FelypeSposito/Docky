//! Clima pelo Open-Meteo (gratuito, sem chave): primeiro acha a cidade, depois pede a previsão.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Weather {
    pub city: String,
    pub temperature: f64,
    /// Código WMO do tempo (0 = limpo, 61 = chuva, 95 = tempestade…).
    pub code: u32,
    pub max: f64,
    pub min: f64,
    /// Temperaturas das próximas horas.
    pub hourly: Vec<f64>,
}

fn get_json(url: &str) -> Result<Value, String> {
    let mut response = ureq::get(url).header("User-Agent", "Docky/0.1").call().map_err(|e| e.to_string())?;
    let body = response.body_mut().read_to_string().map_err(|e| e.to_string())?;
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

fn encode(text: &str) -> String {
    text.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// `hour` é a hora local (0 a 23) da cidade; a lista horária do Open-Meteo começa à meia-noite.
pub fn parse_forecast(city: &str, forecast: &Value, hour: usize) -> Option<Weather> {
    let number = |v: &Value| v.as_f64();
    let hourly: Vec<f64> = forecast["hourly"]["temperature_2m"]
        .as_array()?
        .iter()
        .skip(hour)
        .step_by(2)
        .take(5)
        .filter_map(number)
        .collect();
    Some(Weather {
        city: city.to_string(),
        temperature: number(&forecast["current"]["temperature_2m"])?,
        code: forecast["current"]["weather_code"].as_u64()? as u32,
        max: number(&forecast["daily"]["temperature_2m_max"][0])?,
        min: number(&forecast["daily"]["temperature_2m_min"][0])?,
        hourly,
    })
}

#[tauri::command]
pub async fn weather(city: String) -> Result<Weather, String> {
    let city = city.trim().to_string();
    if city.is_empty() {
        return Err("defina a cidade em Configurações".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let places = get_json(&format!(
            "https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language=pt&format=json",
            encode(&city)
        ))?;
        let place = places["results"].get(0).ok_or_else(|| format!("não encontrei a cidade \"{city}\""))?;
        let (lat, lon) = (place["latitude"].as_f64(), place["longitude"].as_f64());
        let (Some(lat), Some(lon)) = (lat, lon) else {
            return Err("resposta de geocodificação inválida".to_string());
        };
        let name = place["name"].as_str().unwrap_or(&city).to_string();

        let forecast = get_json(&format!(
            "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,weather_code&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto"
        ))?;
        // O horário atual da cidade vem no próprio JSON ("2026-10-31T15:00").
        let hour = forecast["current"]["time"]
            .as_str()
            .and_then(|t| t.get(11..13))
            .and_then(|h| h.parse().ok())
            .unwrap_or(0);
        parse_forecast(&name, &forecast, hour).ok_or_else(|| "resposta do clima inválida".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn le_a_previsao_do_open_meteo() {
        let hours: Vec<f64> = (0..24).map(|h| 10.0 + h as f64).collect();
        let forecast = json!({
            "current": { "temperature_2m": 24.3, "weather_code": 2, "time": "2026-10-31T15:00" },
            "hourly": { "temperature_2m": hours },
            "daily": { "temperature_2m_max": [27.0], "temperature_2m_min": [18.0] }
        });
        let weather = parse_forecast("Recife", &forecast, 15).unwrap();
        assert_eq!(weather.temperature, 24.3);
        assert_eq!(weather.code, 2);
        assert_eq!((weather.max, weather.min), (27.0, 18.0));
        assert_eq!(weather.hourly, vec![25.0, 27.0, 29.0, 31.0, 33.0]);
    }

    #[test]
    fn resposta_incompleta_vira_none() {
        assert!(parse_forecast("X", &json!({}), 0).is_none());
    }

    #[test]
    fn codifica_a_cidade_para_a_url() {
        assert_eq!(encode("São Paulo"), "S%C3%A3o%20Paulo");
    }
}
