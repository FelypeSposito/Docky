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
    /// Temperaturas das próximas horas (de 2 em 2, para o gráfico pequeno).
    pub hourly: Vec<f64>,
    /// Sensação térmica, umidade (%), vento (km/h), chuva agora (mm) e índice UV máximo do dia.
    pub feels_like: Option<f64>,
    pub humidity: Option<f64>,
    pub wind_kmh: Option<f64>,
    pub precipitation_mm: Option<f64>,
    pub uv_max: Option<f64>,
    /// Maior chance de chuva do dia (%).
    pub rain_max: Option<f64>,
    /// Nascer e pôr do sol, "05:42" e "18:21".
    pub sunrise: Option<String>,
    pub sunset: Option<String>,
    /// As próximas 12 horas, uma a uma, com a chance de chuva de cada.
    pub hours: Vec<HourPoint>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HourPoint {
    /// Hora do dia (0 a 23).
    pub hour: u32,
    pub temp: f64,
    /// Chance de chuva (%).
    pub rain: f64,
    pub code: u32,
}

fn get_json(url: &str) -> Result<Value, String> {
    let mut response = ureq::get(url).header("User-Agent", "Docky/0.1").call().map_err(|e| e.to_string())?;
    let body = response.body_mut().read_to_string().map_err(|e| e.to_string())?;
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

/// Codifica um texto para ir dentro de uma URL.
pub fn encode(text: &str) -> String {
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
    let series = |key: &str| -> Vec<Option<f64>> {
        forecast["hourly"][key].as_array().map(|a| a.iter().skip(hour).take(12).map(|v| v.as_f64()).collect()).unwrap_or_default()
    };
    let (temps, rains, codes) = (series("temperature_2m"), series("precipitation_probability"), series("weather_code"));
    let hours = temps
        .iter()
        .enumerate()
        .filter_map(|(i, temp)| {
            Some(HourPoint {
                hour: ((hour + i) % 24) as u32,
                temp: (*temp)?,
                rain: rains.get(i).copied().flatten().unwrap_or(0.0),
                code: codes.get(i).copied().flatten().unwrap_or(0.0) as u32,
            })
        })
        .collect();
    // "2026-10-31T05:42" vira "05:42".
    let clock = |value: &Value| value.as_str().and_then(|t| t.get(11..16)).map(str::to_string);
    Some(Weather {
        city: city.to_string(),
        temperature: number(&forecast["current"]["temperature_2m"])?,
        code: forecast["current"]["weather_code"].as_u64()? as u32,
        max: number(&forecast["daily"]["temperature_2m_max"][0])?,
        min: number(&forecast["daily"]["temperature_2m_min"][0])?,
        hourly,
        feels_like: number(&forecast["current"]["apparent_temperature"]),
        humidity: number(&forecast["current"]["relative_humidity_2m"]),
        wind_kmh: number(&forecast["current"]["wind_speed_10m"]),
        precipitation_mm: number(&forecast["current"]["precipitation"]),
        uv_max: number(&forecast["daily"]["uv_index_max"][0]),
        rain_max: number(&forecast["daily"]["precipitation_probability_max"][0]),
        sunrise: clock(&forecast["daily"]["sunrise"][0]),
        sunset: clock(&forecast["daily"]["sunset"][0]),
        hours,
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
            "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max&forecast_days=2&timezone=auto"
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
        // Sem os campos novos, o resto continua valendo.
        assert_eq!(weather.feels_like, None);
        assert_eq!(weather.hours.len(), 9); // só havia 24 horas na lista: da 15 em diante
    }

    #[test]
    fn le_os_detalhes_do_clima() {
        let temps: Vec<f64> = (0..48).map(|h| 10.0 + h as f64).collect();
        let rain: Vec<f64> = (0..48).map(|h| if h == 17 { 80.0 } else { 5.0 }).collect();
        let forecast = json!({
            "current": { "temperature_2m": 24.0, "weather_code": 61, "time": "2026-10-31T15:00",
                         "apparent_temperature": 26.5, "relative_humidity_2m": 71.0, "wind_speed_10m": 12.4, "precipitation": 0.2 },
            "hourly": { "temperature_2m": temps, "precipitation_probability": rain, "weather_code": vec![3; 48] },
            "daily": { "temperature_2m_max": [27.0], "temperature_2m_min": [18.0], "precipitation_probability_max": [80.0],
                       "uv_index_max": [9.1], "sunrise": ["2026-10-31T05:42"], "sunset": ["2026-10-31T18:21"] }
        });
        let weather = parse_forecast("São Paulo", &forecast, 15).unwrap();
        assert_eq!((weather.feels_like, weather.humidity, weather.wind_kmh), (Some(26.5), Some(71.0), Some(12.4)));
        assert_eq!((weather.rain_max, weather.uv_max, weather.precipitation_mm), (Some(80.0), Some(9.1), Some(0.2)));
        assert_eq!((weather.sunrise.as_deref(), weather.sunset.as_deref()), (Some("05:42"), Some("18:21")));
        assert_eq!(weather.hours.len(), 12);
        assert_eq!(weather.hours[0].hour, 15);
        assert_eq!(weather.hours[2], HourPoint { hour: 17, temp: 27.0, rain: 80.0, code: 3 });
        assert_eq!(weather.hours[11].hour, 2); // passou da meia-noite
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
