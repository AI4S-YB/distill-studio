use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::types::*;

pub(crate) const COT_SAFE_BATCH_SIZE: usize = 1;
pub(crate) const COT_SAFE_MAX_IN_FLIGHT: usize = 2;
pub(crate) const COT_SAFE_SHARD_SIZE_CAP: usize = 10;
pub(crate) const QA_PLATFORM_BATCH_SOURCE: &str = "qa-xiaozhao";
pub(crate) const PAPER_QA_SAVE_SHARD_SIZE: usize = 1;
pub(crate) const DEFAULT_RELEASES_PAGE_URL: &str =
    "https://github.com/AI4S-YB/distill-studio/releases/latest";

pub(crate) fn default_managed_run_mode() -> String {
    "new".to_string()
}

// ---- Runtime normalization ----

pub(crate) fn normalize_runtime_for_qa_mode(
    qa_mode: &str,
    target_count: usize,
    shard_size: usize,
    batch_size: usize,
    max_in_flight: usize,
    max_retries: u32,
    request_timeout_secs: u64,
    resume: bool,
) -> distill_core::RuntimeConfig {
    let safe_target = target_count.max(1);
    let safe_shard_size = shard_size.max(1);
    let safe_batch_size = batch_size.max(1);
    let safe_max_in_flight = max_in_flight.max(1);

    if qa_mode == "cot" {
        return distill_core::RuntimeConfig {
            target_count: safe_target,
            shard_size: safe_target.min(COT_SAFE_SHARD_SIZE_CAP).max(1),
            batch_size: COT_SAFE_BATCH_SIZE,
            max_in_flight: COT_SAFE_MAX_IN_FLIGHT,
            max_retries,
            request_timeout_secs,
            resume,
        };
    }

    distill_core::RuntimeConfig {
        target_count: safe_target,
        shard_size: safe_shard_size,
        batch_size: safe_batch_size,
        max_in_flight: safe_max_in_flight,
        max_retries,
        request_timeout_secs,
        resume,
    }
}

pub(crate) fn normalize_cot_section_headers_for_language(
    headers: &[String],
    output_language: &str,
) -> Vec<String> {
    let normalized = headers
        .iter()
        .map(|value| value.trim().trim_end_matches(':').trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if normalized.is_empty() {
        distill_core::default_cot_section_headers_for_language(output_language)
    } else {
        normalized
    }
}

// ---- Path helpers ----

pub(crate) fn dev_app_root() -> Option<PathBuf> {
    let app_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)?;

    let has_workspace_markers = app_root.join("package.json").exists()
        && app_root.join("src-tauri/tauri.conf.json").exists();
    if has_workspace_markers {
        Some(app_root)
    } else {
        None
    }
}

pub(crate) fn runtime_data_root(app: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root)
    } else {
        Ok(app.path().app_data_dir()?.join("workspace"))
    }
}

pub(crate) fn runtime_config_root(app: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root)
    } else {
        Ok(app.path().app_config_dir()?)
    }
}

pub(crate) fn resolve_app_relative_path(app: &tauri::AppHandle, path: &str) -> anyhow::Result<PathBuf> {
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

pub(crate) fn local_pipeline_profiles_dir(app: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root.join("config/local/profiles"))
    } else {
        Ok(runtime_config_root(app)?.join("profiles"))
    }
}

pub(crate) fn local_pipeline_profile_path(
    app: &tauri::AppHandle,
    profile_name: &str,
) -> anyhow::Result<PathBuf> {
    Ok(local_pipeline_profiles_dir(app)?.join(format!("{profile_name}.json")))
}

pub(crate) fn legacy_local_pipeline_config_path(app: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root.join("config/local/gui.pipeline.json"))
    } else {
        Ok(runtime_config_root(app)?.join("gui.pipeline.json"))
    }
}

pub(crate) fn default_profile_name() -> String {
    "default".to_string()
}

pub(crate) fn normalize_profile_name(profile_name: Option<String>) -> String {
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

pub(crate) fn default_managed_output_root(app: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    Ok(runtime_data_root(app)?.join("output"))
}

pub(crate) fn configured_managed_output_root(app: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    let Some(request) = load_default_pipeline_request(app)? else {
        return default_managed_output_root(app);
    };

    let Some(root) = request
        .managed_output_root
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return default_managed_output_root(app);
    };

    resolve_app_relative_path(app, root)
}

pub(crate) fn managed_output_root_for_request(
    app: &tauri::AppHandle,
    request: &PipelineRequest,
) -> anyhow::Result<PathBuf> {
    let Some(root) = request
        .managed_output_root
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return configured_managed_output_root(app);
    };

    resolve_app_relative_path(app, root)
}

pub(crate) fn load_default_pipeline_request(
    app: &tauri::AppHandle,
) -> anyhow::Result<Option<PipelineRequest>> {
    let default_name = default_profile_name();
    let path = local_pipeline_profile_path(app, &default_name)?;
    if path.exists() {
        return Ok(Some(read_json(&path)?));
    }

    let legacy_path = legacy_local_pipeline_config_path(app)?;
    if legacy_path.exists() {
        return Ok(Some(read_json(&legacy_path)?));
    }

    Ok(None)
}

// ---- File I/O helpers ----

pub(crate) fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(value)?)?;
    Ok(())
}

pub(crate) fn write_jsonl(path: &Path, records: &[distill_core::GeneratedQa]) -> anyhow::Result<()> {
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

pub(crate) fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> anyhow::Result<T> {
    let content = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&content)?)
}

pub(crate) fn read_jsonl_records(path: &Path) -> anyhow::Result<Vec<distill_core::GeneratedQa>> {
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

pub(crate) fn slugify_for_path(value: &str) -> String {
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

pub(crate) fn next_managed_output_dir(
    output_root: &Path,
    topic_name: &str,
) -> anyhow::Result<PathBuf> {
    fs::create_dir_all(output_root)?;

    let slug = slugify_for_path(topic_name);
    let timestamp = system_time_to_ms(SystemTime::now()).unwrap_or(0);
    Ok(output_root.join(format!("{slug}-{timestamp}")))
}

pub(crate) fn system_time_to_ms(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

pub(crate) fn error_to_string<E>(error: E) -> String
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

// ---- Batch helpers ----

pub(crate) fn load_qa_batches(app: &tauri::AppHandle) -> anyhow::Result<Vec<QaBatchSummary>> {
    let output_root = configured_managed_output_root(app)?;
    if !output_root.exists() {
        return Ok(Vec::new());
    }

    let mut batches = Vec::new();
    for entry in fs::read_dir(&output_root)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }
        if path.join("dataset.jsonl").exists()
            || path.join("pack_summary.json").exists()
            || has_generated_shards(&path)
        {
            if let Ok(summary) = build_qa_batch_summary(app, &path) {
                batches.push(summary);
            }
        }
    }

    Ok(batches)
}

pub(crate) fn resolve_batch_dir(app: &tauri::AppHandle, batch_id: &str) -> anyhow::Result<PathBuf> {
    let output_root = configured_managed_output_root(app)?;
    let batch_dir = if Path::new(batch_id).is_absolute() {
        PathBuf::from(batch_id)
    } else {
        output_root.join(batch_id)
    };
    if !batch_dir.exists() {
        anyhow::bail!("batch directory does not exist: {}", batch_dir.display());
    }
    Ok(batch_dir)
}

pub(crate) fn has_generated_shards(batch_dir: &Path) -> bool {
    let generated_dir = batch_dir.join("generated");
    if !generated_dir.exists() {
        return false;
    }

    fs::read_dir(generated_dir)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(|entry| entry.ok().map(|value| value.path())))
        .any(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|name| {
                    name.starts_with("shard_")
                        && path.extension().and_then(|ext| ext.to_str()) == Some("json")
                })
        })
}

pub(crate) fn load_generated_shards(
    input_dir: &Path,
) -> anyhow::Result<Vec<distill_core::QaShard>> {
    let mut paths = fs::read_dir(input_dir)?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| {
            path.extension().and_then(|ext| ext.to_str()) == Some("json")
                && path.file_name().and_then(|name| name.to_str()) != Some("summary.json")
        })
        .collect::<Vec<_>>();
    paths.sort();

    paths
        .into_iter()
        .map(|path| -> anyhow::Result<distill_core::QaShard> {
            let content = fs::read_to_string(&path)?;
            Ok(serde_json::from_str(&content)?)
        })
        .collect()
}

pub(crate) fn load_generated_records(
    input_dir: &Path,
) -> anyhow::Result<(String, Vec<distill_core::GeneratedQa>)> {
    let shards = load_generated_shards(input_dir)?;
    let topic_name = shards
        .first()
        .map(|shard| shard.topic_name.clone())
        .unwrap_or_default();
    let records = shards.into_iter().flat_map(|shard| shard.items).collect();

    Ok((topic_name, records))
}

pub(crate) fn load_batch_records(
    batch_dir: &Path,
) -> anyhow::Result<Vec<distill_core::GeneratedQa>> {
    let dataset_path = batch_dir.join("dataset.jsonl");
    if dataset_path.exists() {
        let records = read_jsonl_records(&dataset_path)?;
        if !records.is_empty() {
            return Ok(records);
        }
    }

    let pack_summary_path = batch_dir.join("pack_summary.json");
    if pack_summary_path.exists() {
        let packed: distill_core::PackedDataset = read_json(&pack_summary_path)?;
        if !packed.items.is_empty() {
            return Ok(packed.items);
        }
    }

    let generated_dir = batch_dir.join("generated");
    if generated_dir.exists() {
        let (_, records) = load_generated_records(&generated_dir)?;
        return Ok(records);
    }

    anyhow::bail!("no QA records found in {}", batch_dir.display());
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
    paths
        .iter()
        .filter_map(|path| fs::metadata(path).ok())
        .filter_map(|metadata| metadata.modified().ok())
        .filter_map(system_time_to_ms)
        .max()
}

fn latest_modified_ms_in_dir(path: &Path) -> Option<u64> {
    if !path.exists() {
        return None;
    }

    fs::read_dir(path)
        .ok()?
        .filter_map(|entry| entry.ok().map(|value| value.path()))
        .filter_map(|entry_path| fs::metadata(entry_path).ok())
        .filter_map(|metadata| metadata.modified().ok())
        .filter_map(system_time_to_ms)
        .max()
}

pub(crate) fn build_qa_batch_summary(
    app: &tauri::AppHandle,
    batch_dir: &Path,
) -> anyhow::Result<QaBatchSummary> {
    let output_root = configured_managed_output_root(app)?;
    let id = path_relative_id(&output_root, batch_dir)?;
    let name = batch_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_string();

    let topic_path = batch_dir.join("topic.json");
    let config_path = batch_dir.join("generate_config.json");
    let pack_summary_path = batch_dir.join("pack_summary.json");
    let dataset_path = batch_dir.join("dataset.jsonl");
    let generated_dir = batch_dir.join("generated");
    let generated_summary_path = generated_dir.join("summary.json");
    let review_state_path = batch_review_state_path(batch_dir);

    let topic = if topic_path.exists() {
        Some(read_json::<distill_core::TopicSpec>(&topic_path)?)
    } else {
        None
    };
    let config = if config_path.exists() {
        Some(read_json::<distill_core::GenerateConfig>(&config_path)?)
    } else {
        None
    };
    let pack_summary = if pack_summary_path.exists() {
        Some(read_json::<distill_core::PackedDataset>(&pack_summary_path)?)
    } else {
        None
    };
    let generated_summary = if generated_summary_path.exists() {
        Some(read_json::<distill_core::GenerateSummary>(&generated_summary_path)?)
    } else {
        None
    };
    let generated_shards = if generated_dir.exists() {
        Some(load_generated_shards(&generated_dir)?)
    } else {
        None
    };
    let generated_records = generated_shards.as_ref().map(|shards| {
        shards
            .iter()
            .flat_map(|shard| shard.items.iter().cloned())
            .collect::<Vec<_>>()
    });
    let review_summary = summarize_review_state(&load_batch_review_state(batch_dir)?);
    let fallback_shard_count = config
        .as_ref()
        .map(|value| {
            value
                .runtime
                .target_count
                .div_ceil(value.runtime.shard_size.max(1))
        })
        .or_else(|| generated_shards.as_ref().map(|shards| shards.len()));
    let fallback_completed_shards = generated_shards
        .as_ref()
        .map(|shards| shards.iter().filter(|shard| shard.completed).count())
        .unwrap_or(0);
    let fallback_request_count = generated_shards.as_ref().map(|shards| {
        let batch_size = config
            .as_ref()
            .map(|value| value.runtime.batch_size)
            .unwrap_or(1)
            .max(1);
        shards
            .iter()
            .map(|shard| shard.item_count.div_ceil(batch_size))
            .sum::<usize>()
    });

    let generated_count = if let Some(summary) = &generated_summary {
        summary.generated_count
    } else if let Some(records) = &generated_records {
        records.len()
    } else {
        0
    };

    let total_count = if let Some(summary) = &pack_summary {
        summary.total_input
    } else if dataset_path.exists() {
        read_jsonl_records(&dataset_path)?.len()
    } else {
        generated_count
    };
    let kept_count = pack_summary
        .as_ref()
        .map(|summary| summary.kept)
        .unwrap_or(total_count);
    let status = if pack_summary_path.exists() || dataset_path.exists() {
        "completed".to_string()
    } else if generated_count > 0 {
        if generated_summary
            .as_ref()
            .is_some_and(|summary| summary.completed_shards >= summary.shard_count)
            || generated_shards.as_ref().is_some_and(|shards| {
                !shards.is_empty() && shards.iter().all(|shard| shard.completed)
            })
        {
            "generated".to_string()
        } else {
            "running".to_string()
        }
    } else {
        "prepared".to_string()
    };

    let updated_at_ms = latest_modified_ms(&[
        dataset_path.as_path(),
        pack_summary_path.as_path(),
        topic_path.as_path(),
        config_path.as_path(),
        generated_summary_path.as_path(),
        review_state_path.as_path(),
    ])
    .into_iter()
    .chain(latest_modified_ms_in_dir(&generated_dir))
    .max();

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
        qa_mode: config.as_ref().map(|value| value.qa_mode.clone()),
        target_count: config.as_ref().map(|value| value.runtime.target_count),
        generated_count,
        kept_count,
        total_count,
        shard_count: generated_summary
            .as_ref()
            .map(|value| value.shard_count)
            .or(fallback_shard_count),
        completed_shards: generated_summary
            .as_ref()
            .map(|value| value.completed_shards)
            .unwrap_or(fallback_completed_shards),
        skipped_shards: generated_summary
            .as_ref()
            .map(|value| value.skipped_shards)
            .unwrap_or(0),
        request_count: generated_summary
            .as_ref()
            .map(|value| value.request_count)
            .or(fallback_request_count),
        status,
        provider: config.as_ref().map(|value| value.provider.provider.clone()),
        model: config.as_ref().map(|value| value.provider.model.clone()),
        cot_section_headers: config
            .as_ref()
            .map(|value| {
                normalize_cot_section_headers_for_language(
                    &value.cot_section_headers,
                    &value.output_language,
                )
            })
            .unwrap_or_else(distill_core::default_cot_section_headers),
        output_dir: batch_dir.display().to_string(),
        updated_at_ms,
        reviewed_count: review_summary.reviewed_count,
        review_kept_count: review_summary.kept_count,
        discarded_count: review_summary.discarded_count,
    })
}

// ---- Review helpers ----

pub(crate) fn batch_review_state_path(batch_dir: &Path) -> PathBuf {
    batch_dir.join("review_state.json")
}

pub(crate) fn load_batch_review_state(batch_dir: &Path) -> anyhow::Result<BatchReviewState> {
    let path = batch_review_state_path(batch_dir);
    if !path.exists() {
        return Ok(BatchReviewState::default());
    }
    read_json(&path)
}

pub(crate) fn persist_batch_review_state(
    batch_dir: &Path,
    state: &BatchReviewState,
) -> anyhow::Result<()> {
    let path = batch_review_state_path(batch_dir);
    if state.items.is_empty() {
        if path.exists() {
            fs::remove_file(path)?;
        }
        return Ok(());
    }
    write_json(&path, state)
}

pub(crate) fn parse_review_status(value: &str) -> Option<ReviewStatus> {
    match value.trim() {
        "unreviewed" => Some(ReviewStatus::Unreviewed),
        "kept" => Some(ReviewStatus::Kept),
        "discarded" => Some(ReviewStatus::Discarded),
        _ => None,
    }
}

pub(crate) fn normalize_edited_question(
    item: &distill_core::GeneratedQa,
    value: Option<String>,
) -> Option<String> {
    value.and_then(|question| {
        let trimmed = question.trim();
        if trimmed.is_empty() || trimmed == item.question.trim() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

pub(crate) fn review_snapshot_for_item(
    item: &distill_core::GeneratedQa,
    state: &BatchReviewState,
) -> QaRecordReview {
    let review = state.items.get(&item.id);
    let edited_question = review
        .and_then(|value| value.edited_question.clone())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    QaRecordReview {
        status: review.map(|value| value.status).unwrap_or_default(),
        effective_question: edited_question
            .clone()
            .unwrap_or_else(|| item.question.clone()),
        edited_question,
        updated_at_ms: review.and_then(|value| value.updated_at_ms),
    }
}

pub(crate) fn summarize_record(
    item: &distill_core::GeneratedQa,
    review_state: &BatchReviewState,
) -> QaRecordSummary {
    let review = review_snapshot_for_item(item, review_state);
    QaRecordSummary {
        id: item.id.clone(),
        question: item.question.clone(),
        subtopic: item.subtopic.clone(),
        axis: item.axis.clone(),
        question_type: item.question_type.clone(),
        difficulty: item.difficulty.clone(),
        audience: item.audience.clone(),
        review_status: review.status,
        edited_question: review.edited_question,
        effective_question: review.effective_question,
    }
}

pub(crate) fn summarize_review_state(state: &BatchReviewState) -> QaBatchReviewSummary {
    let mut summary = QaBatchReviewSummary::default();
    for item in state.items.values() {
        match item.status {
            ReviewStatus::Kept => {
                summary.reviewed_count += 1;
                summary.kept_count += 1;
            }
            ReviewStatus::Discarded => {
                summary.reviewed_count += 1;
                summary.discarded_count += 1;
            }
            ReviewStatus::Unreviewed => {}
        }
    }
    summary
}

pub(crate) fn upload_ready_records(
    records: Vec<distill_core::GeneratedQa>,
    review_state: &BatchReviewState,
) -> Vec<distill_core::GeneratedQa> {
    if review_state.items.is_empty() {
        return records;
    }

    records
        .into_iter()
        .filter_map(|mut item| {
            let review = review_snapshot_for_item(&item, review_state);
            if review.status != ReviewStatus::Kept {
                return None;
            }
            item.question = review.effective_question;
            Some(item)
        })
        .collect()
}

// ---- Packing helpers ----

pub(crate) fn pack_generated_batch(
    topic: &distill_core::TopicSpec,
    generated_dir: &Path,
    dataset_path: &Path,
    pack_summary_path: &Path,
) -> anyhow::Result<distill_core::PackedDataset> {
    let (_, records) = load_generated_records(generated_dir)?;
    let pack_config: distill_core::PackConfig = distill_core::default_pack_config();
    let packed = distill_core::pack_qa_records(topic, records, &pack_config);
    write_jsonl(dataset_path, &packed.items)?;
    write_json(pack_summary_path, &packed)?;
    Ok(packed)
}

pub(crate) fn repack_batch_dir(
    app: &tauri::AppHandle,
    batch_dir: &Path,
) -> anyhow::Result<RepackQaBatchResponse> {
    let topic_path = batch_dir.join("topic.json");
    let generated_dir = batch_dir.join("generated");
    let dataset_path = batch_dir.join("dataset.jsonl");
    let pack_summary_path = batch_dir.join("pack_summary.json");

    if !topic_path.exists() {
        anyhow::bail!("topic.json not found in {}", batch_dir.display());
    }
    if !generated_dir.exists() || !has_generated_shards(batch_dir) {
        anyhow::bail!("generated shards not found in {}", batch_dir.display());
    }

    let topic: distill_core::TopicSpec = read_json(&topic_path)?;
    let packed = pack_generated_batch(&topic, &generated_dir, &dataset_path, &pack_summary_path)?;
    let batch = build_qa_batch_summary(app, batch_dir)?;

    Ok(RepackQaBatchResponse {
        batch,
        kept_count: packed.kept,
        total_input: packed.total_input,
        dropped_off_topic: packed.dropped_off_topic,
        dataset_path: dataset_path.display().to_string(),
        pack_summary_path: pack_summary_path.display().to_string(),
    })
}

// ---- Resume helpers ----

pub(crate) fn normalize_prompt_for_match(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub(crate) fn find_latest_matching_batch_dir(
    app: &tauri::AppHandle,
    request: &PipelineRequest,
) -> anyhow::Result<Option<PathBuf>> {
    let normalized_prompt = normalize_prompt_for_match(&request.prompt);
    let mut matches = load_qa_batches(app)?
        .into_iter()
        .filter(|batch| normalize_prompt_for_match(&batch.prompt) == normalized_prompt)
        .filter(|batch| batch.qa_mode.as_deref().unwrap_or("normal") == request.qa_mode)
        .filter(|batch| batch.provider.as_deref().unwrap_or_default() == request.provider)
        .filter(|batch| batch.model.as_deref().unwrap_or_default() == request.model)
        .collect::<Vec<_>>();

    matches.sort_by(|left, right| right.updated_at_ms.cmp(&left.updated_at_ms));

    Ok(matches
        .into_iter()
        .next()
        .map(|batch| PathBuf::from(batch.output_dir)))
}

// ---- Pipeline event emission ----

pub(crate) fn emit_pipeline_event(
    window: &tauri::Window,
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
            runtime_kind: None,
            retry_attempt: None,
            retry_limit: None,
            attempt_number: None,
            attempt_limit: None,
            error_message: None,
            shard_index: None,
            shard_count: None,
            shard_item_completed: None,
            shard_item_total: None,
            total_generated: None,
            target_count: None,
            batch_index: None,
            batch_count_in_shard: None,
            batch_size: None,
            duration_ms: None,
            backoff_secs: None,
            subtopic: None,
            axis: None,
            question_type: None,
            difficulty: None,
            audience: None,
        },
    );
}

pub(crate) fn emit_runtime_progress_event(
    window: &tauri::Window,
    event: &distill_runtime::RuntimeProgress,
    total_steps: usize,
) {
    let plan_suffix = format_runtime_plan_suffix(event);
    let batch_suffix = format_runtime_batch_suffix(event);
    let duration_suffix = format_runtime_duration_suffix(event.duration_ms);
    let (status, message) = match event.kind {
        distill_runtime::RuntimeProgressKind::ShardStarted => (
            "running",
            format!(
                "Generating shard {}/{} (target {} items).",
                event.shard_index,
                event.shard_count,
                event.shard_item_total.unwrap_or(0)
            ),
        ),
        distill_runtime::RuntimeProgressKind::ShardSkipped => (
            "completed",
            format!(
                "Skipped existing shard {}/{} ({} items already available).",
                event.shard_index,
                event.shard_count,
                event.shard_item_completed.unwrap_or(0)
            ),
        ),
        distill_runtime::RuntimeProgressKind::BatchStarted => (
            "running",
            format!(
                "Shard {}/{}{} started attempt {}/{} for {} item(s){}{}.",
                event.shard_index,
                event.shard_count,
                batch_suffix,
                event.attempt_number.unwrap_or(1),
                event.attempt_limit.unwrap_or(1),
                event.batch_size.unwrap_or(0),
                plan_suffix,
                duration_suffix
            ),
        ),
        distill_runtime::RuntimeProgressKind::BatchCompleted => (
            "running",
            format!(
                "Shard {}/{}{} completed {} item(s){} · shard {}/{} · total {}/{}{}.",
                event.shard_index,
                event.shard_count,
                batch_suffix,
                event.batch_size.unwrap_or(0),
                plan_suffix,
                event.shard_item_completed.unwrap_or(0),
                event.shard_item_total.unwrap_or(0),
                event.total_generated.unwrap_or(0),
                event.target_count.unwrap_or(0),
                duration_suffix
            ),
        ),
        distill_runtime::RuntimeProgressKind::ShardCompleted => (
            "completed",
            format!(
                "Shard {}/{} completed: {}/{} · total {}/{}.",
                event.shard_index,
                event.shard_count,
                event.shard_item_completed.unwrap_or(0),
                event.shard_item_total.unwrap_or(0),
                event.total_generated.unwrap_or(0),
                event.target_count.unwrap_or(0)
            ),
        ),
        distill_runtime::RuntimeProgressKind::BatchRetry => (
            "running",
            format!(
                "Shard {}/{}{} attempt {}/{} failed{}; retry {}/{} in {}s: {}{}",
                event.shard_index,
                event.shard_count,
                batch_suffix,
                event.attempt_number.unwrap_or(0),
                event.attempt_limit.unwrap_or(0),
                duration_suffix,
                event.retry_attempt.unwrap_or(0),
                event.retry_limit.unwrap_or(0),
                event.backoff_secs.unwrap_or(0),
                event.error_message.as_deref().unwrap_or("unknown error"),
                plan_suffix
            ),
        ),
        distill_runtime::RuntimeProgressKind::BatchFailed => (
            "failed",
            format!(
                "Shard {}/{}{} failed on attempt {}/{} after {}/{} retries{}: {}{}",
                event.shard_index,
                event.shard_count,
                batch_suffix,
                event.attempt_number.unwrap_or(0),
                event.attempt_limit.unwrap_or(0),
                event.retry_attempt.unwrap_or(0),
                event.retry_limit.unwrap_or(0),
                duration_suffix,
                event.error_message.as_deref().unwrap_or("unknown error"),
                plan_suffix
            ),
        ),
    };

    let _ = window.emit(
        "pipeline-progress",
        PipelineProgressEvent {
            stage: "generate".to_string(),
            status: status.to_string(),
            message,
            current_step: 3,
            total_steps,
            runtime_kind: Some(
                match event.kind {
                    distill_runtime::RuntimeProgressKind::ShardStarted => "shard_started",
                    distill_runtime::RuntimeProgressKind::ShardSkipped => "shard_skipped",
                    distill_runtime::RuntimeProgressKind::BatchStarted => "batch_started",
                    distill_runtime::RuntimeProgressKind::BatchCompleted => "batch_completed",
                    distill_runtime::RuntimeProgressKind::ShardCompleted => "shard_completed",
                    distill_runtime::RuntimeProgressKind::BatchRetry => "batch_retry",
                    distill_runtime::RuntimeProgressKind::BatchFailed => "batch_failed",
                }
                .to_string(),
            ),
            retry_attempt: event.retry_attempt,
            retry_limit: event.retry_limit,
            attempt_number: event.attempt_number,
            attempt_limit: event.attempt_limit,
            error_message: event.error_message.clone(),
            shard_index: Some(event.shard_index),
            shard_count: Some(event.shard_count),
            shard_item_completed: event.shard_item_completed,
            shard_item_total: event.shard_item_total,
            total_generated: event.total_generated,
            target_count: event.target_count,
            batch_index: event.batch_index,
            batch_count_in_shard: event.batch_count_in_shard,
            batch_size: event.batch_size,
            duration_ms: event.duration_ms,
            backoff_secs: event.backoff_secs,
            subtopic: event.subtopic.clone(),
            axis: event.axis.clone(),
            question_type: event.question_type.clone(),
            difficulty: event.difficulty.clone(),
            audience: event.audience.clone(),
        },
    );
}

fn format_runtime_batch_suffix(event: &distill_runtime::RuntimeProgress) -> String {
    match (event.batch_index, event.batch_count_in_shard) {
        (Some(batch_index), Some(batch_count_in_shard)) => {
            format!(" batch {batch_index}/{batch_count_in_shard}")
        }
        _ => String::new(),
    }
}

fn format_runtime_duration_suffix(duration_ms: Option<u64>) -> String {
    let Some(duration_ms) = duration_ms else {
        return String::new();
    };

    if duration_ms >= 1_000 {
        format!(" in {:.1}s", duration_ms as f64 / 1_000.0)
    } else {
        format!(" in {duration_ms}ms")
    }
}

fn format_runtime_plan_suffix(event: &distill_runtime::RuntimeProgress) -> String {
    let mut parts = Vec::new();
    if let Some(value) = event.subtopic.as_deref() {
        parts.push(format!("subtopic={value}"));
    }
    if let Some(value) = event.axis.as_deref() {
        parts.push(format!("axis={value}"));
    }
    if let Some(value) = event.question_type.as_deref() {
        parts.push(format!("type={value}"));
    }
    if let Some(value) = event.difficulty.as_deref() {
        parts.push(format!("difficulty={value}"));
    }
    if let Some(value) = event.audience.as_deref() {
        parts.push(format!("audience={value}"));
    }

    if parts.is_empty() {
        String::new()
    } else {
        format!(" [{}]", parts.join(" · "))
    }
}

pub(crate) fn is_pipeline_cancelled_error(error: &anyhow::Error) -> bool {
    error.to_string().contains("pipeline canceled by user")
}

pub(crate) fn emit_app_update_event(window: &tauri::Window, stage: &str, status: &str, message: &str) {
    let _ = window.emit(
        "app-update-progress",
        AppUpdateProgressEvent {
            stage: stage.to_string(),
            status: status.to_string(),
            message: message.to_string(),
        },
    );
}

// ---- Updater helpers ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct UpdaterRuntimeConfig {
    pub(crate) pubkey: String,
    pub(crate) endpoints: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUpdateCheckResponse {
    pub(crate) configured: bool,
    pub(crate) update_available: bool,
    pub(crate) current_version: String,
    pub(crate) version: Option<String>,
    pub(crate) body: Option<String>,
    pub(crate) date: Option<String>,
    pub(crate) source_path: Option<String>,
    pub(crate) manual_download_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUpdateProgressEvent {
    pub(crate) stage: String,
    pub(crate) status: String,
    pub(crate) message: String,
}

pub(crate) fn updater_runtime_config_path(app: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root.join("config/local/updater.json"))
    } else {
        Ok(runtime_config_root(app)?.join("updater.json"))
    }
}

pub(crate) fn load_updater_runtime_config(
    app: &tauri::AppHandle,
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

    Ok(Some((UpdaterRuntimeConfig { pubkey, endpoints }, path)))
}

fn release_page_url_from_endpoint(endpoint: &str) -> Option<String> {
    let trimmed = endpoint.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(prefix) = trimmed.strip_suffix("/releases/latest/download/latest.json") {
        return Some(format!("{prefix}/releases/latest"));
    }

    if let Some((prefix, suffix)) = trimmed.split_once("/releases/download/") {
        if let Some((tag, _)) = suffix.split_once('/') {
            return Some(format!("{prefix}/releases/tag/{tag}"));
        }
    }

    None
}

pub(crate) fn manual_download_url(app: &tauri::AppHandle) -> Option<String> {
    load_updater_runtime_config(app)
        .ok()
        .flatten()
        .and_then(|(config, _)| {
            config
                .endpoints
                .iter()
                .find_map(|endpoint| release_page_url_from_endpoint(endpoint))
        })
        .or_else(|| Some(DEFAULT_RELEASES_PAGE_URL.to_string()))
}

pub(crate) fn build_runtime_updater(
    app: &tauri::AppHandle,
    config: &UpdaterRuntimeConfig,
) -> anyhow::Result<tauri_plugin_updater::Updater> {
    let endpoints = config
        .endpoints
        .iter()
        .map(|value| {
            url::Url::parse(value)
                .with_context(|| format!("invalid updater endpoint URL `{value}`"))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;

    Ok(app
        .updater_builder()
        .pubkey(config.pubkey.clone())
        .endpoints(endpoints)?
        .build()?)
}

pub(crate) fn build_effective_updater(
    app: &tauri::AppHandle,
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
