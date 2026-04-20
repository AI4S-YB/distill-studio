import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import "./styles.css";

type Lang = "zh" | "en";

type TopicPreview = {
  topic_name: string;
  goal: string;
  target_count: number;
  keywords: string[];
  subtopics: Array<{ name: string; intent: string }>;
  question_axes: string[];
};

type PipelineResponse = {
  topic: TopicPreview;
  generatedSummary: {
    generatedCount: number;
    shardCount: number;
    completedShards: number;
    skippedShards: number;
    requestCount: number;
    provider: string;
    model: string;
  };
  keptCount: number;
  outputDir: string;
  topicPath: string;
  plansPath: string;
  configPath: string;
  generatedDir: string;
  datasetPath: string;
  packSummaryPath: string;
};

type PipelineProgressEvent = {
  stage: string;
  status: string;
  message: string;
  currentStep: number;
  totalSteps: number;
};

type ConfigProfileSummary = {
  name: string;
  path: string;
};

type AppUpdateCheckResponse = {
  configured: boolean;
  updateAvailable: boolean;
  currentVersion: string;
  version: string | null;
  body: string | null;
  date: string | null;
  sourcePath: string | null;
};

type AppUpdateProgressEvent = {
  stage: string;
  status: string;
  message: string;
};

type UiTab = "topic" | "model" | "runtime";

type ProviderPresetId = "custom" | "qwen_dashscope" | "stub_local";

type ValidationIssueKey =
  | "validation_issue_prompt_required"
  | "validation_issue_output_dir_required"
  | "validation_issue_model_required"
  | "validation_issue_base_url_required"
  | "validation_issue_api_key_required";

type PipelineFormRequest = {
  prompt: string;
  topicTags: string[];
  targetCount: number;
  planLimit: number;
  outputDir: string;
  provider: string;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
  apiKeyEnv?: string | null;
  temperature: number;
  maxTokens: number;
  shardSize: number;
  batchSize: number;
  maxInFlight: number;
  maxRetries: number;
  requestTimeoutSecs: number;
  resume: boolean;
};

type OutputState =
  | { kind: "idle" }
  | { kind: "preview_loading" }
  | { kind: "run_loading" }
  | { kind: "preview_success"; preview: TopicPreview }
  | { kind: "run_success"; response: PipelineResponse }
  | { kind: "validation_error"; issues: ValidationIssueKey[] }
  | { kind: "error"; phase: "preview" | "run"; message: string };

const LANG_STORAGE_KEY = "distill-studio.lang";
const DEFAULT_PROFILE_NAME = "default";
const TOPIC_TAG_KEYS = [
  "plant_breeding",
  "crop_genomics",
  "transcriptomics",
  "bioinformatics",
  "trait_mapping",
  "stress_biology",
  "gene_regulation",
  "phenotyping",
  "literature_mining"
] as const;
const PROVIDER_PRESETS = {
  qwen_dashscope: {
    provider: "openai-compatible",
    model: "qwen-max",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 180
  },
  stub_local: {
    provider: "stub",
    model: "stub-topic-distiller",
    baseUrl: "",
    batchSize: 24,
    maxInFlight: 16,
    requestTimeoutSecs: 120
  }
} as const;

const translations: Record<Lang, Record<string, string>> = {
  zh: {
    eyebrow: "QA小灶",
    hero_title: "QA小灶",
    hero_lede: "把主题、模型和运行参数收在一个桌面工作台里。",
    lang_label: "语言",
    panel_title: "流水线输入",
    panel_copy: "左侧切换工作区，中间编辑当前设置，右侧查看结果和运行状态。",
    nav_title: "工作区",
    nav_copy: "像应用程序一样切换设置页。",
    actions_setup: "配置动作",
    actions_run: "运行动作",
    action_check_update: "检查更新",
    telemetry_title: "运行遥测",
    telemetry_copy: "实时查看 Rust 后端发出的阶段进度和日志。",
    setup_title: "当前配置",
    setup_copy: "显示当前页配置的关键摘要。",
    result_title: "当前结果",
    result_copy: "把最近一次 Topic 预览或流水线输出整理成便于查看的摘要卡片。",
    raw_json: "原始 JSON",
    result_actions: "结果操作",
    output_mode_idle: "空白",
    output_mode_preview: "Topic 预览",
    output_mode_run: "流水线结果",
    output_mode_validation: "配置检查",
    output_mode_error: "错误",
    tab_topic: "主题",
    tab_model: "模型配置",
    tab_runtime: "运行参数",
    tab_topic_copy: "研究主题与领域标签",
    tab_model_copy: "Provider 与接口配置",
    tab_runtime_copy: "输出、档案与批处理参数",
    topic_tab_title: "研究主题",
    topic_tab_copy: "先写核心研究主题，再用标签补充学科领域、研究方向或语境。",
    model_tab_title: "模型配置",
    model_tab_copy: "管理 provider 预设、模型名称、接口地址和 API 密钥。",
    runtime_tab_title: "运行参数",
    runtime_tab_copy: "管理输出目录、配置档案和生成批处理参数。",
    provider_preset: "Provider 预设",
    provider_preset_hint: "选择预设会自动填入 provider、model 和 Base URL，API 密钥可以单独保存。",
    config_profile: "配置档案",
    config_profile_hint: "保存和加载都会作用到这个本地档案名。适合保留多套运行参数。",
    topic_tags: "领域与方向",
    topic_tags_hint: "可以多选，也可以自己加。选中的标签会拼接到实际发送给模型的主题描述里。",
    selected_tags: "已选标签",
    no_tags: "还没有添加标签。",
    custom_tag: "自定义方向",
    custom_tag_placeholder: "例如 作物育种、代谢调控、病害抗性",
    add_tag: "添加标签",
    preset_custom: "自定义",
    preset_qwen_dashscope: "Qwen / DashScope",
    preset_stub_local: "Stub 本地测试",
    topic_prompt: "主题描述",
    output_directory: "输出目录",
    browse: "选择",
    provider: "Provider",
    model: "模型",
    base_url: "Base URL",
    api_key: "API 密钥",
    api_key_hint: "密钥会保存在本地配置档案中，界面默认隐藏显示。",
    show_secret: "显示",
    hide_secret: "隐藏",
    target_count: "目标数量",
    plan_limit: "规划上限",
    shard_size: "Shard 大小",
    batch_size: "Batch 大小",
    max_in_flight: "最大并发",
    max_retries: "最大重试",
    timeout_secs: "超时秒数",
    resume_existing: "续跑已有 shard",
    preview: "预览 Topic",
    load_config: "加载配置",
    save_config: "保存配置",
    run_pipeline: "运行流水线",
    no_preview: "还没有预览结果。",
    no_run: "还没有运行记录。",
    waiting_events: "等待流水线事件...",
    status_idle: "空闲",
    status_previewing: "预览中",
    status_running: "运行中",
    status_updating: "更新中",
    preview_generating: "正在生成预览...",
    running_pipeline: "正在运行流水线...",
    validation_failed: "运行前检查未通过",
    preview_failed: "预览失败",
    pipeline_failed: "流水线失败",
    log_request_submitted: "已从 GUI 提交流水线请求。",
    log_no_local_config: "还没有本地配置文件。",
    log_loaded_startup: "启动时已加载本地配置。",
    log_loaded_manual: "已加载本地配置。",
    log_load_failed: "加载本地配置失败",
    log_profile_list_failed: "读取本地配置档案列表失败",
    log_no_local_config_profile: "未找到本地配置档案",
    log_loaded_startup_profile: "启动时已加载配置档案",
    log_loaded_manual_profile: "已加载配置档案",
    log_selected_output: "已选择输出目录",
    log_browse_failed: "选择输出目录失败",
    log_saved_config: "已保存本地配置到",
    log_saved_profile: "已保存配置档案",
    log_save_failed: "保存本地配置失败",
    log_pipeline_completed: "流水线完成，数据集输出到",
    log_opened_path: "已打开路径",
    log_open_failed: "打开路径失败",
    log_copied_value: "已复制到剪贴板",
    log_copy_failed: "复制失败",
    log_applied_preset: "已应用预设",
    log_validation_failed: "运行前检查未通过",
    log_update_not_configured: "自动更新尚未配置。请先准备本地 updater.json。",
    log_update_source: "自动更新配置文件",
    log_update_available: "发现新版本",
    log_update_not_available: "当前已是最新版本",
    log_update_declined: "已取消安装更新。",
    log_update_installing: "正在安装更新",
    log_update_failed: "自动更新失败",
    summary_topic_name: "Topic 名称",
    summary_goal: "目标",
    summary_target_count: "目标数量",
    summary_keyword_count: "关键词数量",
    summary_keywords: "关键词",
    summary_subtopic_count: "子主题数量",
    summary_axis_count: "问题轴数量",
    summary_provider: "Provider",
    summary_model: "模型",
    summary_generated_count: "生成数量",
    summary_kept_count: "保留数量",
    summary_shards: "Shards",
    summary_request_count: "请求次数",
    summary_dataset_path: "数据集路径",
    summary_output_dir: "输出目录",
    summary_profile: "配置档案",
    summary_prompt: "主题摘要",
    summary_topic_tags: "标签",
    summary_preset: "预设",
    action_open_output_dir: "打开输出目录",
    action_open_dataset: "打开数据集",
    action_open_pack_summary: "打开打包摘要",
    action_copy_output_dir: "复制输出目录",
    action_copy_dataset_path: "复制数据集路径",
    skipped: "跳过",
    empty_value: "暂无",
    validation_issues: "请先修正以下问题",
    validation_issue_prompt_required: "主题描述不能为空。",
    validation_issue_output_dir_required: "输出目录不能为空。",
    validation_issue_model_required: "模型名称不能为空。",
    validation_issue_base_url_required: "使用 openai-compatible 时必须填写 Base URL。",
    validation_issue_api_key_required: "使用 openai-compatible 时必须填写 API 密钥。",
    stage_bootstrap: "初始化",
    stage_plan: "规划",
    stage_write_config: "写配置",
    stage_generate: "生成",
    stage_pack: "打包",
    stage_complete: "完成",
    event_running: "进行中",
    event_completed: "已完成",
    tag_plant_breeding: "植物育种",
    tag_crop_genomics: "作物基因组学",
    tag_transcriptomics: "转录组学",
    tag_bioinformatics: "生物信息学",
    tag_trait_mapping: "性状解析",
    tag_stress_biology: "逆境生物学",
    tag_gene_regulation: "基因调控",
    tag_phenotyping: "表型组",
    tag_literature_mining: "文献挖掘"
  },
  en: {
    eyebrow: "Distill Studio",
    hero_title: "High-throughput QA Distillation",
    hero_lede: "A desktop workspace for topic setup, model config, and runtime control.",
    lang_label: "Language",
    panel_title: "Pipeline Input",
    panel_copy: "Switch workspaces on the left, edit the current page in the center, inspect results on the right.",
    nav_title: "Workspace",
    nav_copy: "Switch settings pages like a desktop app.",
    actions_setup: "Setup Actions",
    actions_run: "Run Actions",
    action_check_update: "Check Update",
    telemetry_title: "Run Telemetry",
    telemetry_copy: "Live stage progress and backend log messages from the Rust pipeline.",
    setup_title: "Current Setup",
    setup_copy: "Key summary of the active configuration.",
    result_title: "Current Result",
    result_copy: "Structured summary cards for the latest topic preview or pipeline run.",
    raw_json: "Raw JSON",
    result_actions: "Result Actions",
    output_mode_idle: "Idle",
    output_mode_preview: "Topic Preview",
    output_mode_run: "Pipeline Result",
    output_mode_validation: "Validation",
    output_mode_error: "Error",
    tab_topic: "Topic",
    tab_model: "Model Config",
    tab_runtime: "Runtime",
    tab_topic_copy: "Research topic and domain tags",
    tab_model_copy: "Provider and endpoint settings",
    tab_runtime_copy: "Output, profiles, and batch parameters",
    topic_tab_title: "Research Topic",
    topic_tab_copy: "Write the core research theme first, then use tags to add domains, directions, or context.",
    model_tab_title: "Model Configuration",
    model_tab_copy: "Manage provider presets, model name, endpoint, and direct API key input.",
    runtime_tab_title: "Runtime Parameters",
    runtime_tab_copy: "Manage output directory, config profiles, and generation batch settings.",
    provider_preset: "Provider Preset",
    provider_preset_hint: "Selecting a preset fills provider, model, and base URL. The API key is stored separately.",
    config_profile: "Config Profile",
    config_profile_hint: "Load and save both target this local profile name. Use it to keep multiple run setups.",
    topic_tags: "Domains and Directions",
    topic_tags_hint: "Select multiple tags or add your own. Selected tags are appended to the effective prompt sent to the model.",
    selected_tags: "Selected Tags",
    no_tags: "No tags added yet.",
    custom_tag: "Custom Direction",
    custom_tag_placeholder: "For example: crop breeding, metabolic regulation, disease resistance",
    add_tag: "Add Tag",
    preset_custom: "Custom",
    preset_qwen_dashscope: "Qwen / DashScope",
    preset_stub_local: "Stub Local Test",
    topic_prompt: "Topic Prompt",
    output_directory: "Output Directory",
    browse: "Browse",
    provider: "Provider",
    model: "Model",
    base_url: "Base URL",
    api_key: "API Key",
    api_key_hint: "The key is stored in the local config profile and hidden by default in the UI.",
    show_secret: "Show",
    hide_secret: "Hide",
    target_count: "Target Count",
    plan_limit: "Plan Limit",
    shard_size: "Shard Size",
    batch_size: "Batch Size",
    max_in_flight: "Max In Flight",
    max_retries: "Max Retries",
    timeout_secs: "Timeout Secs",
    resume_existing: "Resume Existing Shards",
    preview: "Preview Topic",
    load_config: "Load Config",
    save_config: "Save Config",
    run_pipeline: "Run Pipeline",
    no_preview: "No preview yet.",
    no_run: "No run yet.",
    waiting_events: "Waiting for pipeline events...",
    status_idle: "Idle",
    status_previewing: "Previewing",
    status_running: "Running",
    status_updating: "Updating",
    preview_generating: "Generating preview...",
    running_pipeline: "Running pipeline...",
    validation_failed: "Run validation failed",
    preview_failed: "Preview failed",
    pipeline_failed: "Pipeline failed",
    log_request_submitted: "Pipeline request submitted from GUI.",
    log_no_local_config: "No local config file found yet.",
    log_loaded_startup: "Loaded local config on startup.",
    log_loaded_manual: "Loaded local config.",
    log_load_failed: "Failed to load local config",
    log_profile_list_failed: "Failed to read local config profile list",
    log_no_local_config_profile: "No local config profile found",
    log_loaded_startup_profile: "Loaded config profile on startup",
    log_loaded_manual_profile: "Loaded config profile",
    log_selected_output: "Selected output directory",
    log_browse_failed: "Failed to browse output directory",
    log_saved_config: "Saved local config to",
    log_saved_profile: "Saved config profile",
    log_save_failed: "Failed to save local config",
    log_pipeline_completed: "Pipeline completed. Dataset at",
    log_opened_path: "Opened path",
    log_open_failed: "Failed to open path",
    log_copied_value: "Copied to clipboard",
    log_copy_failed: "Failed to copy value",
    log_applied_preset: "Applied preset",
    log_validation_failed: "Run validation failed",
    log_update_not_configured: "Auto update is not configured yet. Add a local updater.json first.",
    log_update_source: "Updater config file",
    log_update_available: "Update available",
    log_update_not_available: "Already on the latest version",
    log_update_declined: "Update install was cancelled.",
    log_update_installing: "Installing update",
    log_update_failed: "Auto update failed",
    summary_topic_name: "Topic Name",
    summary_goal: "Goal",
    summary_target_count: "Target Count",
    summary_keyword_count: "Keyword Count",
    summary_keywords: "Keywords",
    summary_subtopic_count: "Subtopic Count",
    summary_axis_count: "Question Axes",
    summary_provider: "Provider",
    summary_model: "Model",
    summary_generated_count: "Generated",
    summary_kept_count: "Kept",
    summary_shards: "Shards",
    summary_request_count: "Requests",
    summary_dataset_path: "Dataset Path",
    summary_output_dir: "Output Directory",
    summary_profile: "Profile",
    summary_prompt: "Topic Summary",
    summary_topic_tags: "Tags",
    summary_preset: "Preset",
    action_open_output_dir: "Open Output Directory",
    action_open_dataset: "Open Dataset",
    action_open_pack_summary: "Open Pack Summary",
    action_copy_output_dir: "Copy Output Directory",
    action_copy_dataset_path: "Copy Dataset Path",
    skipped: "skipped",
    empty_value: "N/A",
    validation_issues: "Fix these issues before running",
    validation_issue_prompt_required: "Topic prompt is required.",
    validation_issue_output_dir_required: "Output directory is required.",
    validation_issue_model_required: "Model name is required.",
    validation_issue_base_url_required: "Base URL is required for openai-compatible provider.",
    validation_issue_api_key_required: "API key is required for openai-compatible provider.",
    stage_bootstrap: "Bootstrap",
    stage_plan: "Plan",
    stage_write_config: "Write Config",
    stage_generate: "Generate",
    stage_pack: "Pack",
    stage_complete: "Complete",
    event_running: "running",
    event_completed: "completed",
    tag_plant_breeding: "Plant Breeding",
    tag_crop_genomics: "Crop Genomics",
    tag_transcriptomics: "Transcriptomics",
    tag_bioinformatics: "Bioinformatics",
    tag_trait_mapping: "Trait Mapping",
    tag_stress_biology: "Stress Biology",
    tag_gene_regulation: "Gene Regulation",
    tag_phenotyping: "Phenotyping",
    tag_literature_mining: "Literature Mining"
  }
};

const storedLang = window.localStorage.getItem(LANG_STORAGE_KEY);
let currentLang: Lang =
  storedLang === "zh" || storedLang === "en"
    ? storedLang
    : navigator.language.toLowerCase().startsWith("zh")
      ? "zh"
      : "en";
let currentTab: UiTab = "topic";
let currentStatus: "idle" | "previewing" | "running" | "updating" = "idle";
let outputState: OutputState = { kind: "idle" };
let topicTags: string[] = [];
let apiKeyVisible = false;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="topbar-copy">
        <p class="eyebrow" id="eyebrow">Distill Studio</p>
        <h1 id="hero-title">High-throughput QA distillation</h1>
        <p class="lede" id="hero-lede">
          Input one topic statement, pick a provider, and let the Rust pipeline
          expand that into planning and QA generation tasks.
        </p>
      </div>
      <div class="topbar-meta">
        <div class="status-badge" id="status">Idle</div>
        <label class="lang-switch">
          <span id="lang-label">Language</span>
          <select id="lang-select">
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
    </header>
    <section class="workspace">
      <aside class="sidebar panel">
        <div class="sidebar-block">
          <p class="panel-title" id="panel-title">Pipeline Input</p>
          <p class="panel-copy" id="panel-copy">One screen to preview the topic spec or run an end-to-end local distillation pass.</p>
        </div>
        <div class="nav-block">
          <p class="nav-title" id="nav-title">Workspace</p>
          <p class="nav-copy" id="nav-copy">Switch settings pages like a desktop app.</p>
        </div>
        <div class="tabs" id="tabs">
          <button class="tab-button" type="button" data-tab="topic" id="tab-topic">
            <span class="tab-button-title" id="tab-topic-label">Topic</span>
            <span class="tab-button-copy" id="tab-topic-copy">Research topic and domain tags</span>
          </button>
          <button class="tab-button" type="button" data-tab="model" id="tab-model">
            <span class="tab-button-title" id="tab-model-label">Model Config</span>
            <span class="tab-button-copy" id="tab-model-copy">Provider and endpoint settings</span>
          </button>
          <button class="tab-button" type="button" data-tab="runtime" id="tab-runtime">
            <span class="tab-button-title" id="tab-runtime-label">Runtime</span>
            <span class="tab-button-copy" id="tab-runtime-copy">Output, profiles, and batch parameters</span>
          </button>
        </div>
        <div class="sidebar-actions">
          <section class="action-group">
            <p class="action-group-title" id="actions-setup-title">Setup Actions</p>
            <div class="actions">
              <button id="load-config">Load Config</button>
              <button id="save-config">Save Config</button>
              <button id="check-update">Check Update</button>
            </div>
          </section>
          <section class="action-group">
            <p class="action-group-title" id="actions-run-title">Run Actions</p>
            <div class="actions">
              <button id="preview">Preview topic spec</button>
              <button id="run" class="secondary">Run pipeline</button>
            </div>
          </section>
        </div>
      </aside>
      <section class="stage panel">
        <section class="tab-panel" data-tab-panel="topic">
        <div class="tab-copy-block">
          <p class="panel-title" id="topic-tab-title">Research Topic</p>
          <p class="panel-copy" id="topic-tab-copy">Write the core research theme first, then use tags to add domains, directions, or context.</p>
        </div>
        <label for="prompt" id="topic-prompt-label">Topic prompt</label>
        <textarea id="prompt" rows="7">Soybean seed oil and protein improvement under planting density and breeding strategy.</textarea>
        <div class="tag-panel">
          <div class="tag-panel-header">
            <div>
              <p class="tag-title" id="topic-tags-label">Domains and Directions</p>
              <p class="panel-copy" id="topic-tags-hint">Select multiple tags or add your own. Selected tags are appended to the effective prompt sent to the model.</p>
            </div>
          </div>
          <div class="selected-tags-block">
            <p class="tag-subtitle" id="selected-tags-label">Selected Tags</p>
            <div class="tag-list selected" id="selected-topic-tags"></div>
          </div>
          <div class="tag-list suggestions" id="topic-tag-suggestions"></div>
          <div class="inline-field">
            <input id="topic-tag-input" placeholder="For example: crop breeding, metabolic regulation, disease resistance" />
            <button id="add-topic-tag" type="button">Add Tag</button>
          </div>
        </div>
      </section>
      <section class="tab-panel" data-tab-panel="model" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="model-tab-title">Model Configuration</p>
          <p class="panel-copy" id="model-tab-copy">Manage provider presets, model name, endpoint, and API key environment variable.</p>
        </div>
        <div class="grid three">
          <label>
            <span id="provider-preset-label">Provider Preset</span>
            <select id="provider-preset">
              <option id="provider-preset-option-custom" value="custom">Custom</option>
              <option id="provider-preset-option-qwen" value="qwen_dashscope">Qwen / DashScope</option>
              <option id="provider-preset-option-stub" value="stub_local">Stub Local Test</option>
            </select>
            <small class="field-hint" id="provider-preset-hint">
              Selecting a preset fills provider, model, base URL, and API key env. You can still edit them after.
            </small>
          </label>
          <label>
            <span id="provider-label">Provider</span>
            <select id="provider">
              <option value="stub" selected>stub</option>
              <option value="openai-compatible">openai-compatible</option>
            </select>
          </label>
          <label>
            <span id="model-label">Model</span>
            <input id="model" value="gpt-4.1-mini" />
          </label>
        </div>
        <div class="grid two">
          <label>
            <span id="base-url-label">Base URL</span>
            <input id="base-url" placeholder="https://api.openai.com/v1" />
          </label>
          <label>
            <span id="api-key-label">API key</span>
            <div class="inline-field">
              <input id="api-key" type="password" />
              <button id="toggle-api-key-visibility" type="button">Show</button>
            </div>
            <small class="field-hint" id="api-key-hint">
              The key is stored in the local config profile and hidden by default in the UI.
            </small>
          </label>
        </div>
      </section>
      <section class="tab-panel" data-tab-panel="runtime" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="runtime-tab-title">Runtime Parameters</p>
          <p class="panel-copy" id="runtime-tab-copy">Manage output directory, config profiles, and generation batch settings.</p>
        </div>
        <div class="grid two">
          <label>
            <span id="output-directory-label">Output directory</span>
            <div class="inline-field">
              <input id="output-dir" value="./output/gui_run" />
              <button id="browse-output" type="button">Browse</button>
            </div>
          </label>
          <label>
            <span id="config-profile-label">Config Profile</span>
            <input id="config-profile" list="config-profile-options" value="default" />
            <datalist id="config-profile-options"></datalist>
            <small class="field-hint" id="config-profile-hint">
              Load and save both target this local profile name. Use it to keep multiple run setups.
            </small>
          </label>
        </div>
        <div class="grid four">
          <label>
            <span id="target-count-label">Target count</span>
            <input id="target-count" type="number" value="10000" />
          </label>
          <label>
            <span id="plan-limit-label">Plan limit</span>
            <input id="plan-limit" type="number" value="1200" />
          </label>
          <label>
            <span id="shard-size-label">Shard size</span>
            <input id="shard-size" type="number" value="1000" />
          </label>
          <label>
            <span id="batch-size-label">Batch size</span>
            <input id="batch-size" type="number" value="8" />
          </label>
        </div>
        <div class="grid four">
          <label>
            <span id="max-in-flight-label">Max in flight</span>
            <input id="max-in-flight" type="number" value="4" />
          </label>
          <label>
            <span id="max-retries-label">Max retries</span>
            <input id="max-retries" type="number" value="3" />
          </label>
          <label>
            <span id="timeout-secs-label">Timeout secs</span>
            <input id="request-timeout-secs" type="number" value="180" />
          </label>
          <label class="toggle">
            <span id="resume-existing-label">Resume existing shards</span>
            <input id="resume" type="checkbox" checked />
          </label>
        </div>
      </section>
      <aside class="inspector">
        <section class="panel setup-panel">
          <div class="panel-header">
            <div>
              <p class="panel-title" id="setup-title">Current Setup</p>
              <p class="panel-copy" id="setup-copy">Key summary of the active configuration.</p>
            </div>
          </div>
          <div class="setup-summary" id="setup-summary"></div>
        </section>
        <section class="panel result-panel">
          <div class="result-header">
            <div>
              <p class="panel-title" id="result-title">Current Result</p>
              <p class="panel-copy" id="result-copy">Structured summary cards for the latest topic preview or pipeline run.</p>
            </div>
            <div class="result-mode" id="result-mode">Idle</div>
          </div>
          <div class="result-cards" id="result-cards"></div>
          <div class="result-actions" id="result-actions"></div>
          <details class="raw-output" id="output-details">
            <summary id="raw-output-summary">Raw JSON</summary>
            <pre id="output">No preview yet.</pre>
          </details>
        </section>
        <section class="panel telemetry">
          <div class="panel-header">
            <div>
              <p class="panel-title" id="telemetry-title">Run Telemetry</p>
              <p class="panel-copy" id="telemetry-copy">Live stage progress and backend log messages from the Rust pipeline.</p>
            </div>
            <div class="progress-meta" id="progress-meta">0 / 5</div>
          </div>
          <div class="progress-track">
            <div class="progress-fill" id="progress-fill"></div>
          </div>
          <pre id="logs">No run yet.</pre>
        </section>
      </aside>
    </section>
  </main>
`;

const promptInput = document.querySelector<HTMLTextAreaElement>("#prompt");
const langSelect = document.querySelector<HTMLSelectElement>("#lang-select");
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tab]"));
const tabPanels = Array.from(document.querySelectorAll<HTMLElement>("[data-tab-panel]"));
const previewButton = document.querySelector<HTMLButtonElement>("#preview");
const loadConfigButton = document.querySelector<HTMLButtonElement>("#load-config");
const saveConfigButton = document.querySelector<HTMLButtonElement>("#save-config");
const checkUpdateButton = document.querySelector<HTMLButtonElement>("#check-update");
const runButton = document.querySelector<HTMLButtonElement>("#run");
const output = document.querySelector<HTMLElement>("#output");
const setupSummary = document.querySelector<HTMLElement>("#setup-summary");
const resultMode = document.querySelector<HTMLElement>("#result-mode");
const resultCards = document.querySelector<HTMLElement>("#result-cards");
const resultActions = document.querySelector<HTMLElement>("#result-actions");
const outputDetails = document.querySelector<HTMLDetailsElement>("#output-details");
const status = document.querySelector<HTMLElement>("#status");
const outputDirInput = document.querySelector<HTMLInputElement>("#output-dir");
const selectedTopicTags = document.querySelector<HTMLElement>("#selected-topic-tags");
const topicTagSuggestions = document.querySelector<HTMLElement>("#topic-tag-suggestions");
const topicTagInput = document.querySelector<HTMLInputElement>("#topic-tag-input");
const addTopicTagButton = document.querySelector<HTMLButtonElement>("#add-topic-tag");
const configProfileInput = document.querySelector<HTMLInputElement>("#config-profile");
const configProfileOptions = document.querySelector<HTMLDataListElement>("#config-profile-options");
const browseOutputButton = document.querySelector<HTMLButtonElement>("#browse-output");
const providerPresetInput = document.querySelector<HTMLSelectElement>("#provider-preset");
const providerInput = document.querySelector<HTMLSelectElement>("#provider");
const modelInput = document.querySelector<HTMLInputElement>("#model");
const baseUrlInput = document.querySelector<HTMLInputElement>("#base-url");
const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key");
const toggleApiKeyVisibilityButton = document.querySelector<HTMLButtonElement>("#toggle-api-key-visibility");
const targetCountInput = document.querySelector<HTMLInputElement>("#target-count");
const planLimitInput = document.querySelector<HTMLInputElement>("#plan-limit");
const shardSizeInput = document.querySelector<HTMLInputElement>("#shard-size");
const batchSizeInput = document.querySelector<HTMLInputElement>("#batch-size");
const maxInFlightInput = document.querySelector<HTMLInputElement>("#max-in-flight");
const maxRetriesInput = document.querySelector<HTMLInputElement>("#max-retries");
const timeoutInput = document.querySelector<HTMLInputElement>("#request-timeout-secs");
const resumeInput = document.querySelector<HTMLInputElement>("#resume");
const progressFill = document.querySelector<HTMLElement>("#progress-fill");
const progressMeta = document.querySelector<HTMLElement>("#progress-meta");
const logs = document.querySelector<HTMLElement>("#logs");

if (
  !promptInput ||
  !langSelect ||
  !previewButton ||
  !loadConfigButton ||
  !saveConfigButton ||
  !checkUpdateButton ||
  !runButton ||
  !output ||
  !setupSummary ||
  !resultMode ||
  !resultCards ||
  !resultActions ||
  !outputDetails ||
  !status ||
  !outputDirInput ||
  !selectedTopicTags ||
  !topicTagSuggestions ||
  !topicTagInput ||
  !addTopicTagButton ||
  !configProfileInput ||
  !configProfileOptions ||
  !browseOutputButton ||
  !providerPresetInput ||
  !providerInput ||
  !modelInput ||
  !baseUrlInput ||
  !apiKeyInput ||
  !toggleApiKeyVisibilityButton ||
  !targetCountInput ||
  !planLimitInput ||
  !shardSizeInput ||
  !batchSizeInput ||
  !maxInFlightInput ||
  !maxRetriesInput ||
  !timeoutInput ||
  !resumeInput ||
  !progressFill ||
  !progressMeta ||
  !logs
) {
  throw new Error("Missing UI elements");
}

function t(key: string): string {
  return translations[currentLang][key] ?? key;
}

function translationValues(key: string): string[] {
  return (Object.keys(translations) as Lang[])
    .map((lang) => translations[lang][key])
    .filter((value): value is string => Boolean(value));
}

function matchesAnyTranslation(text: string | null, keys: string[]): boolean {
  if (!text) {
    return false;
  }

  return keys.some((key) => translationValues(key).includes(text));
}

function findMatchingTranslationKey(text: string | null, keys: string[]): string | null {
  if (!text) {
    return null;
  }

  return keys.find((key) => translationValues(key).includes(text)) ?? null;
}

function formatMessage(key: string, value?: string): string {
  return value ? `${t(key)} ${value}` : t(key);
}

function topicTagLabel(tag: string): string {
  const translationKey = `tag_${tag}`;
  const translated = translations[currentLang][translationKey];
  return translated ?? tag;
}

function updateApiKeyVisibilityUi() {
  apiKeyInput.type = apiKeyVisible ? "text" : "password";
  toggleApiKeyVisibilityButton.textContent = t(apiKeyVisible ? "hide_secret" : "show_secret");
}

function normalizeTopicTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ");
}

function setCurrentTab(tab: UiTab) {
  currentTab = tab;
  for (const button of tabs) {
    button.dataset.active = button.dataset.tab === tab ? "true" : "false";
  }
  for (const panel of tabPanels) {
    panel.hidden = panel.dataset.tabPanel !== tab;
  }
}

function renderTopicTags() {
  if (topicTags.length === 0) {
    selectedTopicTags.innerHTML = `<p class="empty-inline">${escapeHtml(t("no_tags"))}</p>`;
  } else {
    selectedTopicTags.innerHTML = topicTags
      .map(
        (tag) => `
          <button class="tag-chip active removable" type="button" data-selected-tag="${escapeHtml(tag)}">
            <span>${escapeHtml(topicTagLabel(tag))}</span>
            <span class="tag-chip-close">×</span>
          </button>
        `
      )
      .join("");
  }

  topicTagSuggestions.innerHTML = TOPIC_TAG_KEYS.map((tag) => {
    const active = topicTags.includes(tag);
    return `<button class="tag-chip${active ? " active" : ""}" type="button" data-suggested-tag="${tag}">${escapeHtml(topicTagLabel(tag))}</button>`;
  }).join("");
}

function addTopicTag(tag: string) {
  const normalized = normalizeTopicTag(tag);
  if (!normalized) {
    return;
  }
  if (!topicTags.includes(normalized)) {
    topicTags = [...topicTags, normalized];
    renderTopicTags();
    renderSetupSummary();
  }
}

function removeTopicTag(tag: string) {
  topicTags = topicTags.filter((item) => item !== tag);
  renderTopicTags();
  renderSetupSummary();
}

function composeEffectivePrompt(prompt: string, tags: string[]): string {
  if (!tags.length) {
    return prompt;
  }

  return [
    prompt,
    "",
    "Relevant research fields / directions:",
    ...tags.map((tag) => `- ${topicTagLabel(tag)}`)
  ].join("\n");
}

function normalizeProfileName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_PROFILE_NAME;
  }

  const normalized = trimmed
    .split("")
    .map((char) => {
      if (/^[a-zA-Z0-9_-]$/.test(char)) {
        return char;
      }
      if (char === "." || /\s/.test(char)) {
        return "-";
      }
      return "";
    })
    .join("")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || DEFAULT_PROFILE_NAME;
}

function selectedProfileName(): string {
  return normalizeProfileName(configProfileInput.value);
}

function syncConfigProfileInput(profileName?: string) {
  configProfileInput.value = normalizeProfileName(profileName ?? configProfileInput.value);
  renderSetupSummary();
}

function renderConfigProfileOptions(profiles: ConfigProfileSummary[]) {
  const options = profiles.length
    ? profiles
    : [{ name: DEFAULT_PROFILE_NAME, path: "" }];

  configProfileOptions.innerHTML = options
    .map((profile) => `<option value="${escapeHtml(profile.name)}"></option>`)
    .join("");
}

async function refreshConfigProfiles(logFailure = false, preferredName?: string) {
  try {
    const profiles = await invoke<ConfigProfileSummary[]>("list_local_pipeline_profiles");
    renderConfigProfileOptions(profiles);
    syncConfigProfileInput(preferredName);
  } catch (error) {
    if (logFailure) {
      appendLog(`${t("log_profile_list_failed")}: ${String(error)}`);
    }
  }
}

function currentPresetLabel(presetId: ProviderPresetId): string {
  return t(`preset_${presetId}`);
}

function detectProviderPreset(fields: {
  provider: string;
  baseUrl: string | null;
}): ProviderPresetId {
  const provider = fields.provider.trim();
  const baseUrl = (fields.baseUrl ?? "").trim();

  if (
    provider === PROVIDER_PRESETS.qwen_dashscope.provider &&
    baseUrl === PROVIDER_PRESETS.qwen_dashscope.baseUrl
  ) {
    return "qwen_dashscope";
  }

  if (
    provider === PROVIDER_PRESETS.stub_local.provider &&
    baseUrl === PROVIDER_PRESETS.stub_local.baseUrl
  ) {
    return "stub_local";
  }

  return "custom";
}

function syncProviderPresetInput() {
  providerPresetInput.value = detectProviderPreset({
    provider: providerInput.value,
    baseUrl: baseUrlInput.value
  });
}

function applyProviderPreset(presetId: ProviderPresetId, logChange = false) {
  if (presetId === "custom") {
    syncProviderPresetInput();
    renderSetupSummary();
    return;
  }

  const preset = PROVIDER_PRESETS[presetId];
  providerInput.value = preset.provider;
  modelInput.value = preset.model;
  baseUrlInput.value = preset.baseUrl;
  batchSizeInput.value = String(preset.batchSize);
  maxInFlightInput.value = String(preset.maxInFlight);
  timeoutInput.value = String(preset.requestTimeoutSecs);
  providerPresetInput.value = presetId;
  renderSetupSummary();

  if (logChange) {
    appendLog(formatMessage("log_applied_preset", currentPresetLabel(presetId)));
  }
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(currentLang === "zh" ? "zh-CN" : "en-US").format(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function displayValue(value: string): string {
  return value.trim() ? value : t("empty_value");
}

function renderEmptyCard(message: string) {
  resultCards.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderValidationIssues(issues: ValidationIssueKey[]) {
  resultCards.innerHTML = `
    <article class="result-card wide">
      <p class="result-card-label">${escapeHtml(t("validation_issues"))}</p>
      <ul class="validation-list">
        ${issues.map((issue) => `<li class="validation-item">${escapeHtml(t(issue))}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderCards(cards: Array<{ labelKey: string; value: string; wide?: boolean }>) {
  resultCards.innerHTML = cards
    .map(
      ({ labelKey, value, wide }) => `
        <article class="result-card${wide ? " wide" : ""}">
          <p class="result-card-label">${escapeHtml(t(labelKey))}</p>
          <p class="result-card-value">${escapeHtml(displayValue(value))}</p>
        </article>
      `
    )
    .join("");
}

function renderActionButtons(actions: Array<{ key: string; action: string }>) {
  if (!actions.length) {
    resultActions.innerHTML = "";
    return;
  }

  resultActions.innerHTML = `
    <p class="result-actions-title">${escapeHtml(t("result_actions"))}</p>
    <div class="result-action-list">
      ${actions
        .map(
          ({ key, action }) =>
            `<button class="action-button" type="button" data-result-action="${escapeHtml(action)}">${escapeHtml(t(key))}</button>`
        )
        .join("")}
    </div>
  `;
}

function renderSetupSummary() {
  const prompt = promptInput.value.trim();
  const profile = selectedProfileName();
  const providerPreset = providerPresetInput.value === "custom"
    ? t("preset_custom")
    : currentPresetLabel(providerPresetInput.value as ProviderPresetId);
  const promptSummary = prompt.length > 96 ? `${prompt.slice(0, 96)}...` : prompt;

  const items = [
    { labelKey: "summary_profile", value: profile },
    { labelKey: "summary_preset", value: providerPreset },
    { labelKey: "summary_provider", value: providerInput.value },
    { labelKey: "summary_model", value: modelInput.value.trim() },
    { labelKey: "summary_topic_tags", value: topicTags.length ? topicTags.map(topicTagLabel).join(", ") : t("empty_value") },
    { labelKey: "summary_output_dir", value: outputDirInput.value.trim() || t("empty_value") },
    { labelKey: "summary_prompt", value: promptSummary || t("empty_value"), wide: true }
  ];

  setupSummary.innerHTML = items
    .map(
      ({ labelKey, value, wide }) => `
        <article class="result-card${wide ? " wide" : ""}">
          <p class="result-card-label">${escapeHtml(t(labelKey))}</p>
          <p class="result-card-value">${escapeHtml(displayValue(value))}</p>
        </article>
      `
    )
    .join("");
}

function currentRunResponse(): PipelineResponse | null {
  return outputState.kind === "run_success" ? outputState.response : null;
}

function failureTitle(phase: "preview" | "run"): string {
  return t(phase === "preview" ? "preview_failed" : "pipeline_failed");
}

function renderOutput() {
  setText("result-title", t("result_title"));
  setText("result-copy", t("result_copy"));
  setText("raw-output-summary", t("raw_json"));

  switch (outputState.kind) {
    case "idle":
      resultMode.textContent = t("output_mode_idle");
      renderEmptyCard(t("no_preview"));
      renderActionButtons([]);
      output.textContent = t("no_preview");
      outputDetails.hidden = true;
      outputDetails.open = false;
      return;
    case "preview_loading":
      resultMode.textContent = t("output_mode_preview");
      renderEmptyCard(t("preview_generating"));
      renderActionButtons([]);
      output.textContent = t("preview_generating");
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "run_loading":
      resultMode.textContent = t("output_mode_run");
      renderEmptyCard(t("running_pipeline"));
      renderActionButtons([]);
      output.textContent = t("running_pipeline");
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "preview_success":
      resultMode.textContent = t("output_mode_preview");
      renderCards([
        { labelKey: "summary_topic_name", value: outputState.preview.topic_name },
        { labelKey: "summary_target_count", value: formatCount(outputState.preview.target_count) },
        { labelKey: "summary_keyword_count", value: formatCount(outputState.preview.keywords.length) },
        { labelKey: "summary_subtopic_count", value: formatCount(outputState.preview.subtopics.length) },
        { labelKey: "summary_axis_count", value: formatCount(outputState.preview.question_axes.length) },
        { labelKey: "summary_goal", value: outputState.preview.goal, wide: true },
        { labelKey: "summary_keywords", value: outputState.preview.keywords.join(", "), wide: true }
      ]);
      renderActionButtons([]);
      output.textContent = JSON.stringify(outputState.preview, null, 2);
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "run_success":
      resultMode.textContent = t("output_mode_run");
      renderCards([
        { labelKey: "summary_provider", value: outputState.response.generatedSummary.provider },
        { labelKey: "summary_model", value: outputState.response.generatedSummary.model },
        {
          labelKey: "summary_generated_count",
          value: formatCount(outputState.response.generatedSummary.generatedCount)
        },
        { labelKey: "summary_kept_count", value: formatCount(outputState.response.keptCount) },
        {
          labelKey: "summary_shards",
          value: `${formatCount(outputState.response.generatedSummary.completedShards)} / ${formatCount(outputState.response.generatedSummary.shardCount)} · ${t("skipped")} ${formatCount(outputState.response.generatedSummary.skippedShards)}`
        },
        {
          labelKey: "summary_request_count",
          value: formatCount(outputState.response.generatedSummary.requestCount)
        },
        { labelKey: "summary_dataset_path", value: outputState.response.datasetPath, wide: true },
        { labelKey: "summary_output_dir", value: outputState.response.outputDir, wide: true }
      ]);
      renderActionButtons([
        { key: "action_open_output_dir", action: "open-output-dir" },
        { key: "action_open_dataset", action: "open-dataset" },
        { key: "action_open_pack_summary", action: "open-pack-summary" },
        { key: "action_copy_output_dir", action: "copy-output-dir" },
        { key: "action_copy_dataset_path", action: "copy-dataset-path" }
      ]);
      output.textContent = JSON.stringify(outputState.response, null, 2);
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "validation_error":
      resultMode.textContent = t("output_mode_validation");
      renderValidationIssues(outputState.issues);
      renderActionButtons([]);
      output.textContent = [t("validation_failed"), ...outputState.issues.map((issue) => `- ${t(issue)}`)].join("\n");
      outputDetails.hidden = false;
      outputDetails.open = true;
      return;
    case "error":
      resultMode.textContent = t("output_mode_error");
      renderEmptyCard(`${failureTitle(outputState.phase)}: ${outputState.message}`);
      renderActionButtons([]);
      output.textContent = `${failureTitle(outputState.phase)}: ${outputState.message}`;
      outputDetails.hidden = false;
      outputDetails.open = true;
  }
}

function setText(id: string, value: string) {
  const element = document.querySelector<HTMLElement>(`#${id}`);
  if (element) {
    element.textContent = value;
  }
}

function applyTranslations() {
  document.documentElement.lang = currentLang;
  langSelect.value = currentLang;
  setText("eyebrow", t("eyebrow"));
  setText("lang-label", t("lang_label"));
  setText("hero-title", t("hero_title"));
  setText("hero-lede", t("hero_lede"));
  setText("panel-title", t("panel_title"));
  setText("panel-copy", t("panel_copy"));
  setText("nav-title", t("nav_title"));
  setText("nav-copy", t("nav_copy"));
  setText("actions-setup-title", t("actions_setup"));
  setText("actions-run-title", t("actions_run"));
  setText("tab-topic-label", t("tab_topic"));
  setText("tab-model-label", t("tab_model"));
  setText("tab-runtime-label", t("tab_runtime"));
  setText("tab-topic-copy", t("tab_topic_copy"));
  setText("tab-model-copy", t("tab_model_copy"));
  setText("tab-runtime-copy", t("tab_runtime_copy"));
  setText("setup-title", t("setup_title"));
  setText("setup-copy", t("setup_copy"));
  setText("topic-tab-title", t("topic_tab_title"));
  setText("topic-tab-copy", t("topic_tab_copy"));
  setText("model-tab-title", t("model_tab_title"));
  setText("model-tab-copy", t("model_tab_copy"));
  setText("runtime-tab-title", t("runtime_tab_title"));
  setText("runtime-tab-copy", t("runtime_tab_copy"));
  setText("topic-prompt-label", t("topic_prompt"));
  setText("topic-tags-label", t("topic_tags"));
  setText("topic-tags-hint", t("topic_tags_hint"));
  setText("selected-tags-label", t("selected_tags"));
  setText("output-directory-label", t("output_directory"));
  setText("config-profile-label", t("config_profile"));
  setText("config-profile-hint", t("config_profile_hint"));
  setText("provider-preset-label", t("provider_preset"));
  setText("provider-preset-hint", t("provider_preset_hint"));
  setText("provider-label", t("provider"));
  setText("model-label", t("model"));
  setText("base-url-label", t("base_url"));
  setText("api-key-label", t("api_key"));
  setText("api-key-hint", t("api_key_hint"));
  setText("provider-preset-option-custom", t("preset_custom"));
  setText("provider-preset-option-qwen", t("preset_qwen_dashscope"));
  setText("provider-preset-option-stub", t("preset_stub_local"));
  setText("target-count-label", t("target_count"));
  setText("plan-limit-label", t("plan_limit"));
  setText("shard-size-label", t("shard_size"));
  setText("batch-size-label", t("batch_size"));
  setText("max-in-flight-label", t("max_in_flight"));
  setText("max-retries-label", t("max_retries"));
  setText("timeout-secs-label", t("timeout_secs"));
  setText("resume-existing-label", t("resume_existing"));
  setText("telemetry-title", t("telemetry_title"));
  setText("telemetry-copy", t("telemetry_copy"));
  previewButton.textContent = t("preview");
  loadConfigButton.textContent = t("load_config");
  saveConfigButton.textContent = t("save_config");
  checkUpdateButton.textContent = t("action_check_update");
  browseOutputButton.textContent = t("browse");
  runButton.textContent = t("run_pipeline");
  addTopicTagButton.textContent = t("add_tag");
  topicTagInput.placeholder = t("custom_tag_placeholder");
  updateApiKeyVisibilityUi();
  const logPlaceholderKey = findMatchingTranslationKey(logs.textContent, [
    "no_run",
    "waiting_events"
  ]);
  if (logPlaceholderKey) {
    logs.textContent = t(logPlaceholderKey);
  }
  setStatus(currentStatus, currentStatus !== "idle");
  setCurrentTab(currentTab);
  renderTopicTags();
  renderSetupSummary();
  renderOutput();
}

function readNumber(input: HTMLInputElement): number {
  return Number.parseInt(input.value, 10);
}

function setStatus(nextStatus: "idle" | "previewing" | "running" | "updating", busy = false) {
  currentStatus = nextStatus;
  status.textContent = t(`status_${nextStatus}`);
  status.dataset.busy = busy ? "true" : "false";
  previewButton.disabled = busy;
  loadConfigButton.disabled = busy;
  saveConfigButton.disabled = busy;
  checkUpdateButton.disabled = busy;
  browseOutputButton.disabled = busy;
  runButton.disabled = busy;
}

function appendLog(line: string) {
  const now = new Date().toLocaleTimeString();
  const next = `[${now}] ${line}`;
  logs.textContent = matchesAnyTranslation(logs.textContent, ["no_run", "waiting_events"])
    ? next
    : `${logs.textContent}\n${next}`;
  logs.scrollTop = logs.scrollHeight;
}

function setProgress(current: number, total: number) {
  const safeTotal = total <= 0 ? 1 : total;
  const percent = Math.max(0, Math.min(100, (current / safeTotal) * 100));
  progressFill.style.width = `${percent}%`;
  progressMeta.textContent = `${current} / ${total}`;
}

function resetTelemetry() {
  logs.textContent = t("waiting_events");
  setProgress(0, 5);
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    appendLog(formatMessage("log_copied_value", value));
  } catch (error) {
    appendLog(`${t("log_copy_failed")}: ${String(error)}`);
  }
}

async function openResultPath(path: string) {
  try {
    await invoke("open_path", { path });
    appendLog(formatMessage("log_opened_path", path));
  } catch (error) {
    appendLog(`${t("log_open_failed")}: ${String(error)}`);
  }
}

function collectRequest() {
  const request: PipelineFormRequest = {
    prompt: promptInput.value.trim(),
    topicTags: [...topicTags],
    targetCount: readNumber(targetCountInput),
    planLimit: readNumber(planLimitInput),
    outputDir: outputDirInput.value.trim(),
    provider: providerInput.value,
    model: modelInput.value.trim(),
    baseUrl: baseUrlInput.value.trim() || null,
    apiKey: apiKeyInput.value.trim() || null,
    apiKeyEnv: null,
    temperature: 0.8,
    maxTokens: providerInput.value === "openai-compatible" ? 2400 : 800,
    shardSize: readNumber(shardSizeInput),
    batchSize: readNumber(batchSizeInput),
    maxInFlight: readNumber(maxInFlightInput),
    maxRetries: readNumber(maxRetriesInput),
    requestTimeoutSecs: readNumber(timeoutInput),
    resume: resumeInput.checked
  };

  return request;
}

function validateRequest(request: PipelineFormRequest): ValidationIssueKey[] {
  const issues: ValidationIssueKey[] = [];

  if (!request.prompt) {
    issues.push("validation_issue_prompt_required");
  }
  if (!request.outputDir) {
    issues.push("validation_issue_output_dir_required");
  }
  if (!request.model) {
    issues.push("validation_issue_model_required");
  }
  if (request.provider === "openai-compatible" && !request.baseUrl) {
    issues.push("validation_issue_base_url_required");
  }
  if (request.provider === "openai-compatible" && !request.apiKey) {
    issues.push("validation_issue_api_key_required");
  }

  return issues;
}

function applyRequest(request: PipelineFormRequest) {
  promptInput.value = request.prompt;
  topicTags = [...request.topicTags];
  targetCountInput.value = String(request.targetCount);
  planLimitInput.value = String(request.planLimit);
  outputDirInput.value = request.outputDir;
  providerInput.value = request.provider;
  modelInput.value = request.model;
  baseUrlInput.value = request.baseUrl ?? "";
  apiKeyInput.value = request.apiKey ?? "";
  shardSizeInput.value = String(request.shardSize);
  batchSizeInput.value = String(request.batchSize);
  maxInFlightInput.value = String(request.maxInFlight);
  maxRetriesInput.value = String(request.maxRetries);
  timeoutInput.value = String(request.requestTimeoutSecs);
  resumeInput.checked = request.resume;
  syncProviderPresetInput();
  renderTopicTags();
  renderSetupSummary();
}

void listen<PipelineProgressEvent>("pipeline-progress", (event) => {
  const payload = event.payload;
  const stageKey = `stage_${payload.stage.replace(/-/g, "_")}`;
  const statusKey = `event_${payload.status.replace(/-/g, "_")}`;
  setProgress(payload.currentStep, payload.totalSteps);
  appendLog(`${t(stageKey)} [${t(statusKey)}] ${payload.message}`);
});

void listen<AppUpdateProgressEvent>("app-update-progress", (event) => {
  appendLog(event.payload.message);
});

async function loadConfig(auto = false) {
  const profileName = selectedProfileName();
  try {
    const request = await invoke<PipelineFormRequest | null>("load_local_pipeline_config", {
      profileName
    });
    if (!request) {
      if (!auto) {
        appendLog(formatMessage("log_no_local_config_profile", profileName));
      }
      return;
    }
    applyRequest(request);
    syncConfigProfileInput(profileName);
    appendLog(
      formatMessage(
        auto ? "log_loaded_startup_profile" : "log_loaded_manual_profile",
        profileName
      )
    );
    await refreshConfigProfiles(false, profileName);
  } catch (error) {
    appendLog(`${t("log_load_failed")}: ${String(error)}`);
  }
}

langSelect.addEventListener("change", () => {
  currentLang = langSelect.value === "zh" ? "zh" : "en";
  window.localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  applyTranslations();
});

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    const nextTab = tab.dataset.tab as UiTab | undefined;
    if (nextTab) {
      setCurrentTab(nextTab);
    }
  });
}

selectedTopicTags.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest<HTMLElement>("[data-selected-tag]");
  const tag = button?.dataset.selectedTag;
  if (tag) {
    removeTopicTag(tag);
  }
});

topicTagSuggestions.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest<HTMLElement>("[data-suggested-tag]");
  const tag = button?.dataset.suggestedTag;
  if (!tag) {
    return;
  }

  if (topicTags.includes(tag)) {
    removeTopicTag(tag);
    return;
  }
  addTopicTag(tag);
});

addTopicTagButton.addEventListener("click", () => {
  addTopicTag(topicTagInput.value);
  topicTagInput.value = "";
});

topicTagInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addTopicTag(topicTagInput.value);
    topicTagInput.value = "";
  }
});

configProfileInput.addEventListener("blur", () => {
  syncConfigProfileInput();
});

providerPresetInput.addEventListener("change", () => {
  const presetId = providerPresetInput.value as ProviderPresetId;
  applyProviderPreset(presetId, presetId !== "custom");
});

providerInput.addEventListener("change", () => {
  syncProviderPresetInput();
  renderSetupSummary();
});
modelInput.addEventListener("input", () => {
  syncProviderPresetInput();
  renderSetupSummary();
});
baseUrlInput.addEventListener("input", () => {
  syncProviderPresetInput();
  renderSetupSummary();
});
apiKeyInput.addEventListener("input", () => {
  renderSetupSummary();
});
toggleApiKeyVisibilityButton.addEventListener("click", () => {
  apiKeyVisible = !apiKeyVisible;
  updateApiKeyVisibilityUi();
});
promptInput.addEventListener("input", renderSetupSummary);
outputDirInput.addEventListener("input", renderSetupSummary);
targetCountInput.addEventListener("input", renderSetupSummary);
planLimitInput.addEventListener("input", renderSetupSummary);

previewButton.addEventListener("click", async () => {
  const request = collectRequest();
  setStatus("previewing", true);
  outputState = { kind: "preview_loading" };
  renderOutput();

  try {
    const preview = await invoke<TopicPreview>("preview_topic_spec", {
      prompt: composeEffectivePrompt(request.prompt, request.topicTags),
      targetCount: request.targetCount
    });
    outputState = { kind: "preview_success", preview };
    renderOutput();
  } catch (error) {
    outputState = { kind: "error", phase: "preview", message: String(error) };
    renderOutput();
  } finally {
    setStatus("idle", false);
  }
});

loadConfigButton.addEventListener("click", async () => {
  await loadConfig(false);
});

browseOutputButton.addEventListener("click", async () => {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: outputDirInput.value.trim() || undefined
    });
    if (typeof selected === "string" && selected.trim()) {
      outputDirInput.value = selected;
      appendLog(formatMessage("log_selected_output", selected));
    }
  } catch (error) {
    appendLog(`${t("log_browse_failed")}: ${String(error)}`);
  }
});

saveConfigButton.addEventListener("click", async () => {
  const profileName = selectedProfileName();
  try {
    const saved = await invoke<ConfigProfileSummary>("save_local_pipeline_config", {
      profileName,
      request: collectRequest()
    });
    syncConfigProfileInput(saved.name);
    await refreshConfigProfiles(false, saved.name);
    appendLog(`${t("log_saved_profile")} ${saved.name} -> ${saved.path}`);
  } catch (error) {
    appendLog(`${t("log_save_failed")}: ${String(error)}`);
  }
});

function buildUpdatePrompt(response: AppUpdateCheckResponse): string {
  const lines = [
    currentLang === "zh"
      ? `当前版本：${response.currentVersion}`
      : `Current version: ${response.currentVersion}`,
    currentLang === "zh"
      ? `最新版本：${response.version ?? "unknown"}`
      : `Latest version: ${response.version ?? "unknown"}`
  ];

  if (response.date) {
    lines.push(
      currentLang === "zh"
        ? `发布时间：${response.date}`
        : `Release date: ${response.date}`
    );
  }

  if (response.body) {
    const notes = response.body.trim();
    if (notes) {
      lines.push("");
      lines.push(currentLang === "zh" ? "更新说明：" : "Release notes:");
      lines.push(notes);
    }
  }

  lines.push("");
  lines.push(currentLang === "zh" ? "现在安装这个更新吗？" : "Install this update now?");
  return lines.join("\n");
}

checkUpdateButton.addEventListener("click", async () => {
  setStatus("updating", true);

  try {
    const response = await invoke<AppUpdateCheckResponse>("check_for_app_update");
    if (!response.configured) {
      appendLog(t("log_update_not_configured"));
      setStatus("idle", false);
      return;
    }

    if (response.sourcePath) {
      appendLog(`${t("log_update_source")}: ${response.sourcePath}`);
    }

    if (!response.updateAvailable) {
      appendLog(`${t("log_update_not_available")} (${response.currentVersion})`);
      setStatus("idle", false);
      return;
    }

    appendLog(`${t("log_update_available")} ${response.version ?? ""}`.trim());
    const shouldInstall = window.confirm(buildUpdatePrompt(response));
    if (!shouldInstall) {
      appendLog(t("log_update_declined"));
      setStatus("idle", false);
      return;
    }

    appendLog(`${t("log_update_installing")} ${response.version ?? ""}`.trim());
    await invoke("install_app_update");
  } catch (error) {
    appendLog(`${t("log_update_failed")}: ${String(error)}`);
    setStatus("idle", false);
  }
});

resultActions.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.dataset.resultAction;
  const response = currentRunResponse();
  if (!action || !response) {
    return;
  }

  if (action === "open-output-dir") {
    await openResultPath(response.outputDir);
    return;
  }
  if (action === "open-dataset") {
    await openResultPath(response.datasetPath);
    return;
  }
  if (action === "open-pack-summary") {
    await openResultPath(response.packSummaryPath);
    return;
  }
  if (action === "copy-output-dir") {
    await copyText(response.outputDir);
    return;
  }
  if (action === "copy-dataset-path") {
    await copyText(response.datasetPath);
  }
});

runButton.addEventListener("click", async () => {
  const request = collectRequest();
  const issues = validateRequest(request);
  if (issues.length > 0) {
    outputState = { kind: "validation_error", issues };
    renderOutput();
    appendLog(`${t("log_validation_failed")}: ${issues.map((issue) => t(issue)).join(" ")}`);
    return;
  }

  setStatus("running", true);
  outputState = { kind: "run_loading" };
  renderOutput();
  resetTelemetry();
  appendLog(t("log_request_submitted"));

  try {
    const response = await invoke<PipelineResponse>("run_pipeline", {
      request: {
        ...request,
        prompt: composeEffectivePrompt(request.prompt, request.topicTags)
      }
    });
    outputState = { kind: "run_success", response };
    renderOutput();
    appendLog(formatMessage("log_pipeline_completed", response.datasetPath));
  } catch (error) {
    outputState = { kind: "error", phase: "run", message: String(error) };
    renderOutput();
    appendLog(`${t("pipeline_failed")}: ${String(error)}`);
  } finally {
    setStatus("idle", false);
  }
});

async function initializeApp() {
  applyTranslations();
  syncConfigProfileInput(DEFAULT_PROFILE_NAME);
  syncProviderPresetInput();
  await refreshConfigProfiles(false, selectedProfileName());
  await loadConfig(true);
}

void initializeApp();
