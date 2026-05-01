use distill_core::{
    bootstrap_topic, default_cot_section_headers,
    default_output_language, default_qa_mode, draft_question_plans, GenerateConfig, ProviderConfig,
    QuestionPlan, RuntimeConfig, TopicSpec,
};
use distill_runtime::{generate_to_directory_with_progress, RuntimeProgress};
use serde::{de::DeserializeOwned, Serialize};
use std::fs;
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::SystemTime;
use tauri::{AppHandle, Window};
use tokio::time::{sleep, timeout, Duration};
use url::Url;

use crate::config::*;
use crate::paper_qa_types::*;
use crate::platform_types::*;
use crate::types::*;

// ---- Platform API helpers ----

fn normalize_platform_url(input: &str) -> anyhow::Result<Url> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        anyhow::bail!("platform url is empty");
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };

    let mut url = Url::parse(&candidate)?;
    url.set_path("");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

pub(crate) fn derive_platform_endpoints(platform_url: &str) -> anyhow::Result<PlatformEndpoints> {
    let normalized = normalize_platform_url(platform_url)?;
    let host = normalized
        .host_str()
        .ok_or_else(|| anyhow::anyhow!("platform url is missing host"))?
        .to_string();
    let scheme = normalized.scheme().to_string();
    let uses_development_ports =
        matches!(host.as_str(), "127.0.0.1" | "localhost" | "182.92.166.143");

    let normalized_platform_url = if let Some(port) = normalized.port() {
        format!("{scheme}://{host}:{port}")
    } else {
        format!("{scheme}://{host}")
    };

    if uses_development_ports {
        return Ok(PlatformEndpoints {
            normalized_platform_url,
            platform_web_base_url: format!("{scheme}://{host}:3100"),
            platform_api_base_url: format!("{scheme}://{host}:8100"),
        });
    }

    Ok(PlatformEndpoints {
        normalized_platform_url: normalized_platform_url.clone(),
        platform_web_base_url: normalized_platform_url.clone(),
        platform_api_base_url: normalized_platform_url,
    })
}

pub(crate) async fn platform_login_with_token(
    platform_url: &str,
    username: &str,
    password: &str,
) -> Result<(PlatformEndpoints, String, PlatformUserSummary), String> {
    let endpoints = derive_platform_endpoints(platform_url).map_err(error_to_string)?;
    let username = username.trim();
    let password = password.trim();
    if username.is_empty() {
        return Err("platform username is empty".to_string());
    }
    if password.is_empty() {
        return Err("platform password is empty".to_string());
    }

    let client = reqwest::Client::new();
    let login_response = client
        .post(format!(
            "{}/api/auth/login",
            endpoints.platform_api_base_url
        ))
        .json(&serde_json::json!({
            "username": username,
            "password": password,
        }))
        .send()
        .await
        .map_err(error_to_string)?;
    let login_status = login_response.status();
    if !login_status.is_success() {
        let body = login_response.text().await.unwrap_or_default();
        let detail = body.trim();
        return Err(if detail.is_empty() {
            format!(
                "platform login failed with status {}",
                login_status.as_u16()
            )
        } else {
            format!(
                "platform login failed with status {}: {}",
                login_status.as_u16(),
                detail
            )
        });
    }
    let login_payload = login_response
        .json::<ApiEnvelope<PlatformLoginEnvelopeData>>()
        .await
        .map_err(error_to_string)?;
    let token = login_payload.data.token;

    let me_response = client
        .get(format!("{}/api/me", endpoints.platform_api_base_url))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(error_to_string)?;
    let me_status = me_response.status();
    if !me_status.is_success() {
        let body = me_response.text().await.unwrap_or_default();
        let detail = body.trim();
        return Err(if detail.is_empty() {
            format!(
                "platform profile fetch failed with status {}",
                me_status.as_u16()
            )
        } else {
            format!(
                "platform profile fetch failed with status {}: {}",
                me_status.as_u16(),
                detail
            )
        });
    }
    let me_payload = me_response
        .json::<ApiEnvelope<PlatformMeEnvelopeData>>()
        .await
        .map_err(error_to_string)?;

    let user = PlatformUserSummary {
        id: me_payload.data.id,
        username: me_payload.data.username,
        role: me_payload.data.role,
        status: me_payload.data.status,
        applications: me_payload
            .data
            .applications
            .into_iter()
            .map(|item| PlatformApplicationSummary {
                id: item.id,
                name: item.name,
            })
            .collect(),
    };

    Ok((endpoints, token, user))
}

pub(crate) async fn decode_platform_envelope<T: DeserializeOwned>(
    response: reqwest::Response,
) -> Result<T, String> {
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let detail = body.trim();
        return Err(if detail.is_empty() {
            format!("platform request failed with status {}", status.as_u16())
        } else {
            format!(
                "platform request failed with status {}: {}",
                status.as_u16(),
                detail
            )
        });
    }

    response
        .json::<ApiEnvelope<T>>()
        .await
        .map(|payload| payload.data)
        .map_err(error_to_string)
}

pub(crate) async fn platform_api_get<T: DeserializeOwned>(
    client: &reqwest::Client,
    token: &str,
    url: String,
) -> Result<T, String> {
    let response = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(error_to_string)?;
    decode_platform_envelope(response).await
}

pub(crate) async fn platform_api_post<B: Serialize, T: DeserializeOwned>(
    client: &reqwest::Client,
    token: &str,
    url: String,
    body: &B,
) -> Result<T, String> {
    let response = client
        .post(url)
        .bearer_auth(token)
        .json(body)
        .send()
        .await
        .map_err(error_to_string)?;
    decode_platform_envelope(response).await
}

pub(crate) async fn platform_api_delete<T: DeserializeOwned>(
    client: &reqwest::Client,
    token: &str,
    url: String,
) -> Result<T, String> {
    let response = client
        .delete(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(error_to_string)?;
    decode_platform_envelope(response).await
}

fn platform_status_lookup_candidates(batch_id: &str) -> Vec<String> {
    let batch_id = batch_id.trim();
    if batch_id.is_empty() {
        return Vec::new();
    }

    let mut candidates = vec![batch_id.to_string()];
    if let Some(legacy) = legacy_platform_external_batch_id(batch_id) {
        candidates.push(legacy);
    }
    candidates
}

fn legacy_platform_external_batch_id(batch_id: &str) -> Option<String> {
    let batch_id = batch_id.trim();
    if batch_id.is_empty() || batch_id.starts_with("output/") {
        return None;
    }
    Some(format!("output/{batch_id}"))
}

fn normalize_platform_batch_status_for_batch_id(
    status: &PlatformImportBatchStatus,
    batch_id: &str,
) -> PlatformImportBatchStatus {
    let mut normalized = status.clone();
    normalized.external_batch_id = batch_id.to_string();
    normalized
}

fn missing_platform_batch_status(batch_id: &str) -> PlatformImportBatchStatus {
    PlatformImportBatchStatus {
        source: QA_PLATFORM_BATCH_SOURCE.to_string(),
        external_batch_id: batch_id.to_string(),
        exists: false,
        batch_id: None,
        import_status: None,
        is_processing: false,
        batch_status: "missing".to_string(),
        self_review_status: None,
        peer_review_status: None,
    }
}

// ---- Commands ----

#[tauri::command]
pub(crate) fn health_check() -> &'static str {
    "ok"
}

#[tauri::command]
pub(crate) fn stop_pipeline(state: tauri::State<'_, ActivePipelineState>) -> Result<bool, String> {
    let active_flag = state
        .cancel_flag
        .lock()
        .map_err(|_| "failed to lock active pipeline state".to_string())?
        .clone();

    let Some(cancel_flag) = active_flag else {
        return Ok(false);
    };

    cancel_flag.store(true, Ordering::Relaxed);
    Ok(true)
}

#[tauri::command]
pub(crate) fn preview_topic_spec(prompt: String, target_count: u32) -> Result<TopicSpec, String> {
    bootstrap_topic(&prompt, target_count).map_err(|err| err.to_string())
}

#[tauri::command]
pub(crate) fn save_local_pipeline_config(
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
pub(crate) fn load_local_pipeline_config(
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
pub(crate) fn list_local_pipeline_profiles(app: AppHandle) -> Result<Vec<ConfigProfileSummary>, String> {
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
        let default_path =
            local_pipeline_profile_path(&app, &default_name).map_err(error_to_string)?;
        profiles.push(ConfigProfileSummary {
            name: default_name,
            path: default_path.display().to_string(),
        });
    }

    profiles.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(profiles)
}

#[tauri::command]
pub(crate) fn get_managed_output_root(app: AppHandle) -> Result<ManagedOutputRootResponse, String> {
    let output_root = default_managed_output_root(&app).map_err(error_to_string)?;
    Ok(ManagedOutputRootResponse {
        output_root: output_root.display().to_string(),
    })
}

#[tauri::command]
pub(crate) fn list_qa_batches(app: AppHandle) -> Result<Vec<QaBatchSummary>, String> {
    let mut batches = load_qa_batches(&app).map_err(error_to_string)?;
    batches.sort_by(|left, right| right.updated_at_ms.cmp(&left.updated_at_ms));
    Ok(batches)
}

#[tauri::command]
pub(crate) fn load_batch_pipeline_request(
    app: AppHandle,
    batch_id: String,
) -> Result<PipelineRequest, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let topic_path = batch_dir.join("topic.json");
    let config_path = batch_dir.join("generate_config.json");
    let plans_path = batch_dir.join("plans.json");

    let topic = if topic_path.exists() {
        Some(read_json::<TopicSpec>(&topic_path).map_err(error_to_string)?)
    } else {
        None
    };
    let config = if config_path.exists() {
        Some(read_json::<GenerateConfig>(&config_path).map_err(error_to_string)?)
    } else {
        None
    };
    let plan_limit = if plans_path.exists() {
        read_json::<Vec<QuestionPlan>>(&plans_path)
            .map(|plans| plans.len())
            .unwrap_or(0)
    } else {
        0
    };

    let topic_name = topic
        .as_ref()
        .map(|value| value.topic_name.clone())
        .unwrap_or_else(|| {
            batch_dir
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("qa-batch")
                .to_string()
        });
    let prompt = topic
        .as_ref()
        .map(|value| value.user_intent.clone())
        .unwrap_or_else(|| topic_name.clone());

    let target_count = topic
        .as_ref()
        .map(|value| value.target_count)
        .or_else(|| {
            config
                .as_ref()
                .map(|value| value.runtime.target_count as u32)
        })
        .unwrap_or(10);

    let config = config.unwrap_or_else(|| GenerateConfig {
        provider: ProviderConfig {
            provider: "openai-compatible".to_string(),
            model: "".to_string(),
            base_url: None,
            api_key: None,
            api_key_env: None,
            temperature: 0.8,
            max_tokens: 800,
        },
        runtime: RuntimeConfig {
            target_count: target_count as usize,
            shard_size: 10,
            batch_size: 1,
            max_in_flight: 1,
            max_retries: 3,
            request_timeout_secs: 180,
            resume: true,
        },
        qa_mode: default_qa_mode(),
        output_language: default_output_language(),
        cot_section_headers: default_cot_section_headers(),
        supporting_context: None,
    });

    Ok(PipelineRequest {
        prompt,
        topic_tags: Vec::new(),
        qa_mode: config.qa_mode,
        output_language: config.output_language,
        target_count,
        plan_limit: plan_limit.max(1),
        output_dir: "__managed__".to_string(),
        managed_output_root: batch_dir.parent().map(|value| value.display().to_string()),
        provider: config.provider.provider,
        model: config.provider.model,
        base_url: config.provider.base_url,
        api_key: None,
        api_key_env: None,
        temperature: config.provider.temperature,
        max_tokens: config.provider.max_tokens,
        shard_size: config.runtime.shard_size,
        batch_size: config.runtime.batch_size,
        max_in_flight: config.runtime.max_in_flight,
        max_retries: config.runtime.max_retries,
        request_timeout_secs: config.runtime.request_timeout_secs,
        resume: true,
        managed_run_mode: "resume-batch".to_string(),
        managed_run_batch_id: Some(batch_id),
        qa_platform_url: None,
        qa_platform_username: None,
        qa_platform_password: None,
        literature_api_url: None,
        literature_api_auth_token: None,
        cot_section_headers: config.cot_section_headers,
    })
}

#[tauri::command]
pub(crate) fn delete_qa_batch(app: AppHandle, batch_id: String) -> Result<(), String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    fs::remove_dir_all(&batch_dir).map_err(error_to_string)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn repack_qa_batch(app: AppHandle, batch_id: String) -> Result<RepackQaBatchResponse, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    repack_batch_dir(&app, &batch_dir).map_err(error_to_string)
}

#[tauri::command]
pub(crate) fn get_app_metadata(app: AppHandle) -> AppMetadataResponse {
    AppMetadataResponse {
        product_name: app.package_info().name.to_string(),
        version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
pub(crate) async fn check_platform_health(platform_url: String) -> Result<PlatformHealthResponse, String> {
    let endpoints = derive_platform_endpoints(&platform_url).map_err(error_to_string)?;
    let client = reqwest::Client::new();
    let health_url = format!("{}/health", endpoints.platform_api_base_url);
    let auth_probe_url = format!("{}/api/auth/login", endpoints.platform_api_base_url);

    if let Ok(response) = client.get(&health_url).send().await {
        if response.status().is_success() {
            return Ok(PlatformHealthResponse {
                reachable: true,
                endpoints,
                message: "ok".to_string(),
            });
        }
    }

    if let Ok(response) = client
        .post(&auth_probe_url)
        .json(&serde_json::json!({
            "username": "__distill_probe__",
            "password": "__distill_probe__",
        }))
        .send()
        .await
    {
        let status = response.status();
        if status.is_success()
            || matches!(
                status,
                reqwest::StatusCode::BAD_REQUEST
                    | reqwest::StatusCode::UNAUTHORIZED
                    | reqwest::StatusCode::FORBIDDEN
                    | reqwest::StatusCode::UNPROCESSABLE_ENTITY
            )
        {
            return Ok(PlatformHealthResponse {
                reachable: true,
                endpoints,
                message: "ok".to_string(),
            });
        }
    }

    let response = client
        .get(&endpoints.platform_web_base_url)
        .send()
        .await
        .map_err(error_to_string)?;
    if !response.status().is_success() {
        return Err(format!(
            "platform health check failed with status {}",
            response.status().as_u16()
        ));
    }

    Ok(PlatformHealthResponse {
        reachable: true,
        endpoints,
        message: "ok".to_string(),
    })
}

#[tauri::command]
pub(crate) async fn login_platform(
    platform_url: String,
    username: String,
    password: String,
) -> Result<PlatformLoginResponse, String> {
    let (endpoints, _token, user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    Ok(PlatformLoginResponse { endpoints, user })
}

#[tauri::command]
pub(crate) async fn get_platform_news(
    platform_url: String,
    username: String,
    password: String,
) -> Result<Vec<PlatformNews>, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let news = platform_api_get::<Vec<PlatformNews>>(
        &client,
        &token,
        format!("{}/api/news", endpoints.platform_api_base_url),
    )
    .await?;
    Ok(news)
}

#[tauri::command]
pub(crate) async fn get_dashboard_overview(
    platform_url: String,
    username: String,
    password: String,
) -> Result<DashboardOverviewResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let data = platform_api_get::<DashboardApiData>(
        &client,
        &token,
        format!(
            "{}/api/admin/dashboard",
            endpoints.platform_api_base_url
        ),
    )
    .await?;
    Ok(DashboardOverviewResponse {
        total_qas: data.metrics.total_qas,
        reviewed_qas: data.metrics.reviewed_qas,
        ongoing_tasks: data.metrics.ongoing_tasks,
        pending_qas: data.metrics.pending_qas,
        imported_batches: data.metrics.imported_batches,
    })
}

#[tauri::command]
pub(crate) async fn change_platform_password(
    platform_url: String,
    username: String,
    current_password: String,
    new_password: String,
) -> Result<ChangePasswordResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &current_password).await?;
    let client = reqwest::Client::new();
    platform_api_post::<_, serde_json::Value>(
        &client,
        &token,
        format!(
            "{}/api/me/change-password",
            endpoints.platform_api_base_url
        ),
        &serde_json::json!({
            "current_password": current_password,
            "new_password": new_password,
        }),
    )
    .await?;
    Ok(ChangePasswordResponse { success: true })
}

#[tauri::command]
pub(crate) async fn logout_platform(
    platform_url: String,
    username: String,
    password: String,
) -> Result<(), String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    platform_api_post::<_, serde_json::Value>(
        &client,
        &token,
        format!("{}/api/auth/logout", endpoints.platform_api_base_url),
        &serde_json::json!({}),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn get_platform_stats(
    platform_url: String,
    username: String,
    password: String,
) -> Result<PlatformStats, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let stats = platform_api_get::<PlatformStats>(
        &client,
        &token,
        format!("{}/api/stats", endpoints.platform_api_base_url),
    )
    .await?;
    Ok(stats)
}

#[tauri::command]
pub(crate) async fn get_exports_stats(
    platform_url: String,
    username: String,
    password: String,
) -> Result<ExportsStatsData, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let data = platform_api_get::<ExportsStatsData>(
        &client,
        &token,
        format!("{}/api/exports/stats", endpoints.platform_api_base_url),
    )
    .await?;
    Ok(data)
}

#[tauri::command]
pub(crate) async fn get_generate_models(
    platform_url: String,
    username: String,
    password: String,
) -> Result<Vec<PlatformGenerateModel>, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let models = platform_api_get::<Vec<PlatformGenerateModel>>(
        &client,
        &token,
        format!("{}/api/generate/models", endpoints.platform_api_base_url),
    )
    .await?;
    Ok(models)
}

#[tauri::command]
pub(crate) async fn load_model_trial_workspace(
    platform_url: String,
    username: String,
    password: String,
) -> Result<TrialWorkspaceResponse, String> {
    let (endpoints, token, user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();

    let configs = platform_api_get::<Vec<TrialLlmConfigOption>>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/configs",
            endpoints.platform_api_base_url
        ),
    )
    .await?;
    let sources = platform_api_get::<Vec<TrialSourceItem>>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/sources",
            endpoints.platform_api_base_url
        ),
    )
    .await?;
    let sessions = platform_api_get::<Vec<TrialSessionSummary>>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/sessions",
            endpoints.platform_api_base_url
        ),
    )
    .await?;

    Ok(TrialWorkspaceResponse {
        endpoints,
        user,
        configs,
        sources,
        sessions,
    })
}

#[tauri::command]
pub(crate) async fn get_model_trial_session_detail(
    platform_url: String,
    username: String,
    password: String,
    session_id: i64,
) -> Result<TrialSessionDetail, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    platform_api_get::<TrialSessionDetail>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/sessions/{}",
            endpoints.platform_api_base_url, session_id
        ),
    )
    .await
}

#[tauri::command]
pub(crate) async fn create_model_trial_session(
    platform_url: String,
    username: String,
    password: String,
    llm_config_id: i64,
    source_qa_item_id: Option<i64>,
    source_answer_id: Option<i64>,
    title: Option<String>,
) -> Result<TrialSessionCreateResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let data = platform_api_post::<_, TrialSessionCreateResponseData>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/sessions",
            endpoints.platform_api_base_url
        ),
        &serde_json::json!({
            "llm_config_id": llm_config_id,
            "source_qa_item_id": source_qa_item_id,
            "source_answer_id": source_answer_id,
            "title": title,
        }),
    )
    .await?;
    Ok(TrialSessionCreateResponse {
        session_id: data.session_id,
    })
}

#[tauri::command]
pub(crate) async fn send_model_trial_message(
    platform_url: String,
    username: String,
    password: String,
    session_id: i64,
    content: String,
) -> Result<TrialSendMessageResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let data = platform_api_post::<_, TrialSendMessageResponseData>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/sessions/{}/messages",
            endpoints.platform_api_base_url, session_id
        ),
        &serde_json::json!({ "content": content }),
    )
    .await?;
    Ok(TrialSendMessageResponse {
        reply: data.reply,
        status: data.status,
        session_id: data.session_id,
    })
}

#[tauri::command]
pub(crate) async fn delete_model_trial_session(
    platform_url: String,
    username: String,
    password: String,
    session_id: i64,
) -> Result<TrialDeleteSessionResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let data = platform_api_delete::<TrialDeleteSessionResponseData>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/sessions/{}",
            endpoints.platform_api_base_url, session_id
        ),
    )
    .await?;
    Ok(TrialDeleteSessionResponse {
        session_id: data.session_id,
        status: data.status,
    })
}

#[tauri::command]
pub(crate) async fn list_platform_import_batches(
    platform_url: String,
    username: String,
    password: String,
) -> Result<Vec<PlatformImportBatchSummary>, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    platform_api_get::<Vec<PlatformImportBatchSummary>>(
        &client,
        &token,
        format!("{}/api/expert/imports", endpoints.platform_api_base_url),
    )
    .await
}

#[tauri::command]
pub(crate) async fn get_platform_import_batch_detail(
    platform_url: String,
    username: String,
    password: String,
    batch_id: i64,
) -> Result<PlatformImportBatchDetail, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    platform_api_get::<PlatformImportBatchDetail>(
        &client,
        &token,
        format!(
            "{}/api/expert/imports/{}",
            endpoints.platform_api_base_url, batch_id
        ),
    )
    .await
}

#[tauri::command]
pub(crate) fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("url is empty".to_string());
    }
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let parsed = Url::parse(&candidate).map_err(error_to_string)?;
    let target = parsed.as_str().to_string();

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
pub(crate) async fn upload_qa_batch(
    app: AppHandle,
    batch_id: String,
    platform_url: String,
    username: String,
    password: String,
) -> Result<QaBatchUploadResponse, String> {
    let (endpoints, token, user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let application = user
        .applications
        .first()
        .ok_or_else(|| "current platform account has no assigned application".to_string())?;
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let batch = build_qa_batch_summary(&app, &batch_dir).map_err(error_to_string)?;
    let items = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let review_state = load_batch_review_state(&batch_dir).map_err(error_to_string)?;
    let items = upload_ready_records(items, &review_state);
    if items.is_empty() {
        return Err(if !review_state.items.is_empty() {
            "batch has no kept QA items to upload".to_string()
        } else {
            "batch has no QA items to upload".to_string()
        });
    }

    let technical_type_code = if matches!(batch.qa_mode.as_deref(), Some("cot")) {
        "cot_qa".to_string()
    } else {
        "direct_qa".to_string()
    };
    let rows = items
        .iter()
        .map(|item| PlatformImportRowPayload {
            id: item.id.clone(),
            question: item.question.clone(),
            answer: item.answer.clone(),
            context: format!(
                "Topic: {}\nSubtopic: {}\nAxis: {}\nQuestion Type: {}\nAudience: {}\nQA Mode: {}",
                item.topic_name,
                item.subtopic,
                item.axis,
                item.question_type,
                item.audience,
                item.qa_mode
            ),
            difficulty: item.difficulty.clone(),
            source: QA_PLATFORM_BATCH_SOURCE.to_string(),
            model: item.model.clone(),
            metadata: serde_json::json!({
                "topic_name": item.topic_name,
                "subtopic": item.subtopic,
                "axis": item.axis,
                "question_type": item.question_type,
                "audience": item.audience,
                "qa_mode": item.qa_mode,
                "provider": item.provider,
                "provider_model": item.model,
                "source_type": item.source_type,
                "grounding": item.grounding,
                "source_batch_name": batch.name,
                "source_batch_id": batch.id,
            }),
            candidate_answers: Vec::new(),
        })
        .collect::<Vec<_>>();
    let payload = PlatformImportPushPayload {
        name: if batch.topic_name.trim().is_empty() {
            batch.name.clone()
        } else {
            batch.topic_name.clone()
        },
        source: QA_PLATFORM_BATCH_SOURCE.to_string(),
        external_batch_id: batch.id.clone(),
        application_id: application.id,
        technical_type_code: technical_type_code.clone(),
        business_tag_codes: Vec::new(),
        rows,
        auto_parse: true,
        create_self_review: true,
    };

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "{}/api/expert/imports/push",
            endpoints.platform_api_base_url
        ))
        .bearer_auth(token)
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
    let response_payload = response
        .json::<ApiEnvelope<PlatformImportPushResponseData>>()
        .await
        .map_err(error_to_string)?;

    Ok(QaBatchUploadResponse {
        uploaded_count: items.len(),
        platform_web_base_url: endpoints.platform_web_base_url,
        platform_api_base_url: endpoints.platform_api_base_url,
        batch_id: response_payload.data.batch_id,
        existing_batch: response_payload.data.existing_batch,
        self_review_status: response_payload.data.self_review_status,
        technical_type_code,
        application_id: application.id,
    })
}

#[tauri::command]
pub(crate) async fn get_qa_batch_platform_statuses(
    platform_url: String,
    username: String,
    password: String,
    batch_ids: Vec<String>,
) -> Result<QaBatchPlatformStatusResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let normalized_batch_ids = batch_ids
        .into_iter()
        .map(|batch_id| batch_id.trim().to_string())
        .filter(|batch_id| !batch_id.is_empty())
        .collect::<Vec<_>>();

    if normalized_batch_ids.is_empty() {
        return Ok(QaBatchPlatformStatusResponse {
            endpoints,
            items: Vec::new(),
        });
    }

    let mut lookup_items = Vec::new();
    for batch_id in &normalized_batch_ids {
        for external_batch_id in platform_status_lookup_candidates(batch_id) {
            lookup_items.push(PlatformImportBatchStatusLookupItem {
                source: QA_PLATFORM_BATCH_SOURCE.to_string(),
                external_batch_id,
            });
        }
    }

    let client = reqwest::Client::new();
    let response = platform_api_post::<
        PlatformImportBatchStatusLookupPayload,
        Vec<PlatformImportBatchStatus>,
    >(
        &client,
        &token,
        format!(
            "{}/api/expert/imports/status",
            endpoints.platform_api_base_url
        ),
        &PlatformImportBatchStatusLookupPayload {
            items: lookup_items,
        },
    )
    .await?;

    let mut status_map = std::collections::HashMap::new();
    for item in response {
        status_map.insert(item.external_batch_id.clone(), item);
    }

    let items = normalized_batch_ids
        .into_iter()
        .map(|batch_id| {
            let exact = status_map.get(&batch_id);
            let legacy = legacy_platform_external_batch_id(&batch_id)
                .and_then(|external_batch_id| status_map.get(&external_batch_id));
            match (exact, legacy) {
                (Some(status), _) if status.exists => {
                    normalize_platform_batch_status_for_batch_id(status, &batch_id)
                }
                (_, Some(status)) if status.exists => {
                    normalize_platform_batch_status_for_batch_id(status, &batch_id)
                }
                (Some(status), _) => {
                    normalize_platform_batch_status_for_batch_id(status, &batch_id)
                }
                (_, Some(status)) => {
                    normalize_platform_batch_status_for_batch_id(status, &batch_id)
                }
                _ => missing_platform_batch_status(&batch_id),
            }
        })
        .collect();

    Ok(QaBatchPlatformStatusResponse { endpoints, items })
}

#[tauri::command]
pub(crate) fn list_batch_qa_records(
    app: AppHandle,
    batch_id: String,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<QaRecordPage, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let batch = build_qa_batch_summary(&app, &batch_dir).map_err(error_to_string)?;
    let records = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let review_state = load_batch_review_state(&batch_dir).map_err(error_to_string)?;
    let page_size = page_size.unwrap_or(20).clamp(1, 200);
    let requested_page = page.unwrap_or(1).max(1);
    let total_items = records.len();
    let total_pages = if total_items == 0 {
        1
    } else {
        total_items.div_ceil(page_size)
    };
    let page = requested_page.min(total_pages);
    let start = (page - 1) * page_size;
    let end = (start + page_size).min(total_items);
    let items = if start >= total_items {
        Vec::new()
    } else {
        records[start..end]
            .iter()
            .map(|item| summarize_record(item, &review_state))
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
pub(crate) fn list_batch_qa_question_options(
    app: AppHandle,
    batch_id: String,
) -> Result<Vec<QaRecordSummary>, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let records = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let review_state = load_batch_review_state(&batch_dir).map_err(error_to_string)?;
    Ok(records
        .into_iter()
        .map(|item| summarize_record(&item, &review_state))
        .collect())
}

#[tauri::command]
pub(crate) fn get_batch_qa_record(
    app: AppHandle,
    batch_id: String,
    qa_id: String,
) -> Result<QaRecordDetail, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let batch = build_qa_batch_summary(&app, &batch_dir).map_err(error_to_string)?;
    let records = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let review_state = load_batch_review_state(&batch_dir).map_err(error_to_string)?;
    let item = records
        .into_iter()
        .find(|record| record.id == qa_id)
        .ok_or_else(|| format!("QA record not found: {qa_id}"))?;

    Ok(QaRecordDetail {
        batch,
        review: review_snapshot_for_item(&item, &review_state),
        item,
    })
}

#[tauri::command]
pub(crate) fn save_batch_review_item(
    app: AppHandle,
    batch_id: String,
    qa_id: String,
    edited_question: Option<String>,
    status: Option<String>,
) -> Result<SaveBatchReviewItemResponse, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let records = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let item = records
        .iter()
        .find(|record| record.id == qa_id)
        .ok_or_else(|| format!("QA record not found: {qa_id}"))?;
    let mut review_state = load_batch_review_state(&batch_dir).map_err(error_to_string)?;
    let entry = review_state.items.entry(qa_id.clone()).or_default();

    if let Some(status) = status {
        entry.status = parse_review_status(&status)
            .ok_or_else(|| format!("invalid review status: {status}"))?;
    }

    if let Some(question) = edited_question {
        entry.edited_question = normalize_edited_question(item, Some(question));
    }

    entry.updated_at_ms = system_time_to_ms(SystemTime::now());
    if entry.status == ReviewStatus::Unreviewed && entry.edited_question.is_none() {
        review_state.items.remove(&qa_id);
    }

    persist_batch_review_state(&batch_dir, &review_state).map_err(error_to_string)?;
    let review = review_snapshot_for_item(item, &review_state);
    Ok(SaveBatchReviewItemResponse {
        review,
        summary: summarize_review_state(&review_state),
    })
}

#[tauri::command]
pub(crate) fn open_path(app: AppHandle, path: String) -> Result<(), String> {
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
pub(crate) async fn check_for_app_update(
    app: AppHandle,
    window: Window,
) -> Result<AppUpdateCheckResponse, String> {
    let current_version = app.package_info().version.to_string();
    let manual_download_url = manual_download_url(&app);
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
                manual_download_url,
            });
        }
    };

    emit_app_update_event(&window, "check", "running", "Checking for app updates.");
    let mut update = None;
    let mut last_error = None;
    for attempt in 1..=2 {
        match timeout(Duration::from_secs(8), updater.check()).await {
            Ok(Ok(result)) => {
                update = result;
                last_error = None;
                break;
            }
            Ok(Err(error)) => {
                let message = error_to_string(error);
                last_error = Some(message.clone());
                if attempt < 2 {
                    emit_app_update_event(
                        &window,
                        "check",
                        "running",
                        &format!(
                            "Update check attempt {} failed. Retrying once: {}",
                            attempt, message
                        ),
                    );
                    sleep(Duration::from_millis(600)).await;
                    continue;
                }
            }
            Err(_) => {
                let message =
                    "Update check timed out after 8 seconds while connecting to the update service.";
                last_error = Some(message.to_string());
                if attempt < 2 {
                    emit_app_update_event(
                        &window,
                        "check",
                        "running",
                        "Update check timed out once. Retrying one more time.",
                    );
                    sleep(Duration::from_millis(600)).await;
                    continue;
                }
            }
        }
    }

    if let Some(message) = last_error {
        emit_app_update_event(&window, "check", "failed", &message);
        return Err(message);
    }

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
            manual_download_url,
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
            manual_download_url,
        })
    }
}

#[tauri::command]
pub(crate) async fn install_app_update(app: AppHandle, window: Window) -> Result<(), String> {
    let Some((updater, _)) = build_effective_updater(&app).map_err(error_to_string)? else {
        return Err(
            "Updater is not configured. Add updater.json or ship a release build updater config before trying to install updates."
                .to_string(),
        );
    };

    emit_app_update_event(
        &window,
        "install",
        "running",
        "Preparing update installation.",
    );
    let Some(update) = timeout(Duration::from_secs(8), updater.check())
        .await
        .map_err(|_| {
            let message = "Update install check timed out after 8 seconds.".to_string();
            emit_app_update_event(&window, "install", "failed", &message);
            message
        })?
        .map_err(error_to_string)?
    else {
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
        .map_err(|error| {
            let message = error_to_string(error);
            emit_app_update_event(&window, "install", "failed", &message);
            message
        })?;

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
pub(crate) async fn run_pipeline(
    app: AppHandle,
    window: Window,
    state: tauri::State<'_, ActivePipelineState>,
    request: PipelineRequest,
) -> Result<PipelineResponse, String> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut active_flag = state
            .cancel_flag
            .lock()
            .map_err(|_| "failed to lock active pipeline state".to_string())?;
        if active_flag.is_some() {
            return Err("pipeline is already running".to_string());
        }
        *active_flag = Some(cancel_flag.clone());
    }

    let result = run_pipeline_inner(app, window, request, cancel_flag).await;

    let mut active_flag = state
        .cancel_flag
        .lock()
        .map_err(|_| "failed to lock active pipeline state".to_string())?;
    *active_flag = None;

    result
}

async fn run_pipeline_inner(
    app: AppHandle,
    window: Window,
    request: PipelineRequest,
    cancel_flag: Arc<AtomicBool>,
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

    let (output_dir, reused_existing_output) =
        if request.output_dir.trim() == "__managed__" || request.output_dir.trim().is_empty() {
            let managed_output_root =
                managed_output_root_for_request(&app, &request).map_err(error_to_string)?;
            if request.managed_run_mode == "resume-batch" {
                let batch_id = request.managed_run_batch_id.as_deref().ok_or_else(|| {
                    "managed_run_batch_id is required for resume-batch".to_string()
                })?;
                (
                    resolve_batch_dir(&app, batch_id).map_err(error_to_string)?,
                    true,
                )
            } else if request.managed_run_mode == "resume-latest" {
                if let Some(existing_dir) =
                    find_latest_matching_batch_dir(&app, &request).map_err(error_to_string)?
                {
                    (existing_dir, true)
                } else {
                    (
                        next_managed_output_dir(&managed_output_root, &topic.topic_name)
                            .map_err(error_to_string)?,
                        false,
                    )
                }
            } else {
                (
                    next_managed_output_dir(&managed_output_root, &topic.topic_name)
                        .map_err(error_to_string)?,
                    false,
                )
            }
        } else {
            (
                resolve_app_relative_path(&app, &request.output_dir).map_err(error_to_string)?,
                false,
            )
        };

    let mut config = GenerateConfig {
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
        output_language: request.output_language.clone(),
        cot_section_headers: normalize_cot_section_headers_for_language(
            &request.cot_section_headers,
            &request.output_language,
        ),
        supporting_context: None,
    };

    // Auto-detect platform proxy auth: if all three platform fields are present,
    // login with token and override base_url/api_key. Matches Paper QA pattern.
    if let (Some(platform_url), Some(username), Some(password)) = (
        request.qa_platform_url.as_ref(),
        request.qa_platform_username.as_ref(),
        request.qa_platform_password.as_ref(),
    ) {
        if config
            .provider
            .base_url
            .as_ref()
            .is_none_or(|u| u.trim().is_empty())
        {
            let (_endpoints, token, _user) =
                platform_login_with_token(platform_url, username, password).await?;
            config.provider.base_url = Some(format!(
                "{}/api/generate",
                platform_url.trim_end_matches('/')
            ));
            config.provider.api_key = Some(token);
        }
    }

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
        &if reused_existing_output {
            format!(
                "Continuing existing task. Wrote topic, plans, and config into {}.",
                output_dir.display()
            )
        } else {
            format!(
                "Wrote topic, plans, and config into {}.",
                output_dir.display()
            )
        },
        3,
        total_steps,
    );

    emit_pipeline_event(
        &window,
        "generate",
        "running",
        &format!(
            "Generating {} {} items with {} / {}.",
            config.runtime.target_count,
            config.qa_mode,
            config.provider.provider,
            config.provider.model
        ),
        3,
        total_steps,
    );
    let progress_window = window.clone();
    let progress_callback = move |event: RuntimeProgress| {
        emit_runtime_progress_event(&progress_window, &event, total_steps);
    };
    let generated_summary = generate_to_directory_with_progress(
        &topic,
        &plans,
        &config,
        &generated_dir,
        Some(&progress_callback),
        Some(cancel_flag.as_ref()),
    )
    .await
    .map_err(|error| {
        if is_pipeline_cancelled_error(&error) {
            emit_pipeline_event(
                &window,
                "generate",
                "cancelled",
                "Pipeline stop requested. Generation was cancelled before packing.",
                3,
                total_steps,
            );
        }
        error_to_string(error)
    })?;
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
    let packed = pack_generated_batch(&topic, &generated_dir, &dataset_path, &pack_summary_path)
        .map_err(error_to_string)?;
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
        &format!(
            "Pipeline finished. Dataset written to {}.",
            response.dataset_path
        ),
        total_steps,
        total_steps,
    );

    Ok(response)
}
