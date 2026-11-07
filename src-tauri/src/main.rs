// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

extern crate anyhow;
extern crate miio;
extern crate serde_json;

use miio::{Device, MiCloudProtocol};
use serde_json::Value;
use std::{str::FromStr, sync::OnceLock};
use tauri::{Emitter, Listener};
use tauri_plugin_log::{Builder, Target, TargetKind};

/// 全局唯一的 Mi Cloud 客户端。
/// `MiCloudProtocol` 内部使用 `RwLock`/`OnceLock` 提供内部可变性，可直接通过共享引用访问。
static MI_CLOUD_PROTOCOL: OnceLock<MiCloudProtocol> = OnceLock::new();

fn mi_cloud() -> &'static MiCloudProtocol {
    MI_CLOUD_PROTOCOL
        .get()
        .expect("MiCloudProtocol 应在 setup 阶段完成初始化")
}

//TODO: rm .map_err(|_| ()) https://tauri.app/v1/guides/features/command/#error-handling

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
async fn login(email: String, password: String, country: Option<String>) -> Result<(), String> {
    let mi = mi_cloud();
    if let Some(c) = country {
        mi.set_country(&c);
    }
    mi.login(email.as_str(), password.as_str())
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn get_countries() -> Vec<Vec<&'static str>> {
    mi_cloud().get_available_countries()
}

#[tauri::command]
async fn set_country(country: String) {
    mi_cloud().set_country(&country)
}

#[tauri::command]
async fn get_devices() -> Result<Vec<Device>, ()> {
    mi_cloud().get_devices(None, None).await.map_err(|_| ())
}

#[tauri::command]
async fn get_device(did: String) -> Result<Vec<Device>, ()> {
    mi_cloud()
        .get_device(&did, None)
        .await
        .map_err(|_| ())
}

#[tauri::command]
async fn call_device(did: String, method: String, params: Option<String>) -> Result<Value, String> {
    let mi = mi_cloud();
    let params = params
        .map(|params| Value::from_str(params.as_str()).map_err(|err| err.to_string()))
        .transpose()?;
    mi.call_device(&did, &method, params, None)
        .await
        .map_err(|err| err.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(
            Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            login,
            get_countries,
            set_country,
            get_device,
            get_devices,
            call_device
        ])
        .setup(|app| {
            let mi = MI_CLOUD_PROTOCOL.get_or_init(MiCloudProtocol::new);
            let app_handle = app.handle().clone();

            mi._set_captcha_handler(Box::new({
                let app_handle = app_handle.clone();
                move |x| {
                    let _ = app_handle.emit("captcha_requested", x);
                }
            }));
            mi._set_two_factor_handler(Box::new({
                let app_handle = app_handle.clone();
                move |payload, error| {
                    let _ = app_handle.emit("two_factor_requested", (payload, error));
                }
            }));

            app_handle.listen("captcha_solved", move |event| {
                tauri::async_runtime::spawn(async move {
                    let mi = mi_cloud();
                    let pl = serde_json::from_str::<String>(event.payload()).unwrap();
                    if pl.eq("CANCEL") {
                        mi.captcha_cancel().await
                    } else {
                        mi.captcha_solve(pl.as_str()).await
                    }
                });
            });
            app_handle.listen("two_factor_solved", move |event| {
                tauri::async_runtime::spawn(async move {
                    let mi = mi_cloud();
                    let pl = serde_json::from_str::<String>(event.payload()).unwrap();
                    if pl.eq("CANCEL") {
                        mi.two_factor_cancel().await
                    } else {
                        mi.two_factor_solve(pl.as_str()).await
                    }
                });
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
