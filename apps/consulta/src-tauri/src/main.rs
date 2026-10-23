// Evita una consola adicional en Windows en modo release. NO BORRAR.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    consulta_legal_desktop_lib::run()
}
