use anyhow::Context;
use distill_core::{
    bootstrap_topic, default_pack_config, default_qa_mode, draft_question_plans, pack_qa_records,
    GenerateConfig, GenerateSummary, GeneratedQa, PackConfig, PackedDataset, ProviderConfig,
    QaShard, RuntimeConfig, TopicSpec,
};
use distill_runtime::generate_to_directory;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Window};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

const COT_SAFE_BATCH_SIZE: usize = 1;
const COT_SAFE_MAX_IN_FLIGHT: usize = 1;
const COT_SAFE_SHARD_SIZE_CAP: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PipelineRequest {
    prompt: String,
    #[serde(default)]
    topic_tags: Vec<String>,
    #[serde(default = "default_qa_mode")]
    qa_mode: String,
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
    #[serde(default)]
    qa_upload_url: Option<String>,
    #[serde(default)]
    literature_api_url: Option<String>,
    #[serde(default)]
    literature_api_auth_token: Option<String>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaBatchSummary {
    id: String,
    name: String,
    topic_name: String,
    prompt: String,
    kept_count: usize,
    total_count: usize,
    provider: Option<String>,
    model: Option<String>,
    output_dir: String,
    updated_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaRecordSummary {
    id: String,
    question: String,
    subtopic: String,
    axis: String,
    question_type: String,
    difficulty: String,
    audience: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaRecordPage {
    batch: QaBatchSummary,
    items: Vec<QaRecordSummary>,
    page: usize,
    page_size: usize,
    total_items: usize,
    total_pages: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaRecordDetail {
    batch: QaBatchSummary,
    item: GeneratedQa,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaBatchUploadPayload {
    batch: QaBatchSummary,
    items: Vec<GeneratedQa>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaBatchUploadResponse {
    status: u16,
    uploaded_count: usize,
    url: String,
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

fn normalize_runtime_for_qa_mode(
    qa_mode: &str,
    target_count: usize,
    shard_size: usize,
    batch_size: usize,
    max_in_flight: usize,
    max_retries: u32,
    request_timeout_secs: u64,
    resume: bool,
) -> RuntimeConfig {
    let safe_target = target_count.max(1);
    let safe_shard_size = shard_size.max(1);
    let safe_batch_size = batch_size.max(1);
    let safe_max_in_flight = max_in_flight.max(1);

    if qa_mode == "cot" {
        return RuntimeConfig {
            target_count: safe_target,
            shard_size: safe_target.min(COT_SAFE_SHARD_SIZE_CAP).max(1),
            batch_size: COT_SAFE_BATCH_SIZE,
            max_in_flight: COT_SAFE_MAX_IN_FLIGHT,
            max_retries,
            request_timeout_secs,
            resume,
        };
    }

    RuntimeConfig {
        target_count: safe_target,
        shard_size: safe_shard_size,
        batch_size: safe_batch_size,
        max_in_flight: safe_max_in_flight,
        max_retries,
        request_timeout_secs,
        resume,
    }
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
fn list_qa_batches(app: AppHandle) -> Result<Vec<QaBatchSummary>, String> {
    let mut batches = load_qa_batches(&app).map_err(error_to_string)?;
    batches.sort_by(|left, right| right.updated_at_ms.cmp(&left.updated_at_ms));
    Ok(batches)
}

#[tauri::command]
fn delete_qa_batch(app: AppHandle, batch_id: String) -> Result<(), String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    fs::remove_dir_all(&batch_dir).map_err(error_to_string)?;
    Ok(())
}

#[tauri::command]
async fn upload_qa_batch(
    app: AppHandle,
    batch_id: String,
    upload_url: String,
) -> Result<QaBatchUploadResponse, String> {
    let upload_url = upload_url.trim();
    if upload_url.is_empty() {
        return Err("upload url is empty".to_string());
    }
    Url::parse(upload_url).map_err(error_to_string)?;

    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let batch = build_qa_batch_summary(&app, &batch_dir).map_err(error_to_string)?;
    let items = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let payload = QaBatchUploadPayload {
        batch,
        items: items.clone(),
    };

    let client = reqwest::Client::new();
    let response = client
        .post(upload_url)
        .json(&payload)
        .send()
        .await
        .map_err(error_to_string)?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let body = body.trim();
        let detail = if body.is_empty() {
            format!("upload failed with status {}", status.as_u16())
        } else {
            format!("upload failed with status {}: {}", status.as_u16(), body)
        };
        return Err(detail);
    }

    Ok(QaBatchUploadResponse {
        status: status.as_u16(),
        uploaded_count: items.len(),
        url: upload_url.to_string(),
    })
}

#[tauri::command]
fn list_batch_qa_records(
    app: AppHandle,
    batch_id: String,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<QaRecordPage, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let batch = build_qa_batch_summary(&app, &batch_dir).map_err(error_to_string)?;
    let records = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let page_size = page_size.unwrap_or(20).clamp(1, 200);
    let requested_page = page.unwrap_or(1).max(1);
    let total_items = records.len();
    let total_pages = if total_items == 0 {
        1
    } else {
        (total_items + page_size - 1) / page_size
    };
    let page = requested_page.min(total_pages);
    let start = (page - 1) * page_size;
    let end = (start + page_size).min(total_items);
    let items = if start >= total_items {
        Vec::new()
    } else {
        records[start..end]
            .iter()
            .map(|item| QaRecordSummary {
                id: item.id.clone(),
                question: item.question.clone(),
                subtopic: item.subtopic.clone(),
                axis: item.axis.clone(),
                question_type: item.question_type.clone(),
                difficulty: item.difficulty.clone(),
                audience: item.audience.clone(),
            })
            .collect()
    };

    Ok(QaRecordPage {
        batch,
        items,
        page,
        page_size,
        total_items,
        total_pages,
    })
}

#[tauri::command]
fn get_batch_qa_record(
    app: AppHandle,
    batch_id: String,
    qa_id: String,
) -> Result<QaRecordDetail, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let batch = build_qa_batch_summary(&app, &batch_dir).map_err(error_to_string)?;
    let records = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let item = records
        .into_iter()
        .find(|record| record.id == qa_id)
        .ok_or_else(|| format!("QA record not found: {qa_id}"))?;

    Ok(QaRecordDetail { batch, item })
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
        runtime: normalize_runtime_for_qa_mode(
            &request.qa_mode,
            topic.target_count as usize,
            request.shard_size,
            request.batch_size,
            request.max_in_flight,
            request.max_retries,
            request.request_timeout_secs,
            request.resume,
        ),
        qa_mode: request.qa_mode.clone(),
        supporting_context: None,
    };

    let output_dir = if request.output_dir.trim() == "__managed__" || request.output_dir.trim().is_empty() {
        next_managed_output_dir(&app, &topic.topic_name).map_err(error_to_string)?
    } else {
        resolve_app_relative_path(&app, &request.output_dir).map_err(error_to_string)?
    };
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
            "Generating {} {} items with {} / {}.",
            config.runtime.target_count, config.qa_mode, config.provider.provider, config.provider.model
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

fn load_batch_records(batch_dir: &Path) -> anyhow::Result<Vec<GeneratedQa>> {
    let dataset_path = batch_dir.join("dataset.jsonl");
    if dataset_path.exists() {
        return read_jsonl_records(&dataset_path);
    }

    let pack_summary_path = batch_dir.join("pack_summary.json");
    if pack_summary_path.exists() {
        let packed: PackedDataset = read_json(&pack_summary_path)?;
        return Ok(packed.items);
    }

    anyhow::bail!("dataset.jsonl not found in {}", batch_dir.display());
}

fn read_jsonl_records(path: &Path) -> anyhow::Result<Vec<GeneratedQa>> {
    let content = fs::read_to_string(path)?;
    let mut records = Vec::new();

    for (idx, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let record = serde_json::from_str(trimmed).with_context(|| {
            format!(
                "failed to parse dataset line {} in {}",
                idx + 1,
                path.display()
            )
        })?;
        records.push(record);
    }

    Ok(records)
}

fn load_qa_batches(app: &AppHandle) -> anyhow::Result<Vec<QaBatchSummary>> {
    let output_root = runtime_data_root(app)?.join("output");
    if !output_root.exists() {
        return Ok(Vec::new());
    }

    let mut batches = Vec::new();
    for entry in fs::read_dir(&output_root)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }
        if path.join("dataset.jsonl").exists() || path.join("pack_summary.json").exists() {
            if let Ok(summary) = build_qa_batch_summary(app, &path) {
                batches.push(summary);
            }
        }
    }

    Ok(batches)
}

fn build_qa_batch_summary(app: &AppHandle, batch_dir: &Path) -> anyhow::Result<QaBatchSummary> {
    let runtime_root = runtime_data_root(app)?;
    let id = path_relative_id(&runtime_root, batch_dir)?;
    let name = batch_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_string();

    let topic_path = batch_dir.join("topic.json");
    let config_path = batch_dir.join("generate_config.json");
    let pack_summary_path = batch_dir.join("pack_summary.json");
    let dataset_path = batch_dir.join("dataset.jsonl");

    let topic = if topic_path.exists() {
        Some(read_json::<TopicSpec>(&topic_path)?)
    } else {
        None
    };
    let config = if config_path.exists() {
        Some(read_json::<GenerateConfig>(&config_path)?)
    } else {
        None
    };
    let pack_summary = if pack_summary_path.exists() {
        Some(read_json::<PackedDataset>(&pack_summary_path)?)
    } else {
        None
    };

    let total_count = if let Some(summary) = &pack_summary {
        summary.total_input
    } else if dataset_path.exists() {
        read_jsonl_records(&dataset_path)?.len()
    } else {
        0
    };
    let kept_count = pack_summary
        .as_ref()
        .map(|summary| summary.kept)
        .unwrap_or(total_count);

    let updated_at_ms = latest_modified_ms(&[
        dataset_path.as_path(),
        pack_summary_path.as_path(),
        topic_path.as_path(),
        config_path.as_path(),
    ]);

    Ok(QaBatchSummary {
        id,
        name: name.clone(),
        topic_name: topic
            .as_ref()
            .map(|value| value.topic_name.clone())
            .or_else(|| pack_summary.as_ref().map(|value| value.topic_name.clone()))
            .unwrap_or_else(|| name.clone()),
        prompt: topic
            .as_ref()
            .map(|value| value.user_intent.clone())
            .unwrap_or_default(),
        kept_count,
        total_count,
        provider: config.as_ref().map(|value| value.provider.provider.clone()),
        model: config.as_ref().map(|value| value.provider.model.clone()),
        output_dir: batch_dir.display().to_string(),
        updated_at_ms,
    })
}

fn resolve_batch_dir(app: &AppHandle, batch_id: &str) -> anyhow::Result<PathBuf> {
    let batch_dir = resolve_app_relative_path(app, batch_id)?;
    if !batch_dir.exists() {
        anyhow::bail!("batch directory does not exist: {}", batch_dir.display());
    }
    Ok(batch_dir)
}

fn path_relative_id(root: &Path, path: &Path) -> anyhow::Result<String> {
    let relative = path
        .strip_prefix(root)
        .with_context(|| format!("{} is not inside {}", path.display(), root.display()))?;
    let parts = relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>();
    Ok(parts.join("/"))
}

fn latest_modified_ms(paths: &[&Path]) -> Option<u64> {
    paths.iter()
        .filter_map(|path| fs::metadata(path).ok())
        .filter_map(|metadata| metadata.modified().ok())
        .filter_map(system_time_to_ms)
        .max()
}

fn system_time_to_ms(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

fn next_managed_output_dir(app: &AppHandle, topic_name: &str) -> anyhow::Result<PathBuf> {
    let output_root = runtime_data_root(app)?.join("output");
    fs::create_dir_all(&output_root)?;

    let slug = slugify_for_path(topic_name);
    let timestamp = system_time_to_ms(SystemTime::now()).unwrap_or(0);
    Ok(output_root.join(format!("{slug}-{timestamp}")))
}

fn slugify_for_path(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_separator = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_was_separator = false;
            continue;
        }

        if !last_was_separator {
            slug.push('-');
            last_was_separator = true;
        }
    }

    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "qa-batch".to_string()
    } else {
        slug.chars().take(48).collect()
    }
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
            list_qa_batches,
            delete_qa_batch,
            upload_qa_batch,
            list_batch_qa_records,
            get_batch_qa_record,
            open_path,
            run_pipeline,
            check_for_app_update,
            install_app_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
