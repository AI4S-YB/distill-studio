
mod types;
mod config;
mod paper_qa_types;
mod paper_qa_commands;
mod platform_types;
mod platform_commands;
mod chat_qa;
mod feedback;
mod keychain;

use crate::chat_qa::*;
use crate::feedback::*;
use crate::keychain::*;
use crate::paper_qa_types::*;
use crate::platform_commands::*;
use crate::platform_types::*;
use crate::types::*;

// ---- Paper QA command wrappers (impl in paper_qa_commands.rs) ----

#[tauri::command]
async fn convert_pdf_via_mineru(pdf_path: String) -> Result<String, String> {
    crate::paper_qa_commands::do_convert_pdf_via_mineru(pdf_path).await
}

#[tauri::command]
async fn chunk_paper_md(md_text: String, paper_title: String) -> Result<Vec<PaperChunk>, String> {
    crate::paper_qa_commands::do_chunk_paper_md(md_text, paper_title).await
}

#[tauri::command]
async fn generate_paper_qa(
    app: tauri::AppHandle,
    window: tauri::Window,
    request: crate::paper_qa_types::PaperQaGenerateRequest,
) -> Result<PaperQaGenerateResponse, String> {
    crate::paper_qa_commands::do_generate_paper_qa(app, window, request).await
}

#[tauri::command]
async fn save_paper_qa_batch(
    app: tauri::AppHandle,
    items: Vec<PaperQaItem>,
    paper_title: String,
    provider: String,
    model: String,
) -> Result<QaBatchSummary, String> {
    crate::paper_qa_commands::do_save_paper_qa_batch(app, items, paper_title, provider, model).await
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .manage(ActivePipelineState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            health_check,
            stop_pipeline,
            preview_topic_spec,
            get_app_metadata,
            get_managed_output_root,
            save_local_pipeline_config,
            load_local_pipeline_config,
            list_local_pipeline_profiles,
            list_qa_batches,
            load_batch_pipeline_request,
            delete_qa_batch,
            repack_qa_batch,
            check_platform_health,
            login_platform,
            load_model_trial_workspace,
            get_model_trial_session_detail,
            create_model_trial_session,
            send_model_trial_message,
            delete_model_trial_session,
            list_platform_import_batches,
            get_platform_import_batch_detail,
            upload_qa_batch,
            get_qa_batch_platform_statuses,
            list_batch_qa_records,
            list_batch_qa_question_options,
            get_batch_qa_record,
            save_batch_review_item,
            open_path,
            open_external_url,
            run_pipeline,
            check_for_app_update,
            install_app_update,
            get_platform_news,
            get_dashboard_overview,
            change_platform_password,
            logout_platform,
            get_model_changelog,
            submit_feedback,
            get_platform_stats,
            get_exports_stats,
            get_generate_models,
            send_chat_message,
            send_chat_message_stream,
            push_chat_conversations,
            convert_pdf_via_mineru,
            chunk_paper_md,
            generate_paper_qa,
            save_paper_qa_batch,
            store_platform_password,
            load_platform_password,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn mineru_base_url_missing_env() {
        let _lock = ENV_LOCK.lock().unwrap();
        let saved = std::env::var("MINERU_BASE_URL").ok();
        std::env::remove_var("MINERU_BASE_URL");
        let result = crate::paper_qa_commands::paper_qa_mineru_base_url();
        if let Some(val) = saved {
            std::env::set_var("MINERU_BASE_URL", val);
        }
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("MINERU_BASE_URL"));
    }

    #[test]
    fn mineru_base_url_set_env() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("MINERU_BASE_URL", "https://mineru.example.com");
        let result = crate::paper_qa_commands::paper_qa_mineru_base_url();
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "https://mineru.example.com");
    }
}
