pub mod audio;
pub mod benchmark;
pub mod diagnostics;
pub mod dictionary;
pub mod history;
pub mod hotkey;
pub mod inference;
pub mod insertion;
pub mod model_manager;
pub mod permissions;
pub mod phase1;
pub mod settings;
pub mod transcript;

#[cfg(feature = "desktop")]
pub mod state;

#[cfg(feature = "desktop")]
use audio::AudioQualityReport;
#[cfg(feature = "desktop")]
use benchmark::{BenchmarkRequest, BenchmarkRun, ModelRecommendation, RecommendationConstraints};
#[cfg(feature = "desktop")]
use diagnostics::{DiagnosticsExportResult, DiagnosticsStatus};
#[cfg(feature = "desktop")]
use dictionary::{DictionaryQueueItem, DictionaryTerm};
#[cfg(feature = "desktop")]
use history::{RetentionPolicy, SessionHistoryQuery, SessionHistoryRecord};
#[cfg(feature = "desktop")]
use hotkey::{HotkeyAction, HotkeyConfig, HotkeyPhase, HotkeySnapshot};
#[cfg(feature = "desktop")]
use insertion::{InsertResult, InsertTextRequest, RecentInsertion, UndoResult};
#[cfg(feature = "desktop")]
use model_manager::{InstalledModel, ModelCatalogItem, ModelDownloadRequest, ModelStatus};
#[cfg(feature = "desktop")]
use permissions::PermissionSnapshot;
#[cfg(feature = "desktop")]
use settings::VoiceWaveSettings;
#[cfg(feature = "desktop")]
use state::{DictationMode, VoiceWaveController, VoiceWaveSnapshot};
#[cfg(feature = "desktop")]
use std::sync::Arc;
#[cfg(feature = "desktop")]
use tauri::{Manager, State};

#[cfg(feature = "desktop")]
#[derive(Clone)]
struct RuntimeContext {
    controller: Arc<VoiceWaveController>,
}

#[cfg(feature = "desktop")]
#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("{0}")]
    Controller(#[from] state::ControllerError),
}

#[cfg(feature = "desktop")]
impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_voicewave_snapshot(
    runtime: State<'_, RuntimeContext>,
) -> Result<VoiceWaveSnapshot, String> {
    Ok(runtime.controller.snapshot().await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn load_settings(runtime: State<'_, RuntimeContext>) -> Result<VoiceWaveSettings, String> {
    Ok(runtime.controller.load_settings().await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn update_settings(
    runtime: State<'_, RuntimeContext>,
    settings: VoiceWaveSettings,
) -> Result<VoiceWaveSettings, String> {
    runtime
        .controller
        .update_settings(settings)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_diagnostics_status(
    runtime: State<'_, RuntimeContext>,
) -> Result<DiagnosticsStatus, String> {
    Ok(runtime.controller.get_diagnostics_status().await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn set_diagnostics_opt_in(
    runtime: State<'_, RuntimeContext>,
    enabled: bool,
) -> Result<DiagnosticsStatus, String> {
    runtime
        .controller
        .set_diagnostics_opt_in(enabled)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn export_diagnostics_bundle(
    runtime: State<'_, RuntimeContext>,
) -> Result<DiagnosticsExportResult, String> {
    runtime
        .controller
        .export_diagnostics_bundle()
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn start_dictation(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    mode: Option<DictationMode>,
) -> Result<(), String> {
    runtime
        .controller
        .start_dictation(app, mode.unwrap_or_default())
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn cancel_dictation(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
) -> Result<(), String> {
    runtime.controller.cancel_dictation(app).await;
    Ok(())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn stop_dictation(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
) -> Result<(), String> {
    runtime.controller.stop_dictation(app).await;
    Ok(())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn load_hotkey_config(runtime: State<'_, RuntimeContext>) -> Result<HotkeySnapshot, String> {
    Ok(runtime.controller.hotkey_snapshot().await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn update_hotkey_config(
    runtime: State<'_, RuntimeContext>,
    config: HotkeyConfig,
) -> Result<HotkeySnapshot, String> {
    runtime
        .controller
        .update_hotkey_config(config)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_permission_snapshot(
    runtime: State<'_, RuntimeContext>,
) -> Result<PermissionSnapshot, String> {
    Ok(runtime.controller.permission_snapshot().await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn list_input_devices(
    runtime: State<'_, RuntimeContext>,
) -> Result<Vec<String>, String> {
    Ok(runtime.controller.list_input_devices().await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn request_microphone_access(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
) -> Result<PermissionSnapshot, String> {
    Ok(runtime.controller.request_microphone_access(app).await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn start_mic_level_monitor(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
) -> Result<(), String> {
    runtime
        .controller
        .start_mic_level_monitor(app)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn stop_mic_level_monitor(runtime: State<'_, RuntimeContext>) -> Result<(), String> {
    runtime.controller.stop_mic_level_monitor().await;
    Ok(())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn run_audio_quality_diagnostic(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    duration_ms: Option<u64>,
) -> Result<AudioQualityReport, String> {
    runtime
        .controller
        .run_audio_quality_diagnostic(app, duration_ms)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn insert_text(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    payload: InsertTextRequest,
) -> Result<InsertResult, String> {
    runtime
        .controller
        .insert_text(app, payload)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn undo_last_insertion(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
) -> Result<UndoResult, String> {
    Ok(runtime.controller.undo_last_insertion(app).await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_recent_insertions(
    runtime: State<'_, RuntimeContext>,
    limit: Option<usize>,
) -> Result<Vec<RecentInsertion>, String> {
    Ok(runtime.controller.recent_insertions(limit).await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn trigger_hotkey_action(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    action: HotkeyAction,
    phase: HotkeyPhase,
) -> Result<(), String> {
    runtime
        .controller
        .trigger_hotkey_action(app, action, phase)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn list_model_catalog(
    runtime: State<'_, RuntimeContext>,
) -> Result<Vec<ModelCatalogItem>, String> {
    Ok(runtime.controller.list_model_catalog().await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn list_installed_models(
    runtime: State<'_, RuntimeContext>,
) -> Result<Vec<InstalledModel>, String> {
    Ok(runtime.controller.list_installed_models().await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_model_status(
    runtime: State<'_, RuntimeContext>,
    model_id: String,
) -> Result<ModelStatus, String> {
    runtime
        .controller
        .get_model_status(model_id)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn download_model(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    request: ModelDownloadRequest,
) -> Result<ModelStatus, String> {
    runtime
        .controller
        .download_model(app, request)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn cancel_model_download(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    model_id: String,
) -> Result<ModelStatus, String> {
    runtime
        .controller
        .cancel_model_download(app, model_id)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn pause_model_download(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    model_id: String,
) -> Result<ModelStatus, String> {
    runtime
        .controller
        .pause_model_download(app, model_id)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn resume_model_download(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    model_id: String,
) -> Result<ModelStatus, String> {
    runtime
        .controller
        .resume_model_download(app, model_id)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn set_active_model(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    model_id: String,
) -> Result<VoiceWaveSettings, String> {
    runtime
        .controller
        .set_active_model(app, model_id)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn run_model_benchmark(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    request: Option<BenchmarkRequest>,
) -> Result<BenchmarkRun, String> {
    runtime
        .controller
        .run_model_benchmark(
            app,
            request.unwrap_or(BenchmarkRequest {
                model_ids: None,
                runs_per_model: None,
                partial_delay_ms: None,
            }),
        )
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_benchmark_results(
    runtime: State<'_, RuntimeContext>,
) -> Result<Option<BenchmarkRun>, String> {
    Ok(runtime.controller.get_benchmark_results().await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn recommend_model(
    runtime: State<'_, RuntimeContext>,
    constraints: Option<RecommendationConstraints>,
) -> Result<ModelRecommendation, String> {
    runtime
        .controller
        .recommend_model(constraints.unwrap_or_default())
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_session_history(
    runtime: State<'_, RuntimeContext>,
    query: Option<SessionHistoryQuery>,
) -> Result<Vec<SessionHistoryRecord>, String> {
    Ok(runtime
        .controller
        .get_session_history(query.unwrap_or_default())
        .await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn set_history_retention(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    policy: RetentionPolicy,
) -> Result<RetentionPolicy, String> {
    runtime
        .controller
        .set_history_retention(app, policy)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn prune_history_now(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
) -> Result<usize, String> {
    runtime
        .controller
        .prune_history_now(app)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn clear_history(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
) -> Result<usize, String> {
    runtime
        .controller
        .clear_history(app)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_dictionary_queue(
    runtime: State<'_, RuntimeContext>,
    limit: Option<usize>,
) -> Result<Vec<DictionaryQueueItem>, String> {
    Ok(runtime.controller.get_dictionary_queue(limit).await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn approve_dictionary_entry(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    entry_id: String,
    normalized_text: Option<String>,
) -> Result<DictionaryTerm, String> {
    runtime
        .controller
        .approve_dictionary_entry(app, entry_id, normalized_text)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn reject_dictionary_entry(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    entry_id: String,
    reason: Option<String>,
) -> Result<(), String> {
    runtime
        .controller
        .reject_dictionary_entry(app, entry_id, reason)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn get_dictionary_terms(
    runtime: State<'_, RuntimeContext>,
    query: Option<String>,
) -> Result<Vec<DictionaryTerm>, String> {
    Ok(runtime.controller.get_dictionary_terms(query).await)
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn remove_dictionary_term(
    app: tauri::AppHandle,
    runtime: State<'_, RuntimeContext>,
    term_id: String,
) -> Result<(), String> {
    runtime
        .controller
        .remove_dictionary_term(app, term_id)
        .await
        .map_err(|err| AppError::Controller(err).into())
}

#[cfg(feature = "desktop")]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let controller = Arc::new(
                VoiceWaveController::new()
                    .map_err(|err| -> Box<dyn std::error::Error> { Box::new(err) })?,
            );

            let controller_for_hotkeys = controller.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                controller_for_hotkeys
                    .ensure_hotkey_runtime_monitor(app_handle)
                    .await;
            });

            app.manage(RuntimeContext {
                controller,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_voicewave_snapshot,
            load_settings,
            update_settings,
            get_diagnostics_status,
            set_diagnostics_opt_in,
            export_diagnostics_bundle,
            start_dictation,
            cancel_dictation,
            stop_dictation,
            load_hotkey_config,
            update_hotkey_config,
            get_permission_snapshot,
            list_input_devices,
            request_microphone_access,
            start_mic_level_monitor,
            stop_mic_level_monitor,
            run_audio_quality_diagnostic,
            insert_text,
            undo_last_insertion,
            get_recent_insertions,
            trigger_hotkey_action,
            list_model_catalog,
            list_installed_models,
            get_model_status,
            download_model,
            cancel_model_download,
            pause_model_download,
            resume_model_download,
            set_active_model,
            run_model_benchmark,
            get_benchmark_results,
            recommend_model,
            get_session_history,
            set_history_retention,
            prune_history_now,
            clear_history,
            get_dictionary_queue,
            approve_dictionary_entry,
            reject_dictionary_entry,
            get_dictionary_terms,
            remove_dictionary_term
        ])
        .run(tauri::generate_context!())
        .expect("error while running voicewave tauri app");
}

#[cfg(not(feature = "desktop"))]
pub fn run() {
    panic!("desktop runtime requested without the 'desktop' feature enabled")
}
