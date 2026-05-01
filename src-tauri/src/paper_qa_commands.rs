use distill_core::{GenerateConfig, GeneratedQa, ProviderConfig, RuntimeConfig, TopicSpec};
use tauri::{AppHandle, Emitter, Window};

use crate::config::*;
use crate::paper_qa_types::*;
use crate::types::*;
use crate::platform_login_with_token;

// ---- Paper QA commands ----

pub(crate) fn paper_qa_mineru_base_url() -> Result<String, String> {
    std::env::var("MINERU_BASE_URL").map_err(|_| "MINERU_BASE_URL env var not set".to_string())
}

pub(crate) fn paper_qa_mineru_token() -> Result<String, String> {
    std::env::var("MINERU_API_TOKEN").map_err(|_| "MINERU_API_TOKEN env var not set".to_string())
}

pub(crate) async fn do_convert_pdf_via_mineru(pdf_path: String) -> Result<String, String> {
    let pdf_path = std::path::Path::new(&pdf_path);
    let pdf_name = pdf_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("paper.pdf")
        .to_string();
    let pdf_data = tokio::fs::read(&pdf_path)
        .await
        .map_err(|e| format!("failed to read PDF: {}", e))?;

    let mineru_base = paper_qa_mineru_base_url()?;
    let mineru_token = paper_qa_mineru_token()?;
    let client = reqwest::Client::new();

    // Step 1: get signed upload URL
    let file_url_resp = client
        .post(format!("{}/file-urls/batch", mineru_base))
        .bearer_auth(&mineru_token)
        .json(&MinerUFileUrlRequest {
            files: vec![MinerUFileUrlItem {
                name: pdf_name.clone(),
            }],
            model_version: Some("vlm".to_string()),
        })
        .send()
        .await
        .map_err(|e| format!("MinerU file-urls request failed: {}", e))?;
    let file_url_status = file_url_resp.status();
    if !file_url_status.is_success() {
        let body = file_url_resp.text().await.unwrap_or_default();
        return Err(format!("MinerU file-urls failed with {}: {}", file_url_status.as_u16(), body));
    }
    let file_url_data = file_url_resp
        .json::<MinerUFileUrlResponse>()
        .await
        .map_err(|e| format!("failed to parse MinerU file-urls response: {}", e))?;
    let batch_id = file_url_data.data.batch_id.clone();
    let signed_url = file_url_data
        .data
        .file_urls
        .first()
        .ok_or("MinerU returned no file-url data")?
        .clone();

    // Step 2: upload PDF
    let put_resp = client
        .put(&signed_url)
        .body(pdf_data)
        .send()
        .await
        .map_err(|e| format!("MinerU PDF upload failed: {}", e))?;
    let put_status = put_resp.status();
    if !put_status.is_success() {
        let body = put_resp.text().await.unwrap_or_default();
        return Err(format!("MinerU PDF upload failed with {}: {}", put_status.as_u16(), body));
    }

    // Step 3: poll for result
    let extract_url = format!("{}/extract-results/batch/{}", mineru_base, batch_id);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(600);
    let poll_interval = std::time::Duration::from_secs(3);
    let mut zip_url: Option<String> = None;

    while std::time::Instant::now() < deadline {
        let poll_resp = client
            .get(&extract_url)
            .bearer_auth(&mineru_token)
            .send()
            .await
            .map_err(|e| format!("MinerU poll failed: {}", e))?;
        let poll_status = poll_resp.status();
        if !poll_status.is_success() {
            let body = poll_resp.text().await.unwrap_or_default();
            return Err(format!("MinerU poll failed with {}: {}", poll_status.as_u16(), body));
        }
        let extract_data = poll_resp
            .json::<MinerUExtractResponse>()
            .await
            .map_err(|e| format!("failed to parse MinerU poll response: {}", e))?;
        let result = extract_data
            .data
            .extract_result
            .first()
            .ok_or("MinerU returned no extract_result")?;
        match result.state.as_str() {
            "done" => {
                zip_url = result.full_zip_url.clone();
                break;
            }
            "failed" => {
                return Err(format!(
                    "MinerU extraction failed: {}",
                    result.err_msg.as_deref().unwrap_or("unknown error")
                ));
            }
            _ => {
                tokio::time::sleep(poll_interval).await;
            }
        }
    }

    let zip_url = zip_url.ok_or("MinerU extraction timed out")?;

    // Step 4: download ZIP and extract MD
    let zip_bytes = client
        .get(&zip_url)
        .bearer_auth(&mineru_token)
        .send()
        .await
        .map_err(|e| format!("failed to download MinerU ZIP: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("failed to read MinerU ZIP: {}", e))?;

    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("failed to open ZIP: {}", e))?;

    let pdf_stem = pdf_path
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("paper");

    let mut md_content = String::new();
    // Priority: filename matching pdf_stem, then full.md, then first .md
    let mut fallback_md: Option<String> = None;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("ZIP entry error: {}", e))?;
        let name = file.name().to_string();
        if name.ends_with(".md") || name.ends_with(".MD") {
            use std::io::Read;
            let mut s = String::new();
            file.read_to_string(&mut s).map_err(|e| format!("ZIP read error: {}", e))?;
            if name.to_lowercase().contains(pdf_stem.to_lowercase().as_str()) {
                md_content = s;
                break;
            }
            if name.eq_ignore_ascii_case("full.md") {
                if md_content.is_empty() {
                    md_content = s;
                }
            } else if fallback_md.is_none() {
                fallback_md = Some(s);
            }
        }
    }
    if md_content.is_empty() {
        md_content = fallback_md.unwrap_or_default();
    }
    if md_content.is_empty() {
        return Err("no .md file found in MinerU ZIP".to_string());
    }

    Ok(md_content)
}

pub(crate) async fn do_chunk_paper_md(md_text: String, paper_title: String) -> Result<Vec<PaperChunk>, String> {
    let re = regex::Regex::new(r"(?m)^\s*#{1,6}\s+.+").map_err(|e| format!("regex error: {}", e))?;
    let titles: Vec<usize> = re.find_iter(&md_text).map(|m| m.start()).collect();

    let mut chunks: Vec<PaperChunk> = Vec::new();
    let excluded_sections = [
        "references", "reference", "acknowledgements", "acknowledgment",
        "supplementary", "appendix", "author_contributions", "conflict_of_interest",
        "参考文献", "致谢", "附录", "补充材料",
    ];

    for i in 0..titles.len() {
        let start = titles[i];
        let end = if i + 1 < titles.len() { titles[i + 1] } else { md_text.len() };
        let text = md_text[start..end].trim().to_string();
        if text.len() < 200 {
            continue;
        }

        // Detect section type
        let lower = text.to_lowercase();
        let section_type = if lower.contains("method") || lower.contains("方法") || lower.contains("实验") || lower.contains("材料") {
            "methods"
        } else if lower.contains("result") || lower.contains("结果") {
            "results"
        } else if lower.contains("discuss") || lower.contains("讨论") {
            "discussion"
        } else if lower.contains("intro") || lower.contains("引言") || lower.contains("背景") || lower.contains("abstract") || lower.contains("摘要") {
            "introduction"
        } else {
            "other"
        };

        // Exclude certain sections
        let should_exclude = excluded_sections.iter().any(|s| lower.contains(s));
        if should_exclude {
            continue;
        }

        // Reference density check
        let ref_pattern = regex::Regex::new(r"\[\d+\]|\(\w+,\s*\d{4}\)").unwrap();
        let token_count = text.split_whitespace().count().max(1);
        let ref_count = ref_pattern.find_iter(&text).count();
        if (ref_count as f64 / token_count as f64) > 0.3 {
            continue;
        }

        let id = format!("chunk_{}_{}", paper_title.replace(' ', "_"), chunks.len());
        chunks.push(PaperChunk {
            id: id.chars().take(80).collect(),
            char_count: text.len(),
            section_type: section_type.to_string(),
            text,
        });
    }

    Ok(chunks)
}

pub(crate) fn extract_paper_qa_json(content: &str) -> Result<serde_json::Value, String> {
    let trimmed = content.trim();
    // Try direct parse first
    if let Ok(value) = serde_json::from_str(trimmed) {
        return Ok(value);
    }
    // Try extracting from markdown fences
    for segment in trimmed.split("```") {
        let s = segment.trim();
        let json_str = if s.starts_with('{') && s.ends_with('}') {
            s
        } else if let Some(rest) = s.strip_prefix("json") {
            rest.trim()
        } else {
            continue;
        };
        if json_str.starts_with('{') && json_str.ends_with('}') {
            if let Ok(value) = serde_json::from_str(json_str) {
                return Ok(value);
            }
        }
    }
    // Last resort: balanced brace extraction
    let bytes = trimmed.as_bytes();
    let mut start = None;
    let mut depth = 0u32;
    let mut in_string = false;
    let mut escaped = false;
    for (i, &b) in bytes.iter().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }
            match b {
                b'\\' => { escaped = true; continue; }
                b'"' => { in_string = false; continue; }
                _ => continue,
            }
        }
        match b {
            b'"' => { in_string = true; }
            b'{' => {
                if start.is_none() { start = Some(i); }
                depth += 1;
            }
            b'}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    if let Some(start_idx) = start {
                        let json_slice = &trimmed[start_idx..=i];
                        if let Ok(value) = serde_json::from_str(json_slice) {
                            return Ok(value);
                        }
                        start = None;
                    }
                }
            }
            _ => {}
        }
    }
    Err(format!("Failed to extract JSON from: {}", &trimmed[..trimmed.len().min(500)]))
}

pub(crate) async fn do_save_paper_qa_batch(
    app: AppHandle,
    items: Vec<PaperQaItem>,
    paper_title: String,
    provider: String,
    model: String,
) -> Result<QaBatchSummary, String> {
    let output_root = configured_managed_output_root(&app).map_err(error_to_string)?;
    let batch_dir = next_managed_output_dir(&output_root, &paper_title).map_err(error_to_string)?;

    let records: Vec<GeneratedQa> = items
        .iter()
        .map(|item| GeneratedQa {
            id: item.id.clone(),
            shard_id: 0,
            topic_name: item.paper_title.clone(),
            subtopic: item.section_type.clone(),
            axis: item.qa_type.clone(),
            question_type: "paper_qa".to_string(),
            difficulty: "medium".to_string(),
            audience: "researcher".to_string(),
            question: item.instruction.clone(),
            answer: item.output.clone(),
            source_type: "paper_qa".to_string(),
            grounding: item.reasoning.clone().unwrap_or_default(),
            provider: provider.clone(),
            model: model.clone(),
            qa_mode: item.qa_type.clone(),
        })
        .collect();

    let dataset_path = batch_dir.join("dataset.jsonl");
    write_jsonl(&dataset_path, &records).map_err(error_to_string)?;

    let topic = TopicSpec {
        user_intent: format!("Paper QA: {}", paper_title),
        topic_name: paper_title.clone(),
        goal: "Generated from PDF paper".to_string(),
        keywords: vec![],
        subtopics: vec![],
        question_axes: vec!["cot".to_string(), "qa".to_string()],
        target_count: items.len() as u32,
    };
    write_json(&batch_dir.join("topic.json"), &topic).map_err(error_to_string)?;

    let config = GenerateConfig {
        provider: ProviderConfig {
            provider,
            model,
            base_url: None,
            api_key: None,
            api_key_env: None,
            temperature: 0.1,
            max_tokens: 4096,
        },
        runtime: RuntimeConfig {
            target_count: items.len(),
            shard_size: PAPER_QA_SAVE_SHARD_SIZE,
            batch_size: 1,
            max_in_flight: 1,
            max_retries: 0,
            request_timeout_secs: 120,
            resume: false,
        },
        qa_mode: "mixed".to_string(),
        output_language: "zh".to_string(),
        cot_section_headers: vec![],
        supporting_context: None,
    };
    write_json(&batch_dir.join("generate_config.json"), &config).map_err(error_to_string)?;

    build_qa_batch_summary(&app, &batch_dir).map_err(error_to_string)
}

pub(crate) async fn do_generate_paper_qa(
    _app: AppHandle,
    window: Window,
    request: PaperQaGenerateRequest,
) -> Result<PaperQaGenerateResponse, String> {
    let client = reqwest::Client::new();
    let cot_ratio = request.cot_ratio.clamp(0.0, 1.0);

    // Resolve auth: platform proxy (token) or direct API key
    let (url, auth_header_value): (String, String) =
        if let (Some(platform_url), Some(username), Some(password)) =
            (request.platform_url.as_ref(), request.username.as_ref(), request.password.as_ref())
        {
            let (_endpoints, token, _user) =
                platform_login_with_token(platform_url, username, password).await?;
            (
                format!("{}/api/generate/chat/completions", platform_url.trim_end_matches('/')),
                format!("Bearer {}", token),
            )
        } else {
            (
                format!("{}/chat/completions", request.base_url.trim_end_matches('/')),
                format!("Bearer {}", request.api_key),
            )
        };

    let cot_system = "你是农业科研助手。基于以下论文片段，生成3-5个思维链问答对。覆盖：研究动机与背景、方法原理与设计思路、参数选择依据、结果之间的逻辑关系、应用意义与展望。输出JSON格式。";

    let qa_system = "你是农业科普助手。基于以下论文片段，生成3-5个直接问答对。问题清晰具体，答案直接简洁，不做长篇推理分析。输出JSON格式。";

    let mut all_items: Vec<PaperQaItem> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let total = request.chunks.len();

    for (idx, chunk) in request.chunks.iter().enumerate() {
        let chunk_text: String = chunk.text.chars().take(8000).collect();

        // Emit progress: CoT started
        let _ = window.emit("paper-qa-progress", serde_json::json!({
            "step": "cot",
            "chunkIndex": idx,
            "totalChunks": total,
            "chunkId": chunk.id,
            "sectionType": chunk.section_type,
            "status": "started",
            "itemCount": all_items.len(),
            "message": format!("CoT: chunk {}/{} ({})", idx + 1, total, chunk.section_type)
        }));
        let _ = window.emit("paper-qa-log", serde_json::json!({
            "message": format!("CoT chunk {}/{}: section={}, {} chars", idx + 1, total, chunk.section_type, chunk.char_count)
        }));

        // Generate CoT
        let cot_human = format!(
            "论文: {}\n章节类型: {}\n内容:\n{}\n\n请生成思维链问答对。输出JSON: {{\"cot_items\": [{{\"instruction\": \"...\", \"reasoning\": \"...\", \"conclusion\": \"...\"}}]}}",
            request.paper_title, chunk.section_type, chunk_text
        );

        let cot_result: Result<Vec<PaperQaItem>, String> = async {
            let resp = client
                .post(&url)
                .header("Authorization", &auth_header_value)
                .json(&serde_json::json!({
                    "model": &request.model,
                    "messages": [
                        {"role": "system", "content": cot_system},
                        {"role": "user", "content": &cot_human}
                    ],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"}
                }))
                .timeout(std::time::Duration::from_secs(120))
                .send()
                .await
                .map_err(|e| format!("CoT request failed: {}", e))?;
            let status = resp.status();
            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("CoT API error {}: {}", status.as_u16(), body));
            }
            let completion: LlmChatCompletionResponse = resp
                .json()
                .await
                .map_err(|e| format!("CoT parse error: {}", e))?;
            let content = completion
                .choices
                .first()
                .map(|c| c.message.content.clone())
                .unwrap_or_default();
            let parsed: LlmJsonCotResponse =
                serde_json::from_value(extract_paper_qa_json(&content)?)
                    .map_err(|e| format!("CoT JSON parse: {} — preview: {}", e, &content[..content.len().min(300)]))?;

            Ok(parsed.cot_items.into_iter().map(|item| PaperQaItem {
                id: format!("cot_{}", uuid::Uuid::new_v4()),
                qa_type: "cot".to_string(),
                instruction: item.instruction,
                reasoning: Some(item.reasoning),
                output: item.conclusion,
                paper_title: request.paper_title.clone(),
                chunk_id: chunk.id.clone(),
                section_type: chunk.section_type.clone(),
            }).collect())
        }.await;

        match cot_result {
            Ok(items) => {
                let added = items.len();
                all_items.extend(items);
                let _ = window.emit("paper-qa-progress", serde_json::json!({
                    "step": "cot",
                    "chunkIndex": idx,
                    "totalChunks": total,
                    "chunkId": chunk.id,
                    "status": "completed",
                    "itemCount": all_items.len(),
                    "message": format!("CoT: chunk {}/{} done, {} items", idx + 1, total, added)
                }));
            }
            Err(e) => {
                warnings.push(format!("CoT chunk {}: {}", chunk.id, e));
                let _ = window.emit("paper-qa-progress", serde_json::json!({
                    "step": "cot",
                    "chunkIndex": idx,
                    "totalChunks": total,
                    "chunkId": chunk.id,
                    "status": "error",
                    "itemCount": all_items.len(),
                    "message": format!("CoT: chunk {}/{} failed", idx + 1, total)
                }));
            }
        }

        // Emit progress: QA started
        let _ = window.emit("paper-qa-progress", serde_json::json!({
            "step": "qa",
            "chunkIndex": idx,
            "totalChunks": total,
            "chunkId": chunk.id,
            "sectionType": chunk.section_type,
            "status": "started",
            "itemCount": all_items.len(),
            "message": format!("QA: chunk {}/{} ({})", idx + 1, total, chunk.section_type)
        }));

        // Generate QA
        let qa_human = format!(
            "论文: {}\n章节类型: {}\n内容:\n{}\n\n请生成直接问答对。输出JSON: {{\"qa_items\": [{{\"question\": \"...\", \"context\": \"...\", \"answer\": \"...\"}}]}}",
            request.paper_title, chunk.section_type, chunk_text
        );

        let qa_result: Result<Vec<PaperQaItem>, String> = async {
            let resp = client
                .post(&url)
                .header("Authorization", &auth_header_value)
                .json(&serde_json::json!({
                    "model": &request.model,
                    "messages": [
                        {"role": "system", "content": qa_system},
                        {"role": "user", "content": &qa_human}
                    ],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"}
                }))
                .timeout(std::time::Duration::from_secs(120))
                .send()
                .await
                .map_err(|e| format!("QA request failed: {}", e))?;
            let status = resp.status();
            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("QA API error {}: {}", status.as_u16(), body));
            }
            let completion: LlmChatCompletionResponse = resp
                .json()
                .await
                .map_err(|e| format!("QA parse error: {}", e))?;
            let content = completion
                .choices
                .first()
                .map(|c| c.message.content.clone())
                .unwrap_or_default();
            let parsed: LlmJsonQaResponse =
                serde_json::from_value(extract_paper_qa_json(&content)?)
                    .map_err(|e| format!("QA JSON parse: {} — preview: {}", e, &content[..content.len().min(300)]))?;

            Ok(parsed.qa_items.into_iter().map(|item| PaperQaItem {
                id: format!("qa_{}", uuid::Uuid::new_v4()),
                qa_type: "qa".to_string(),
                instruction: item.question,
                reasoning: None,
                output: item.answer,
                paper_title: request.paper_title.clone(),
                chunk_id: chunk.id.clone(),
                section_type: chunk.section_type.clone(),
            }).collect())
        }.await;

        match qa_result {
            Ok(items) => {
                let added = items.len();
                all_items.extend(items);
                let _ = window.emit("paper-qa-progress", serde_json::json!({
                    "step": "qa",
                    "chunkIndex": idx,
                    "totalChunks": total,
                    "chunkId": chunk.id,
                    "status": "completed",
                    "itemCount": all_items.len(),
                    "message": format!("QA: chunk {}/{} done, {} items", idx + 1, total, added)
                }));
            }
            Err(e) => {
                warnings.push(format!("QA chunk {}: {}", chunk.id, e));
                let _ = window.emit("paper-qa-progress", serde_json::json!({
                    "step": "qa",
                    "chunkIndex": idx,
                    "totalChunks": total,
                    "chunkId": chunk.id,
                    "status": "error",
                    "itemCount": all_items.len(),
                    "message": format!("QA: chunk {}/{} failed", idx + 1, total)
                }));
            }
        }
    }

    filter_paper_qa_inner(all_items, cot_ratio, warnings)
}

pub(crate) fn filter_paper_qa_inner(items: Vec<PaperQaItem>, cot_ratio: f64, warnings: Vec<String>) -> Result<PaperQaGenerateResponse, String> {
    // Stage 1: format + length filter
    let filtered: Vec<PaperQaItem> = items
        .into_iter()
        .filter(|item| {
            !item.instruction.is_empty()
                && !item.output.is_empty()
                && item.output.len() >= 30
                && (item.qa_type != "cot" || item.reasoning.as_ref().is_some_and(|r| !r.is_empty()))
        })
        .collect();

    // Stage 2: MD5 dedup
    use std::collections::HashSet;
    let mut seen: HashSet<String> = HashSet::new();
    let deduped: Vec<PaperQaItem> = filtered
        .into_iter()
        .filter(|item| {
            let prefix: String = item.output.chars().take(20).collect();
            let key = format!("{}|{}", item.instruction, prefix);
            seen.insert(key)
        })
        .collect();

    // Stage 3: ratio control (approximate)
    let (mut cot_items, mut qa_items): (Vec<PaperQaItem>, Vec<PaperQaItem>) =
        deduped.into_iter().partition(|i| i.qa_type == "cot");

    let total = cot_items.len() + qa_items.len();
    if total == 0 {
        return Ok(PaperQaGenerateResponse {
            items: vec![],
            stats: PaperQaStats {
                total: 0, cot_count: 0, qa_count: 0,
                cot_ratio: 0.0, qa_ratio: 0.0,
            },
            warnings,
        });
    }

    let target_cot = (total as f64 * cot_ratio) as usize;
    if cot_items.len() > target_cot {
        cot_items.truncate(target_cot);
    }
    let target_qa = total - target_cot;
    if qa_items.len() > target_qa {
        qa_items.truncate(target_qa);
    }

    let cot_count = cot_items.len();
    let qa_count = qa_items.len();
    let final_total = cot_count + qa_count;

    let mut final_items = cot_items;
    final_items.extend(qa_items);

    Ok(PaperQaGenerateResponse {
        items: final_items,
        stats: PaperQaStats {
            total: final_total,
            cot_count,
            qa_count,
            cot_ratio: if final_total > 0 { cot_count as f64 / final_total as f64 } else { 0.0 },
            qa_ratio: if final_total > 0 { qa_count as f64 / final_total as f64 } else { 0.0 },
        },
        warnings,
    })
}
