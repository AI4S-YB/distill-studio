use serde::{Deserialize, Serialize};

use crate::platform_commands::{
    platform_api_get, platform_api_post, platform_login_with_token,
};

// ---- Types ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelChangelogEntry {
    pub(crate) id: i64,
    #[serde(alias = "model_name")]
    pub(crate) model_name: String,
    #[serde(alias = "change_type")]
    pub(crate) change_type: String,
    pub(crate) description: String,
    #[serde(alias = "created_at")]
    pub(crate) created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FeedbackResponse {
    pub(crate) id: i64,
    #[serde(alias = "created_at")]
    pub(crate) created_at: String,
}

// ---- Commands ----

#[tauri::command]
pub(crate) async fn get_model_changelog(
    platform_url: String,
    username: String,
    password: String,
    days: Option<u32>,
) -> Result<Vec<ModelChangelogEntry>, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let query = days.map(|d| format!("?days={}", d)).unwrap_or_default();
    let entries = platform_api_get::<Vec<ModelChangelogEntry>>(
        &client,
        &token,
        format!(
            "{}/api/models/changelog{}",
            endpoints.platform_api_base_url, query
        ),
    )
    .await?;
    Ok(entries)
}

#[tauri::command]
pub(crate) async fn submit_feedback(
    platform_url: String,
    username: String,
    password: String,
    title: String,
    content: String,
    category: String,
) -> Result<FeedbackResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let response = platform_api_post::<_, FeedbackResponse>(
        &client,
        &token,
        format!("{}/api/feedback", endpoints.platform_api_base_url),
        &serde_json::json!({
            "title": title,
            "content": content,
            "category": category,
        }),
    )
    .await?;
    Ok(response)
}
