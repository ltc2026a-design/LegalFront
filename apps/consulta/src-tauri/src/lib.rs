// Zona 10 — Entrypoint de escritorio (Tauri v2).
//
// La misma SPA de `apps/consulta` (dist/) se carga dentro del WebView2. El frontend
// sigue usando `fetch` normal hacia VITE_API_URL; el plugin http queda registrado
// para que, como MEJORA FUTURA, se puedan enrutar esas llamadas por el core de Rust
// (evita CORS con el origin `http://tauri.localhost` y habilita cache offline nativa
// con tauri-plugin-http + tauri-plugin-store). Ver README "Empaquetado (Zona 10)".
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
