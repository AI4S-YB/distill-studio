use serde::{Deserialize, Serialize};
use tauri::{Emitter, Window};

use crate::config::*;
use crate::platform_commands::platform_login_with_token;
use crate::types::*;

// ---- Types ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatMessage {
    pub(crate) role: String,
    pub(crate) content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatSendRequest {
    #[serde(default)]
    pub(crate) platform_url: Option<String>,
    #[serde(default)]
    pub(crate) username: Option<String>,
    #[serde(default)]
    pub(crate) password: Option<String>,
    pub(crate) provider: String,
    pub(crate) base_url: String,
    pub(crate) api_key: String,
    pub(crate) model: String,
    pub(crate) messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatSendResponse {
    pub(crate) message: ChatMessage,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenAiChatChoice {
    pub(crate) message: ChatMessage,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenAiChatCompletion {
    pub(crate) choices: Vec<OpenAiChatChoice>,
}

// ---- Commands ----

#[tauri::command]
pub(crate) async fn send_chat_message(request: ChatSendRequest) -> Result<ChatSendResponse, String> {
    // Auto-detect: platform proxy (token) or direct API key (match Paper QA pattern)
    if let (Some(platform_url), Some(username), Some(password)) = (
        request.platform_url.as_ref(),
        request.username.as_ref(),
        request.password.as_ref(),
    ) {
        let (_endpoints, token, _user) =
            platform_login_with_token(platform_url, username, password).await?;
        let client = reqwest::Client::new();
        let resp = client
            .post(format!(
                "{}/api/generate/chat/completions",
                platform_url
            ))
            .bearer_auth(&token)
            .json(&serde_json::json!({
                "model": request.model,
                "messages": request.messages.iter().map(|m| {
                    serde_json::json!({ "role": m.role, "content": m.content })
                }).collect::<Vec<_>>()
            }))
            .timeout(std::time::Duration::from_secs(120))
            .send()
            .await
            .map_err(error_to_string)?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("platform chat API error {}: {}", status, body));
        }

        // Platform generate endpoints return OpenAI-compatible format,
        // not the standard { code, data } envelope used by other platform APIs.
        let completion: OpenAiChatCompletion = resp
            .json()
            .await
            .map_err(|e| format!("failed to parse platform chat response: {}", e))?;

        let choice = completion
            .choices
            .into_iter()
            .next()
            .ok_or("no response from platform model")?;

        Ok(ChatSendResponse {
            message: choice.message,
        })
    } else {
        // OpenAI-compatible chat completions
        let client = reqwest::Client::new();
        let url = format!(
            "{}/chat/completions",
            request.base_url.trim_end_matches('/')
        );
        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", request.api_key))
            .json(&serde_json::json!({
                "model": request.model,
                "messages": request.messages.iter().map(|m| {
                    serde_json::json!({ "role": m.role, "content": m.content })
                }).collect::<Vec<_>>()
            }))
            .timeout(tokio::time::Duration::from_secs(60))
            .send()
            .await
            .map_err(|e| format!("chat request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("chat API error {}: {}", status, body));
        }

        let completion: OpenAiChatCompletion = resp
            .json()
            .await
            .map_err(|e| format!("failed to parse chat response: {}", e))?;

        let choice = completion
            .choices
            .into_iter()
            .next()
            .ok_or("no response from model")?;

        Ok(ChatSendResponse {
            message: choice.message,
        })
    }
}

#[tauri::command]
pub(crate) async fn send_chat_message_stream(
    window: Window,
    request: ChatSendRequest,
) -> Result<ChatSendResponse, String> {
    // Resolve auth (match send_chat_message pattern)
    let (url, auth_header_value): (String, String) = if let (
        Some(platform_url),
        Some(username),
        Some(password),
    ) = (
        request.platform_url.as_ref(),
        request.username.as_ref(),
        request.password.as_ref(),
    ) {
        let (_endpoints, token, _user) =
            platform_login_with_token(platform_url, username, password).await?;
        (
            format!(
                "{}/api/generate/chat/completions",
                platform_url.trim_end_matches('/')
            ),
            format!("Bearer {}", token),
        )
    } else {
        (
            format!(
                "{}/chat/completions",
                request.base_url.trim_end_matches('/')
            ),
            format!("Bearer {}", request.api_key),
        )
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", &auth_header_value)
        .json(&serde_json::json!({
            "model": request.model,
            "messages": request.messages.iter().map(|m| {
                serde_json::json!({ "role": m.role, "content": m.content })
            }).collect::<Vec<_>>(),
            "stream": true
        }))
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("stream request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("stream API error {}: {}", status, body));
    }

    let mut stream = resp.bytes_stream();
    let mut full_content = String::new();

    use futures::StreamExt;
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("stream read error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }
            let data = &line["data: ".len()..];
            if data == "[DONE]" {
                break;
            }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                    full_content.push_str(delta);
                    let _ = window.emit(
                        "chat-qa-token",
                        serde_json::json!({
                            "token": delta,
                            "fullContent": full_content
                        }),
                    );
                }
            }
        }
    }

    Ok(ChatSendResponse {
        message: ChatMessage {
            role: "assistant".to_string(),
            content: full_content,
        },
    })
}

#[tauri::command]
pub(crate) async fn push_chat_conversations(
    platform_url: String,
    username: String,
    password: String,
    session_name: String,
    external_batch_id: String,
    messages: Vec<PlatformChatMessagePayload>,
) -> Result<ChatUploadResponse, String> {
    let (endpoints, token, user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let application = user
        .applications
        .first()
        .ok_or_else(|| "current platform account has no assigned application".to_string())?;

    let rows = vec![PlatformChatRowPayload {
        id: external_batch_id.clone(),
        messages,
        metadata: serde_json::json!({ "session_name": &session_name }),
    }];

    let payload = serde_json::json!({
        "name": session_name,
        "source": QA_PLATFORM_BATCH_SOURCE,
        "external_batch_id": external_batch_id,
        "application_id": application.id,
        "technical_type_code": "multi_turn_conversation",
        "business_tag_codes": [],
        "rows": rows,
        "auto_parse": true,
        "create_self_review": false,
    });

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "{}/api/expert/imports/push",
            endpoints.platform_api_base_url
        ))
        .bearer_auth(&token)
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

    Ok(ChatUploadResponse {
        batch_id: response_payload.data.batch_id,
        external_batch_id,
        existing_batch: response_payload.data.existing_batch,
        import_status: None,
        parse_queued: None,
    })
}
