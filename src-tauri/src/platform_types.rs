use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::AtomicBool,
    Arc, Mutex,
};

// ---- Platform API response structs (from lib.rs) ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformNews {
    pub(crate) id: i64,
    pub(crate) title: String,
    pub(crate) content: String,
    #[serde(alias = "is_published")]
    pub(crate) is_published: bool,
    #[serde(default, alias = "created_by_name")]
    pub(crate) created_by_name: Option<String>,
    #[serde(alias = "created_at")]
    pub(crate) created_at: String,
    #[serde(default, alias = "updated_at")]
    pub(crate) updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DashboardOverviewResponse {
    pub(crate) total_qas: u32,
    pub(crate) reviewed_qas: u32,
    pub(crate) ongoing_tasks: u32,
    pub(crate) pending_qas: u32,
    pub(crate) imported_batches: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChangePasswordResponse {
    pub(crate) success: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct DashboardApiData {
    pub(crate) metrics: DashboardApiMetrics,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DashboardApiMetrics {
    pub(crate) total_qas: u32,
    pub(crate) reviewed_qas: u32,
    pub(crate) ongoing_tasks: u32,
    pub(crate) pending_qas: u32,
    pub(crate) imported_batches: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformStats {
    #[serde(alias = "today_qa_count")]
    pub(crate) today_qas: u32,
    #[serde(alias = "week_qa_count")]
    pub(crate) week_qas: u32,
    #[serde(default, alias = "today_review_count")]
    pub(crate) today_reviews: Option<u32>,
    #[serde(default, alias = "week_review_count")]
    pub(crate) week_reviews: Option<u32>,
    #[serde(default, alias = "available_model_count")]
    pub(crate) available_models: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExportsStatsDaily {
    pub(crate) period: String,
    #[serde(alias = "import_count")]
    pub(crate) import_count: u32,
    #[serde(default, alias = "review_count")]
    pub(crate) review_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExportsStatsWeekly {
    pub(crate) period: String,
    #[serde(alias = "period_start")]
    pub(crate) period_start: String,
    #[serde(alias = "period_end")]
    pub(crate) period_end: String,
    #[serde(alias = "import_count")]
    pub(crate) import_count: u32,
    #[serde(default, alias = "review_count")]
    pub(crate) review_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExportsStatsData {
    pub(crate) daily: Vec<ExportsStatsDaily>,
    pub(crate) weekly: Vec<ExportsStatsWeekly>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformGenerateModel {
    pub(crate) id: i64,
    pub(crate) name: String,
    pub(crate) provider: String,
    pub(crate) base_url: String,
    pub(crate) model: String,
    pub(crate) temperature: f32,
    pub(crate) max_tokens: u32,
    pub(crate) batch_size: usize,
    pub(crate) max_in_flight: usize,
}

#[derive(Default)]
pub(crate) struct ActivePipelineState {
    pub(crate) cancel_flag: Mutex<Option<Arc<AtomicBool>>>,
}
