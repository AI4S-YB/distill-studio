use anyhow::Context;
use distill_core::{
    bootstrap_topic, default_pack_config, draft_question_plans, pack_qa_records, GenerateConfig,
    GenerateSummary, GeneratedQa, PackConfig, ProviderConfig, QaShard, RuntimeConfig, TopicSpec,
};
use distill_runtime::generate_to_directory;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager, Window};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PipelineRequest {
    prompt: String,
    #[serde(default)]
    topic_tags: Vec<String>,
    target_count: u32,
    plan_limit: usize,
    output_dir: String,
    provider: String,
    model: String,
    base_url: Option<String>,
    api_key: Option<String>,
    #[serde(default)]
    api_key_env: Option<String>,
    temperature: f32,
    max_tokens: u32,
    shard_size: usize,
    batch_size: usize,
    max_in_flight: usize,
    max_retries: u32,
    request_timeout_secs: u64,
    resume: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PipelineResponse {
    topic: TopicSpec,
    generated_summary: GenerateSummary,
    kept_count: usize,
    output_dir: String,
    topic_path: String,
    plans_path: String,
    config_path: String,
    generated_dir: String,
    dataset_path: String,
    pack_summary_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PipelineProgressEvent {
    stage: String,
    status: String,
    message: String,
    current_step: usize,
    total_steps: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigProfileSummary {
    name: String,
    path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UpdaterRuntimeConfig {
    pubkey: String,
    endpoints: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateCheckResponse {
    configured: bool,
    update_available: bool,
    current_version: String,
    version: Option<String>,
    body: Option<String>,
    date: Option<String>,
    source_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateProgressEvent {
    stage: String,
    status: String,
    message: String,
}

#[tauri::command]
fn health_check() -> &'static str {
    "ok"
}

#[tauri::command]
fn preview_topic_spec(prompt: String, target_count: u32) -> Result<TopicSpec, String> {
    bootstrap_topic(&prompt, target_count).map_err(|err| err.to_string())
}

#[tauri::command]
fn save_local_pipeline_config(
    app: AppHandle,
    profile_name: Option<String>,
    request: PipelineRequest,
) -> Result<ConfigProfileSummary, String> {
    let profile_name = normalize_profile_name(profile_name);
    let path = local_pipeline_profile_path(&app, &profile_name).map_err(error_to_string)?;
    write_json(&path, &request).map_err(error_to_string)?;

    if profile_name == default_profile_name() {
        let legacy_path = legacy_local_pipeline_config_path(&app).map_err(error_to_string)?;
        write_json(&legacy_path, &request).map_err(error_to_string)?;
    }

    Ok(ConfigProfileSummary {
        name: profile_name,
        path: path.display().to_string(),
    })
}

#[tauri::command]
fn load_local_pipeline_config(
    app: AppHandle,
    profile_name: Option<String>,
) -> Result<Option<PipelineRequest>, String> {
    let profile_name = normalize_profile_name(profile_name);
    let path = local_pipeline_profile_path(&app, &profile_name).map_err(error_to_string)?;
    if !path.exists() {
        if profile_name == default_profile_name() {
            let legacy_path = legacy_local_pipeline_config_path(&app).map_err(error_to_string)?;
            if legacy_path.exists() {
                let content = fs::read_to_string(legacy_path).map_err(error_to_string)?;
                let request = serde_json::from_str(&content).map_err(error_to_string)?;
                return Ok(Some(request));
            }
        }
        return Ok(None);
    }
    let content = fs::read_to_string(path).map_err(error_to_string)?;
    let request = serde_json::from_str(&content).map_err(error_to_string)?;
    Ok(Some(request))
}

#[tauri::command]
fn list_local_pipeline_profiles(app: AppHandle) -> Result<Vec<ConfigProfileSummary>, String> {
    let mut profiles = Vec::new();
    let profiles_dir = local_pipeline_profiles_dir(&app).map_err(error_to_string)?;

    if profiles_dir.exists() {
        for entry in fs::read_dir(&profiles_dir).map_err(error_to_string)? {
            let path = entry.map_err(error_to_string)?.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let Some(name) = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .map(|value| value.to_string())
            else {
                continue;
            };
            profiles.push(ConfigProfileSummary {
                name,
                path: path.display().to_string(),
            });
        }
    }

    let default_name = default_profile_name();
    let has_default = profiles.iter().any(|profile| profile.name == default_name);
    let legacy_path = legacy_local_pipeline_config_path(&app).map_err(error_to_string)?;
    if !has_default && legacy_path.exists() {
        let default_path = local_pipeline_profile_path(&app, &default_name).map_err(error_to_string)?;
        profiles.push(ConfigProfileSummary {
            name: default_name,
            path: default_path.display().to_string(),
        });
    }

    profiles.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(profiles)
}

#[tauri::command]
fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    let target = resolve_app_relative_path(&app, path.trim()).map_err(error_to_string)?;
    if target.as_os_str().is_empty() {
        return Err("path is empty".to_string());
    }
    if !target.exists() {
        return Err(format!("path does not exist: {}", target.display()));
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&target);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&target);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(&target);
        command
    };

    command.spawn().map_err(error_to_string)?;
    Ok(())
}

#[tauri::command]
async fn check_for_app_update(
    app: AppHandle,
    window: Window,
) -> Result<AppUpdateCheckResponse, String> {
    let current_version = app.package_info().version.to_string();
    let (updater, source_path) = match build_effective_updater(&app).map_err(error_to_string)? {
        Some(value) => value,
        None => {
            emit_app_update_event(
                &window,
                "check",
                "skipped",
                "Updater is not configured. Add a local updater.json or ship a release build updater config first.",
            );
            return Ok(AppUpdateCheckResponse {
                configured: false,
                update_available: false,
                current_version,
                version: None,
                body: None,
                date: None,
                source_path: None,
            });
        }
    };

    emit_app_update_event(&window, "check", "running", "Checking for app updates.");
    let update = updater.check().await.map_err(error_to_string)?;

    if let Some(update) = update {
        emit_app_update_event(
            &window,
            "check",
            "completed",
            &format!("Update {} is available.", update.version),
        );
        Ok(AppUpdateCheckResponse {
            configured: true,
            update_available: true,
            current_version,
            version: Some(update.version),
            body: update.body,
            date: update.date.map(|value| value.to_string()),
            source_path: source_path.map(|value| value.display().to_string()),
        })
    } else {
        emit_app_update_event(
            &window,
            "check",
            "completed",
            &format!("No update found. Current version is {}.", current_version),
        );
        Ok(AppUpdateCheckResponse {
            configured: true,
            update_available: false,
            current_version,
            version: None,
            body: None,
            date: None,
            source_path: source_path.map(|value| value.display().to_string()),
        })
    }
}

#[tauri::command]
async fn install_app_update(app: AppHandle, window: Window) -> Result<(), String> {
    let Some((updater, _)) = build_effective_updater(&app).map_err(error_to_string)? else {
        return Err(
            "Updater is not configured. Add updater.json or ship a release build updater config before trying to install updates."
                .to_string(),
        );
    };

    emit_app_update_event(&window, "install", "running", "Preparing update installation.");
    let Some(update) = updater.check().await.map_err(error_to_string)? else {
        emit_app_update_event(
            &window,
            "install",
            "skipped",
            "No update is currently available.",
        );
        return Err("No update is currently available.".to_string());
    };

    let target_version = update.version.clone();
    emit_app_update_event(
        &window,
        "install",
        "running",
        &format!("Downloading update {}.", target_version),
    );

    let progress_window = window.clone();
    let mut downloaded = 0usize;
    let mut next_percent_mark = 10usize;
    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded += chunk_length;
                let Some(total_bytes) = content_length else {
                    return;
                };
                if total_bytes == 0 {
                    return;
                }

                let percent = downloaded.saturating_mul(100) / total_bytes as usize;
                if percent >= next_percent_mark {
                    emit_app_update_event(
                        &progress_window,
                        "download",
                        "running",
                        &format!("Update download progress: {}%.", percent.min(100)),
                    );
                    while next_percent_mark <= percent {
                        next_percent_mark += 10;
                    }
                }
            },
            {
                let ready_window = window.clone();
                let ready_version = target_version.clone();
                move || {
                    emit_app_update_event(
                        &ready_window,
                        "download",
                        "completed",
                        &format!("Update {} has been downloaded.", ready_version),
                    );
                }
            },
        )
        .await
        .map_err(error_to_string)?;

    emit_app_update_event(
        &window,
        "install",
        "completed",
        &format!(
            "Update {} installed. The app will restart to finish the upgrade.",
            target_version
        ),
    );
    app.restart();
}

#[tauri::command]
async fn run_pipeline(
    app: AppHandle,
    window: Window,
    request: PipelineRequest,
) -> Result<PipelineResponse, String> {
    let total_steps = 5usize;
    emit_pipeline_event(
        &window,
        "bootstrap",
        "running",
        "Starting pipeline bootstrap.",
        0,
        total_steps,
    );

    let topic = bootstrap_topic(&request.prompt, request.target_count).map_err(error_to_string)?;
    emit_pipeline_event(
        &window,
        "bootstrap",
        "completed",
        &format!("Topic spec ready for `{}`.", topic.topic_name),
        1,
        total_steps,
    );

    let plans = draft_question_plans(&topic, request.plan_limit);
    emit_pipeline_event(
        &window,
        "plan",
        "completed",
        &format!("Drafted {} question plans.", plans.len()),
        2,
        total_steps,
    );

    let config = GenerateConfig {
        provider: ProviderConfig {
            provider: request.provider,
            model: request.model,
            base_url: request.base_url.filter(|value| !value.trim().is_empty()),
            api_key: request.api_key.filter(|value| !value.trim().is_empty()),
            api_key_env: request.api_key_env.filter(|value| !value.trim().is_empty()),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
        },
        runtime: RuntimeConfig {
            target_count: topic.target_count as usize,
            shard_size: request.shard_size,
            batch_size: request.batch_size,
            max_in_flight: request.max_in_flight,
            max_retries: request.max_retries,
            request_timeout_secs: request.request_timeout_secs,
            resume: request.resume,
        },
    };

    let output_dir = resolve_app_relative_path(&app, &request.output_dir).map_err(error_to_string)?;
    let generated_dir = output_dir.join("generated");
    let topic_path = output_dir.join("topic.json");
    let plans_path = output_dir.join("plans.json");
    let config_path = output_dir.join("generate_config.json");
    let dataset_path = output_dir.join("dataset.jsonl");
    let pack_summary_path = output_dir.join("pack_summary.json");

    write_json(&topic_path, &topic).map_err(error_to_string)?;
    write_json(&plans_path, &plans).map_err(error_to_string)?;
    let mut config_for_disk = config.clone();
    config_for_disk.provider.api_key = None;
    write_json(&config_path, &config_for_disk).map_err(error_to_string)?;
    emit_pipeline_event(
        &window,
        "write-config",
        "completed",
        &format!("Wrote topic, plans, and config into {}.", output_dir.display()),
        3,
        total_steps,
    );

    emit_pipeline_event(
        &window,
        "generate",
        "running",
        &format!(
            "Generating {} QA items with {} / {}.",
            config.runtime.target_count, config.provider.provider, config.provider.model
        ),
        3,
        total_steps,
    );
    let generated_summary = generate_to_directory(&topic, &plans, &config, &generated_dir)
        .await
        .map_err(error_to_string)?;
    emit_pipeline_event(
        &window,
        "generate",
        "completed",
        &format!(
            "Generated {} items across {} shards.",
            generated_summary.generated_count, generated_summary.shard_count
        ),
        4,
        total_steps,
    );

    emit_pipeline_event(
        &window,
        "pack",
        "running",
        "Packing generated shards into dataset.jsonl.",
        4,
        total_steps,
    );
    let (_, records) = load_generated_records(&generated_dir).map_err(error_to_string)?;
    let pack_config: PackConfig = default_pack_config();
    let packed = pack_qa_records(&topic, records, &pack_config);
    write_jsonl(&dataset_path, &packed.items).map_err(error_to_string)?;
    write_json(&pack_summary_path, &packed).map_err(error_to_string)?;
    emit_pipeline_event(
        &window,
        "pack",
        "completed",
        &format!(
            "Packed {} kept records. Off-topic filtered: {}.",
            packed.kept, packed.dropped_off_topic
        ),
        5,
        total_steps,
    );

    let response = PipelineResponse {
        topic,
        generated_summary,
        kept_count: packed.kept,
        output_dir: output_dir.display().to_string(),
        topic_path: topic_path.display().to_string(),
        plans_path: plans_path.display().to_string(),
        config_path: config_path.display().to_string(),
        generated_dir: generated_dir.display().to_string(),
        dataset_path: dataset_path.display().to_string(),
        pack_summary_path: pack_summary_path.display().to_string(),
    };

    emit_pipeline_event(
        &window,
        "complete",
        "completed",
        &format!("Pipeline finished. Dataset written to {}.", response.dataset_path),
        total_steps,
        total_steps,
    );

    Ok(response)
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(value)?)?;
    Ok(())
}

fn write_jsonl(path: &Path, records: &[GeneratedQa]) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut content = String::new();
    for record in records {
        content.push_str(&serde_json::to_string(record)?);
        content.push('\n');
    }
    fs::write(path, content)?;
    Ok(())
}

fn load_generated_records(input_dir: &Path) -> anyhow::Result<(String, Vec<GeneratedQa>)> {
    let mut paths = fs::read_dir(input_dir)?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| {
            path.extension().and_then(|ext| ext.to_str()) == Some("json")
                && path.file_name().and_then(|name| name.to_str()) != Some("summary.json")
        })
        .collect::<Vec<_>>();
    paths.sort();

    let mut topic_name = String::new();
    let mut records = Vec::new();

    for path in paths {
        let content = fs::read_to_string(&path)?;
        let shard: QaShard = serde_json::from_str(&content)?;
        if topic_name.is_empty() {
            topic_name = shard.topic_name.clone();
        }
        records.extend(shard.items);
    }

    Ok((topic_name, records))
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> anyhow::Result<T> {
    let content = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&content)?)
}

fn error_to_string<E>(error: E) -> String
where
    E: Into<anyhow::Error>,
{
    let error = error.into();
    error
        .chain()
        .map(|cause| cause.to_string())
        .collect::<Vec<_>>()
        .join(": ")
}

fn dev_app_root() -> Option<PathBuf> {
    let app_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)?;

    let has_workspace_markers =
        app_root.join("package.json").exists() && app_root.join("src-tauri/tauri.conf.json").exists();
    if has_workspace_markers {
        Some(app_root)
    } else {
        None
    }
}

fn runtime_data_root(app: &AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root)
    } else {
        Ok(app.path().app_data_dir()?.join("workspace"))
    }
}

fn runtime_config_root(app: &AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root)
    } else {
        Ok(app.path().app_config_dir()?)
    }
}

fn resolve_app_relative_path(app: &AppHandle, path: &str) -> anyhow::Result<PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(PathBuf::new());
    }

    let target = PathBuf::from(trimmed);
    if target.is_absolute() {
        Ok(target)
    } else {
        Ok(runtime_data_root(app)?.join(target))
    }
}

fn updater_runtime_config_path(app: &AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root.join("config/local/updater.json"))
    } else {
        Ok(runtime_config_root(app)?.join("updater.json"))
    }
}

fn local_pipeline_profiles_dir(app: &AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root.join("config/local/profiles"))
    } else {
        Ok(runtime_config_root(app)?.join("profiles"))
    }
}

fn local_pipeline_profile_path(app: &AppHandle, profile_name: &str) -> anyhow::Result<PathBuf> {
    Ok(local_pipeline_profiles_dir(app)?.join(format!("{profile_name}.json")))
}

fn legacy_local_pipeline_config_path(app: &AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root.join("config/local/gui.pipeline.json"))
    } else {
        Ok(runtime_config_root(app)?.join("gui.pipeline.json"))
    }
}

fn default_profile_name() -> String {
    "default".to_string()
}

fn normalize_profile_name(profile_name: Option<String>) -> String {
    let raw = profile_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("default");

    let mut normalized = String::new();
    let mut last_was_separator = false;

    for ch in raw.chars() {
        let keep = ch.is_ascii_alphanumeric() || ch == '-' || ch == '_';
        if keep {
            normalized.push(ch);
            last_was_separator = false;
            continue;
        }

        if (ch.is_whitespace() || ch == '.') && !last_was_separator {
            normalized.push('-');
            last_was_separator = true;
        }
    }

    let normalized = normalized.trim_matches('-').to_string();
    if normalized.is_empty() {
        default_profile_name()
    } else {
        normalized
    }
}

fn load_updater_runtime_config(
    app: &AppHandle,
) -> anyhow::Result<Option<(UpdaterRuntimeConfig, PathBuf)>> {
    let path = updater_runtime_config_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let config: UpdaterRuntimeConfig = read_json(&path)?;
    let pubkey = config.pubkey.trim().to_string();
    let endpoints = config
        .endpoints
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    if pubkey.is_empty() {
        anyhow::bail!("updater pubkey is empty in {}", path.display());
    }
    if endpoints.is_empty() {
        anyhow::bail!("updater endpoints are empty in {}", path.display());
    }

    Ok(Some((
        UpdaterRuntimeConfig { pubkey, endpoints },
        path,
    )))
}

fn build_runtime_updater(
    app: &AppHandle,
    config: &UpdaterRuntimeConfig,
) -> anyhow::Result<tauri_plugin_updater::Updater> {
    let endpoints = config
        .endpoints
        .iter()
        .map(|value| {
            Url::parse(value)
                .with_context(|| format!("invalid updater endpoint URL `{value}`"))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;

    Ok(app
        .updater_builder()
        .pubkey(config.pubkey.clone())
        .endpoints(endpoints)?
        .build()?)
}

fn build_effective_updater(
    app: &AppHandle,
) -> anyhow::Result<Option<(tauri_plugin_updater::Updater, Option<PathBuf>)>> {
    if let Some((config, source_path)) = load_updater_runtime_config(app)? {
        let updater = build_runtime_updater(app, &config)?;
        return Ok(Some((updater, Some(source_path))));
    }

    match app.updater_builder().build() {
        Ok(updater) => Ok(Some((updater, None))),
        Err(tauri_plugin_updater::Error::EmptyEndpoints) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn emit_pipeline_event(
    window: &Window,
    stage: &str,
    status: &str,
    message: &str,
    current_step: usize,
    total_steps: usize,
) {
    let _ = window.emit(
        "pipeline-progress",
        PipelineProgressEvent {
            stage: stage.to_string(),
            status: status.to_string(),
            message: message.to_string(),
            current_step,
            total_steps,
        },
    );
}

fn emit_app_update_event(window: &Window, stage: &str, status: &str, message: &str) {
    let _ = window.emit(
        "app-update-progress",
        AppUpdateProgressEvent {
            stage: stage.to_string(),
            status: status.to_string(),
            message: message.to_string(),
        },
    );
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            health_check,
            preview_topic_spec,
            save_local_pipeline_config,
            load_local_pipeline_config,
            list_local_pipeline_profiles,
            open_path,
            run_pipeline,
            check_for_app_update,
            install_app_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
