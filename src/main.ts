import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { message } from "@tauri-apps/plugin-dialog";
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
  runtimeKind?: string | null;
  retryAttempt?: number | null;
  retryLimit?: number | null;
  errorMessage?: string | null;
  shardIndex?: number | null;
  shardCount?: number | null;
  shardItemCompleted?: number | null;
  shardItemTotal?: number | null;
  totalGenerated?: number | null;
  targetCount?: number | null;
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

type QaBatchSummary = {
  id: string;
  name: string;
  topicName: string;
  prompt: string;
  qaMode: string | null;
  targetCount: number | null;
  generatedCount: number;
  keptCount: number;
  totalCount: number;
  shardCount: number | null;
  completedShards: number;
  skippedShards: number;
  requestCount: number | null;
  status: string;
  provider: string | null;
  model: string | null;
  outputDir: string;
  updatedAtMs: number | null;
};

type QaRecordSummary = {
  id: string;
  question: string;
  subtopic: string;
  axis: string;
  questionType: string;
  difficulty: string;
  audience: string;
};

type QaRecordPage = {
  batch: QaBatchSummary;
  items: QaRecordSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

type QaRecordDetail = {
  batch: QaBatchSummary;
  item: {
    id: string;
    shard_id: number;
    topic_name: string;
    subtopic: string;
    axis: string;
    question_type: string;
    difficulty: string;
    audience: string;
    question: string;
    answer: string;
    source_type: string;
    grounding: string;
    provider: string;
    model: string;
    qa_mode: string;
  };
};

type UiTab = "topic" | "settings" | "browse";
type BrowseView = "batches" | "questions" | "detail";

type ProviderPresetId =
  | "custom"
  | "qwen_dashscope"
  | "deepseek"
  | "moonshot_kimi"
  | "zhipu_glm"
  | "minimax"
  | "tencent_hunyuan"
  | "baidu_qianfan"
  | "stub_local";

type ProviderPresetConfigKey = Exclude<ProviderPresetId, "custom">;
type ProviderPresetConfig = {
  provider: string;
  defaultModel: string;
  models: readonly string[];
  baseUrl: string;
  batchSize: number;
  maxInFlight: number;
  requestTimeoutSecs: number;
};

type ResearchFieldNode = {
  id: string;
  zh: string;
  en: string;
  children?: readonly ResearchFieldNode[];
};

type ResearchFieldLabelMeta = {
  fullZh: string;
  fullEn: string;
  shortZh: string;
  shortEn: string;
};

type ValidationIssueKey =
  | "validation_issue_prompt_required"
  | "validation_issue_model_required"
  | "validation_issue_base_url_required"
  | "validation_issue_api_key_required"
  | "validation_issue_target_count_invalid"
  | "validation_issue_plan_limit_invalid"
  | "validation_issue_shard_size_invalid"
  | "validation_issue_batch_size_invalid"
  | "validation_issue_max_in_flight_invalid"
  | "validation_issue_max_retries_invalid"
  | "validation_issue_timeout_invalid";

type PipelineFormRequest = {
  prompt: string;
  topicTags: string[];
  qaMode: "normal" | "cot";
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
  managedRunMode: "new" | "resume-latest" | "resume-batch";
  managedRunBatchId?: string | null;
  qaUploadUrl: string | null;
  literatureApiUrl: string | null;
  literatureApiAuthToken: string | null;
};

type QaBatchUploadResponse = {
  status: number;
  uploadedCount: number;
  url: string;
};

type OutputState =
  | { kind: "idle" }
  | { kind: "preview_loading" }
  | { kind: "run_loading" }
  | { kind: "preview_success"; preview: TopicPreview }
  | { kind: "run_success"; response: PipelineResponse }
  | { kind: "cancelled"; message: string }
  | { kind: "validation_error"; issues: ValidationIssueKey[] }
  | { kind: "error"; phase: "preview" | "run"; message: string };

type RunStatsSnapshot = {
  startedAtMs: number | null;
  lastUpdatedAtMs: number | null;
  generatedCount: number;
  targetCount: number | null;
  shardIndex: number | null;
  shardCount: number | null;
  completedBatchCount: number;
  estimatedBatchCount: number | null;
  completedShardCount: number;
  skippedShardCount: number;
  retryCount: number;
  failedBatchCount: number;
  samples: Array<{ atMs: number; generatedCount: number }>;
};

const LANG_STORAGE_KEY = "distill-studio.lang";
const FIRST_LAUNCH_COMPLETED_KEY = "distill-studio.first-launch-complete";
const DEFAULT_PROFILE_NAME = "default";
const AUTO_SAVE_DELAY_MS = 600;
const MANAGED_OUTPUT_DIR = "__managed__";
const CUSTOM_MODEL_VALUE = "__custom__";
const DEFAULT_COT_TARGET_COUNT = 10;
const COT_TARGET_COUNT_CAP = 100;
const DEFAULT_COT_SHARD_SIZE = 10;
const COT_SAFE_SHARD_SIZE_CAP = 10;
const DEFAULT_COT_BATCH_SIZE = 1;
const DEFAULT_COT_MAX_IN_FLIGHT = 1;
const FALLBACK_REAL_PROVIDER_PRESET: ProviderPresetId = "qwen_dashscope";
const COT_SECTION_CONFIG = [
  { heading: "Workflow Summary", translationKey: "cot_section_workflow_summary" },
  { heading: "Reference Milestones", translationKey: "cot_section_reference_milestones" },
  { heading: "Reference Steps", translationKey: "cot_section_reference_steps" },
  { heading: "Step Rationale", translationKey: "cot_section_step_rationale" },
  { heading: "Decision Points", translationKey: "cot_section_decision_points" },
  { heading: "Quality Checks", translationKey: "cot_section_quality_checks" },
  { heading: "Failure Modes", translationKey: "cot_section_failure_modes" },
  { heading: "Final Interpretation", translationKey: "cot_section_final_interpretation" }
] as const;

const SETTING_HELP_CONTENT: Record<Lang, Record<string, { title: string; body: string }>> = {
  zh: {
    provider_preset: {
      title: "模型厂商",
      body: "用于快速套用常见平台的接入配置。\n\n选择厂商后，程序会自动填写对应的模型列表、Base URL 和推荐运行参数。只有在你接自建网关或特殊兼容接口时，才需要切到自定义。"
    },
    model: {
      title: "模型",
      body: "本次实际调用的大模型名称。\n\n如果厂商已内置常用模型，直接下拉选择即可；只有接私有模型名时才需要改成自定义模型。"
    },
    base_url: {
      title: "Base URL",
      body: "模型接口的根地址。\n\n对于 OpenAI 兼容接口，程序会向这个地址下的 `/chat/completions` 发请求。一般使用厂商默认值即可，只有代理网关或私有部署时才需要修改。"
    },
    api_key: {
      title: "API 密钥",
      body: "访问模型服务所需的鉴权密钥。\n\n当前桌面版会把密钥保存在本地配置中，界面默认隐藏显示，不会写入输出结果目录。"
    },
    qa_upload_url: {
      title: "QA 上传地址",
      body: "用于把生成批次上传到 QA 评测平台的接口地址。\n\n如果这里为空，浏览 QA 页面里的“上传”按钮会保持不可用。"
    },
    literature_api_url: {
      title: "文献 API 地址",
      body: "预留给文献增强链路的接口地址。\n\n当前你已要求先不接入正式生成流程，所以它现在主要是为后续扩展准备。"
    },
    literature_api_auth: {
      title: "文献 API 鉴权",
      body: "访问文献接口时使用的鉴权令牌或密钥。\n\n会跟随本地设置保存，不会写入输出批次目录。"
    },
    target_count: {
      title: "目标数量",
      body: "本次任务想最终生成多少条 QA。\n\n普通 QA 可以按正式生产规模填写。CoT QA 会自动限制在 100 条以内，避免一次测试过重。"
    },
    plan_limit: {
      title: "规划上限",
      body: "前置生成多少个候选问题计划。\n\n它不是最终 QA 数量，而是问题草案池。数量越高，主题覆盖可能更丰富，但前置规划也会更重。"
    },
    shard_size: {
      title: "Shard 大小",
      body: "每个结果分片文件最多包含多少条 QA。\n\n生成结果会按 `shard_XXXX.json` 分片保存，便于续跑、浏览和排错。它不能大于目标数量；CoT 模式下还会额外限制在 10 以内。"
    },
    batch_size: {
      title: "Batch 大小",
      body: "单次模型请求希望返回多少条 QA。\n\n值越大，速度可能更快，但模型更容易返回不稳定 JSON。它不能大于 shard 大小；CoT 模式固定为 1。"
    },
    max_in_flight: {
      title: "最大并发",
      body: "同时允许多少个生成请求并行发送。\n\n并发越高，速度可能越快，但也更容易触发限流、超时和格式不稳定。CoT 模式固定为 1。"
    },
    max_retries: {
      title: "最大重试",
      body: "单个请求失败后，最多再自动重试几次。\n\n适合应对临时网络抖动、上游限流或模型偶发返回异常。"
    },
    timeout_secs: {
      title: "超时秒数",
      body: "单个模型请求最多等待多久。\n\n如果回答很长或上游较慢，超时过短会导致误判失败；过长则会拖慢失败恢复。"
    },
    resume_existing: {
      title: "续跑已有 shard",
      body: "重新运行时，如果某些 shard 文件已经存在，是否直接跳过。\n\n适合长任务中断后的恢复，不必从头再跑全部分片。"
    }
  },
  en: {
    provider_preset: {
      title: "Model Provider",
      body: "Applies a ready-made vendor preset.\n\nChoosing a provider fills the model list, Base URL, and suggested runtime defaults. Use Custom only for private gateways or unusual compatible endpoints."
    },
    model: {
      title: "Model",
      body: "The actual model name used for generation.\n\nPick from the built-in list when available. Use a custom model only when you need a private or non-listed model id."
    },
    base_url: {
      title: "Base URL",
      body: "Root endpoint for the model API.\n\nFor OpenAI-compatible providers, the app sends requests to `/chat/completions` under this base URL. Most users should keep the vendor default."
    },
    api_key: {
      title: "API Key",
      body: "Authentication key for the model service.\n\nThe desktop app stores it in the local config, hides it by default in the UI, and does not write it into output batch folders."
    },
    qa_upload_url: {
      title: "QA Upload URL",
      body: "Endpoint used to upload generated batches to your QA evaluation platform.\n\nIf this is empty, the Upload action stays unavailable in Browse QA."
    },
    literature_api_url: {
      title: "Literature API URL",
      body: "Reserved endpoint for literature-enhanced workflows.\n\nIt is currently kept as a future integration field and is not yet part of the active generation path."
    },
    literature_api_auth: {
      title: "Literature API Auth",
      body: "Token or key used to access the literature API.\n\nIt is stored with the local settings and not written into output batch folders."
    },
    target_count: {
      title: "Target Count",
      body: "How many QA items this run should produce overall.\n\nNormal QA can use production-scale counts. CoT QA is automatically capped at 100 items for safer testing."
    },
    plan_limit: {
      title: "Plan Limit",
      body: "How many candidate question plans to draft before generation.\n\nThis is not the final QA count. A larger pool can improve coverage but makes the planning phase heavier."
    },
    shard_size: {
      title: "Shard Size",
      body: "Maximum QA items written into one shard file.\n\nOutputs are saved as `shard_XXXX.json` files for resume, browse, and debugging. It cannot exceed the target count, and CoT mode also caps it at 10."
    },
    batch_size: {
      title: "Batch Size",
      body: "How many QA items one model request should return.\n\nLarger batches can be faster but are more likely to produce unstable JSON. It cannot exceed the shard size, and CoT mode fixes it at 1."
    },
    max_in_flight: {
      title: "Max In Flight",
      body: "How many generation requests can run at the same time.\n\nHigher concurrency may improve speed but also increases rate-limit, timeout, and formatting risks. CoT mode fixes it at 1."
    },
    max_retries: {
      title: "Max Retries",
      body: "Maximum automatic retries for one failed request.\n\nUseful for temporary network problems, upstream rate limits, or occasional malformed model responses."
    },
    timeout_secs: {
      title: "Timeout Secs",
      body: "How long one model request can wait before timing out.\n\nIf responses are long or the upstream is slow, values that are too small can fail otherwise valid runs."
    },
    resume_existing: {
      title: "Resume Existing Shards",
      body: "Whether to skip shard files that already exist when rerunning.\n\nUseful for recovering long jobs without regenerating completed shards."
    }
  }
};
const RESEARCH_FIELD_TAXONOMY: readonly ResearchFieldNode[] = [
  {
    id: "agri",
    zh: "农业与生物育种",
    en: "Agriculture and Biological Breeding",
    children: [
      {
        id: "agri.crop_science",
        zh: "作物科学",
        en: "Crop Science",
        children: [
          { id: "agri.crop_science.crop_breeding", zh: "作物遗传育种", en: "Crop Genetics and Breeding" },
          { id: "agri.crop_science.molecular_breeding", zh: "分子育种", en: "Molecular Breeding" },
          { id: "agri.crop_science.genomic_selection", zh: "基因组选择", en: "Genomic Selection" },
          { id: "agri.crop_science.germplasm", zh: "种质创新与资源利用", en: "Germplasm Innovation and Utilization" },
          { id: "agri.crop_science.quality_improvement", zh: "品质改良", en: "Quality Improvement" }
        ]
      },
      {
        id: "agri.plant_biology",
        zh: "植物生物学",
        en: "Plant Biology",
        children: [
          { id: "agri.plant_biology.molecular_biology", zh: "植物分子生物学", en: "Plant Molecular Biology" },
          { id: "agri.plant_biology.gene_regulation", zh: "基因调控", en: "Gene Regulation" },
          { id: "agri.plant_biology.stress_biology", zh: "逆境生物学", en: "Stress Biology" },
          { id: "agri.plant_biology.development", zh: "植物发育", en: "Plant Development" },
          { id: "agri.plant_biology.physiology", zh: "植物生理", en: "Plant Physiology" }
        ]
      },
      {
        id: "agri.plant_protection",
        zh: "植物保护",
        en: "Plant Protection",
        children: [
          { id: "agri.plant_protection.disease_resistance", zh: "病害抗性", en: "Disease Resistance" },
          { id: "agri.plant_protection.insect_resistance", zh: "虫害抗性", en: "Insect Resistance" },
          { id: "agri.plant_protection.host_pathogen", zh: "寄主-病原互作", en: "Host-Pathogen Interaction" },
          { id: "agri.plant_protection.integrated_management", zh: "综合防控", en: "Integrated Pest Management" }
        ]
      },
      {
        id: "agri.seed_horticulture",
        zh: "种子与园艺",
        en: "Seed Science and Horticulture",
        children: [
          { id: "agri.seed_horticulture.seed_science", zh: "种子科学与技术", en: "Seed Science and Technology" },
          { id: "agri.seed_horticulture.vegetable_science", zh: "蔬菜科学", en: "Vegetable Science" },
          { id: "agri.seed_horticulture.fruit_science", zh: "果树科学", en: "Fruit Science" },
          { id: "agri.seed_horticulture.postharvest", zh: "采后生物学", en: "Postharvest Biology" }
        ]
      },
      {
        id: "agri.omics_bioinformatics",
        zh: "组学与农业生物信息",
        en: "Omics and Agricultural Bioinformatics",
        children: [
          { id: "agri.omics_bioinformatics.genomics", zh: "基因组学", en: "Genomics" },
          { id: "agri.omics_bioinformatics.transcriptomics", zh: "转录组学", en: "Transcriptomics" },
          { id: "agri.omics_bioinformatics.multiomics", zh: "多组学整合", en: "Multi-omics Integration" },
          { id: "agri.omics_bioinformatics.phenomics", zh: "表型组学", en: "Phenomics" },
          { id: "agri.omics_bioinformatics.systems_biology", zh: "系统生物学", en: "Systems Biology" }
        ]
      },
      {
        id: "agri.environment",
        zh: "农业资源与环境",
        en: "Agricultural Resources and Environment",
        children: [
          { id: "agri.environment.soil_science", zh: "土壤科学", en: "Soil Science" },
          { id: "agri.environment.nutrient_management", zh: "养分管理", en: "Nutrient Management" },
          { id: "agri.environment.agroecology", zh: "农业生态", en: "Agroecology" },
          { id: "agri.environment.smart_agriculture", zh: "智慧农业", en: "Smart Agriculture" }
        ]
      }
    ]
  },
  {
    id: "medicine",
    zh: "医学与健康",
    en: "Medicine and Health",
    children: [
      {
        id: "medicine.basic",
        zh: "基础医学",
        en: "Basic Medicine",
        children: [
          { id: "medicine.basic.molecular_medicine", zh: "分子医学", en: "Molecular Medicine" },
          { id: "medicine.basic.immunology", zh: "免疫学", en: "Immunology" },
          { id: "medicine.basic.neuroscience", zh: "神经科学", en: "Neuroscience" },
          { id: "medicine.basic.genomics", zh: "医学基因组学", en: "Medical Genomics" }
        ]
      },
      {
        id: "medicine.clinical",
        zh: "临床医学",
        en: "Clinical Medicine",
        children: [
          { id: "medicine.clinical.oncology", zh: "肿瘤学", en: "Oncology" },
          { id: "medicine.clinical.cardiovascular", zh: "心血管医学", en: "Cardiovascular Medicine" },
          { id: "medicine.clinical.infectious", zh: "感染性疾病", en: "Infectious Diseases" },
          { id: "medicine.clinical.precision", zh: "精准医学", en: "Precision Medicine" }
        ]
      },
      {
        id: "medicine.public_health",
        zh: "公共卫生与药学",
        en: "Public Health and Pharmacy",
        children: [
          { id: "medicine.public_health.epidemiology", zh: "流行病学", en: "Epidemiology" },
          { id: "medicine.public_health.drug_discovery", zh: "药物发现", en: "Drug Discovery" },
          { id: "medicine.public_health.pharmacology", zh: "药理学", en: "Pharmacology" },
          { id: "medicine.public_health.medical_informatics", zh: "医学信息学", en: "Medical Informatics" }
        ]
      }
    ]
  },
  {
    id: "chemistry_materials",
    zh: "化学与材料",
    en: "Chemistry and Materials",
    children: [
      {
        id: "chemistry_materials.chemistry",
        zh: "化学",
        en: "Chemistry",
        children: [
          { id: "chemistry_materials.chemistry.organic", zh: "有机化学", en: "Organic Chemistry" },
          { id: "chemistry_materials.chemistry.analytical", zh: "分析化学", en: "Analytical Chemistry" },
          { id: "chemistry_materials.chemistry.physical", zh: "物理化学", en: "Physical Chemistry" },
          { id: "chemistry_materials.chemistry.computational", zh: "计算化学", en: "Computational Chemistry" }
        ]
      },
      {
        id: "chemistry_materials.materials",
        zh: "材料科学",
        en: "Materials Science",
        children: [
          { id: "chemistry_materials.materials.nanomaterials", zh: "纳米材料", en: "Nanomaterials" },
          { id: "chemistry_materials.materials.energy_storage", zh: "储能材料", en: "Energy Storage Materials" },
          { id: "chemistry_materials.materials.polymer", zh: "高分子材料", en: "Polymer Materials" },
          { id: "chemistry_materials.materials.biomaterials", zh: "生物材料", en: "Biomaterials" }
        ]
      }
    ]
  },
  {
    id: "computer_ai",
    zh: "计算机与人工智能",
    en: "Computer Science and AI",
    children: [
      {
        id: "computer_ai.ai",
        zh: "人工智能",
        en: "Artificial Intelligence",
        children: [
          { id: "computer_ai.ai.large_models", zh: "大模型与智能体", en: "Large Models and Agents" },
          { id: "computer_ai.ai.machine_learning", zh: "机器学习", en: "Machine Learning" },
          { id: "computer_ai.ai.cv", zh: "计算机视觉", en: "Computer Vision" },
          { id: "computer_ai.ai.nlp", zh: "自然语言处理", en: "Natural Language Processing" }
        ]
      },
      {
        id: "computer_ai.data",
        zh: "数据与软件系统",
        en: "Data and Software Systems",
        children: [
          { id: "computer_ai.data.data_mining", zh: "数据挖掘", en: "Data Mining" },
          { id: "computer_ai.data.databases", zh: "数据库与知识管理", en: "Databases and Knowledge Management" },
          { id: "computer_ai.data.systems", zh: "分布式系统", en: "Distributed Systems" },
          { id: "computer_ai.data.scientific_computing", zh: "科学计算", en: "Scientific Computing" }
        ]
      }
    ]
  },
  {
    id: "engineering",
    zh: "工程技术",
    en: "Engineering",
    children: [
      {
        id: "engineering.information",
        zh: "电子与信息工程",
        en: "Electronic and Information Engineering",
        children: [
          { id: "engineering.information.communication", zh: "通信与网络", en: "Communication and Networking" },
          { id: "engineering.information.signal", zh: "信号处理", en: "Signal Processing" },
          { id: "engineering.information.microelectronics", zh: "微电子", en: "Microelectronics" },
          { id: "engineering.information.control", zh: "自动控制", en: "Automatic Control" }
        ]
      },
      {
        id: "engineering.mechanical",
        zh: "机械与制造",
        en: "Mechanical and Manufacturing",
        children: [
          { id: "engineering.mechanical.robotics", zh: "机器人", en: "Robotics" },
          { id: "engineering.mechanical.intelligent_manufacturing", zh: "智能制造", en: "Intelligent Manufacturing" },
          { id: "engineering.mechanical.thermal_fluids", zh: "热流体工程", en: "Thermal and Fluid Engineering" },
          { id: "engineering.mechanical.design", zh: "机械设计", en: "Mechanical Design" }
        ]
      },
      {
        id: "engineering.energy_environment",
        zh: "能源化工与环境工程",
        en: "Energy, Chemical, and Environmental Engineering",
        children: [
          { id: "engineering.energy_environment.process", zh: "过程系统工程", en: "Process Systems Engineering" },
          { id: "engineering.energy_environment.renewable", zh: "可再生能源", en: "Renewable Energy" },
          { id: "engineering.energy_environment.carbon", zh: "碳管理与减排", en: "Carbon Management and Mitigation" },
          { id: "engineering.energy_environment.water", zh: "水处理与环境修复", en: "Water Treatment and Remediation" }
        ]
      }
    ]
  },
  {
    id: "physics_math",
    zh: "物理与数学统计",
    en: "Physics, Mathematics, and Statistics",
    children: [
      {
        id: "physics_math.physics",
        zh: "物理学",
        en: "Physics",
        children: [
          { id: "physics_math.physics.condensed_matter", zh: "凝聚态物理", en: "Condensed Matter Physics" },
          { id: "physics_math.physics.optics", zh: "光学与光子学", en: "Optics and Photonics" },
          { id: "physics_math.physics.particle", zh: "粒子与核物理", en: "Particle and Nuclear Physics" },
          { id: "physics_math.physics.computational", zh: "计算物理", en: "Computational Physics" }
        ]
      },
      {
        id: "physics_math.math",
        zh: "数学与统计",
        en: "Mathematics and Statistics",
        children: [
          { id: "physics_math.math.applied_math", zh: "应用数学", en: "Applied Mathematics" },
          { id: "physics_math.math.statistics", zh: "统计学", en: "Statistics" },
          { id: "physics_math.math.optimization", zh: "优化方法", en: "Optimization" },
          { id: "physics_math.math.biostatistics", zh: "生物统计", en: "Biostatistics" }
        ]
      }
    ]
  },
  {
    id: "earth_environment",
    zh: "地球与环境科学",
    en: "Earth and Environmental Sciences",
    children: [
      {
        id: "earth_environment.earth",
        zh: "地球科学",
        en: "Earth Science",
        children: [
          { id: "earth_environment.earth.climate", zh: "气候变化", en: "Climate Change" },
          { id: "earth_environment.earth.remote_sensing", zh: "遥感与地理信息", en: "Remote Sensing and GIS" },
          { id: "earth_environment.earth.hydrology", zh: "水文学", en: "Hydrology" },
          { id: "earth_environment.earth.geology", zh: "地质过程", en: "Geological Processes" }
        ]
      },
      {
        id: "earth_environment.ecology",
        zh: "生态与保护",
        en: "Ecology and Conservation",
        children: [
          { id: "earth_environment.ecology.biodiversity", zh: "生物多样性保护", en: "Biodiversity Conservation" },
          { id: "earth_environment.ecology.restoration", zh: "生态修复", en: "Ecological Restoration" },
          { id: "earth_environment.ecology.pollution", zh: "污染生态学", en: "Pollution Ecology" },
          { id: "earth_environment.ecology.sustainability", zh: "可持续发展", en: "Sustainability" }
        ]
      }
    ]
  },
  {
    id: "economics_management",
    zh: "经济与管理",
    en: "Economics and Management",
    children: [
      {
        id: "economics_management.economics",
        zh: "经济学",
        en: "Economics",
        children: [
          { id: "economics_management.economics.agri_economics", zh: "农业经济", en: "Agricultural Economics" },
          { id: "economics_management.economics.innovation", zh: "创新经济", en: "Innovation Economics" },
          { id: "economics_management.economics.finance", zh: "金融与投资", en: "Finance and Investment" },
          { id: "economics_management.economics.policy", zh: "政策评估", en: "Policy Evaluation" }
        ]
      },
      {
        id: "economics_management.management",
        zh: "管理科学",
        en: "Management Science",
        children: [
          { id: "economics_management.management.operations", zh: "运营与供应链", en: "Operations and Supply Chain" },
          { id: "economics_management.management.project", zh: "项目管理", en: "Project Management" },
          { id: "economics_management.management.strategy", zh: "战略管理", en: "Strategic Management" },
          { id: "economics_management.management.digital", zh: "数字化管理", en: "Digital Management" }
        ]
      }
    ]
  },
  {
    id: "social_humanities",
    zh: "社会科学与人文",
    en: "Social Sciences and Humanities",
    children: [
      {
        id: "social_humanities.social",
        zh: "社会科学",
        en: "Social Sciences",
        children: [
          { id: "social_humanities.social.education", zh: "教育研究", en: "Education Research" },
          { id: "social_humanities.social.psychology", zh: "心理学", en: "Psychology" },
          { id: "social_humanities.social.sociology", zh: "社会学", en: "Sociology" },
          { id: "social_humanities.social.media", zh: "传播与媒体", en: "Communication and Media" }
        ]
      },
      {
        id: "social_humanities.humanities",
        zh: "人文与法政",
        en: "Humanities and Law/Policy",
        children: [
          { id: "social_humanities.humanities.law", zh: "法学", en: "Law" },
          { id: "social_humanities.humanities.policy", zh: "公共政策", en: "Public Policy" },
          { id: "social_humanities.humanities.history", zh: "历史与文化研究", en: "History and Cultural Studies" },
          { id: "social_humanities.humanities.linguistics", zh: "语言学", en: "Linguistics" }
        ]
      }
    ]
  },
  {
    id: "interdisciplinary",
    zh: "交叉前沿",
    en: "Interdisciplinary Frontiers",
    children: [
      {
        id: "interdisciplinary.aiforscience",
        zh: "AI for Science",
        en: "AI for Science",
        children: [
          { id: "interdisciplinary.aiforscience.digital_agriculture", zh: "数字农业", en: "Digital Agriculture" },
          { id: "interdisciplinary.aiforscience.synthetic_biology", zh: "合成生物学", en: "Synthetic Biology" },
          { id: "interdisciplinary.aiforscience.biomedical_engineering", zh: "生物医学工程", en: "Biomedical Engineering" },
          { id: "interdisciplinary.aiforscience.science_foundation_models", zh: "科学基础模型", en: "Scientific Foundation Models" }
        ]
      }
    ]
  }
] as const;
const QUICK_TOPIC_TAG_IDS = [
  "agri.crop_science.crop_breeding",
  "agri.crop_science.molecular_breeding",
  "agri.crop_science.genomic_selection",
  "agri.crop_science.germplasm",
  "agri.omics_bioinformatics.transcriptomics",
  "agri.omics_bioinformatics.multiomics",
  "agri.omics_bioinformatics.phenomics",
  "agri.plant_protection.disease_resistance"
] as const;
const RESEARCH_FIELD_LABELS = createResearchFieldLabels(RESEARCH_FIELD_TAXONOMY);
const PROVIDER_PRESETS: Record<ProviderPresetConfigKey, ProviderPresetConfig> = {
  qwen_dashscope: {
    provider: "openai-compatible",
    defaultModel: "qwen-plus",
    models: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-long", "qwen3-max"],
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 180
  },
  deepseek: {
    provider: "openai-compatible",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    baseUrl: "https://api.deepseek.com",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  moonshot_kimi: {
    provider: "openai-compatible",
    defaultModel: "kimi-latest-32k",
    models: ["kimi-latest-8k", "kimi-latest-32k", "kimi-latest-128k", "kimi-k2-0711-preview"],
    baseUrl: "https://api.moonshot.cn/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  zhipu_glm: {
    provider: "openai-compatible",
    defaultModel: "glm-4.5-flash",
    models: ["glm-4.5-flash", "glm-4.5-air", "glm-4.5", "glm-5.1"],
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  minimax: {
    provider: "openai-compatible",
    defaultModel: "MiniMax-M2.5",
    models: ["MiniMax-M2.5", "MiniMax-M2.5-Preview", "MiniMax-M1"],
    baseUrl: "https://api.minimaxi.com/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  tencent_hunyuan: {
    provider: "openai-compatible",
    defaultModel: "hunyuan-turbos-latest",
    models: ["hunyuan-lite", "hunyuan-turbos-latest", "hunyuan-t1-latest"],
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  baidu_qianfan: {
    provider: "openai-compatible",
    defaultModel: "ERNIE-4.5-Turbo-128K",
    models: ["ERNIE-4.5-Turbo-128K", "ERNIE-5.0", "ERNIE-X1.1"],
    baseUrl: "https://qianfan.baidubce.com/v2",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  stub_local: {
    provider: "stub",
    defaultModel: "stub-topic-distiller",
    models: ["stub-topic-distiller"],
    baseUrl: "",
    batchSize: 24,
    maxInFlight: 16,
    requestTimeoutSecs: 120
  }
} as const;

const translations: Record<Lang, Record<string, string>> = {
  zh: {
    eyebrow: "DISTILL STUDIO",
    hero_title: "QA小灶",
    hero_lede: "你生成QA，我们帮你建模型、服务社区。",
    lang_label: "语言",
    panel_title: "流水线输入",
    panel_copy: "左侧切换工作区，中间编辑当前设置，右侧查看结果和运行状态。",
    nav_title: "工作区",
    nav_copy: "像应用程序一样切换设置页。",
    actions_setup: "应用",
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
    tab_topic: "QA生成",
    tab_settings: "设置",
    tab_browse: "浏览QA",
    tab_topic_copy: "研究主题与领域标签",
    tab_settings_copy: "模型、输出与批处理参数",
    topic_tab_title: "QA生成",
    topic_tab_copy: "先写核心研究主题，再用标签补充学科领域、研究方向或语境。",
    settings_tab_title: "设置",
    settings_tab_copy: "模型、接口、输出和批处理参数。",
    settings_basic_copy: "普通用户通常只需要选择模型厂商、模型并填写 API 密钥。",
    settings_checklist_title: "首次配置提示",
    settings_checklist_copy: "这里仅检查能否开始使用的最小条件。填写后会自动保存在本机，无需手动保存。",
    settings_checklist_done: "已完成",
    settings_checklist_pending: "待补充",
    settings_checklist_provider: "模型厂商",
    settings_checklist_provider_ready: "当前已选择：{value}",
    settings_checklist_provider_pending: "请先选择一个可用的模型厂商或接入方式。",
    settings_checklist_model: "模型",
    settings_checklist_model_ready: "当前已选择：{value}",
    settings_checklist_model_pending: "请先选择模型，或填写自定义模型名。",
    settings_checklist_connection: "接口与鉴权",
    settings_checklist_connection_ready: "Base URL 与 API 密钥已就绪，设置会自动保存在本机。",
    settings_checklist_connection_not_required: "当前接入方式不需要额外填写 Base URL 或 API 密钥。",
    settings_checklist_connection_pending: "还需补充：{value}",
    settings_checklist_ready: "开始使用",
    settings_checklist_ready_done: "基础设置已完成。现在可以返回“QA生成”直接运行任务。",
    settings_checklist_ready_pending: "还不能直接运行，请先补齐：{value}",
    settings_checklist_missing_provider: "模型厂商",
    settings_checklist_missing_model: "模型",
    settings_checklist_missing_base_url: "Base URL",
    settings_checklist_missing_api_key: "API 密钥",
    run_readiness_title: "运行前检查",
    run_readiness_ready: "已就绪",
    run_readiness_pending: "待补充",
    run_readiness_ready_copy: "主题和基础配置已齐备，可以直接开始生成。",
    run_readiness_pending_copy: "当前还不能直接运行，请先补齐：{value}",
    run_readiness_open_settings: "去设置",
    run_readiness_missing_prompt: "研究主题",
    first_launch_title: "欢迎使用 QA小灶",
    first_launch_copy: "这是你第一次打开程序。当前版本只需要做一次最小配置，后续即可像普通桌面软件一样直接使用。",
    first_launch_step_settings_title: "1. 先完成一次模型设置",
    first_launch_step_settings_copy: "到“设置”页选择模型厂商、模型，并填写对应的 API 密钥。配置会自动保存在本机。",
    first_launch_step_topic_title: "2. 再填写研究主题并运行",
    first_launch_step_topic_copy: "回到“QA生成”，输入研究主题，按需补充领域标签，然后点击“运行”。",
    first_launch_step_browse_title: "3. 最后到浏览QA查看结果",
    first_launch_step_browse_copy: "生成完成后，可在“浏览QA”里查看历史任务、问题列表和单条 QA 详情。",
    first_launch_note_title: "补充说明",
    first_launch_note_copy: "当前第一档方案仍是客户端直连模型服务，所以首次使用需要你自己提供 API 密钥；但不需要安装 Rust、Node 或开发环境。",
    first_launch_open_settings: "去设置",
    first_launch_start_now: "我知道了",
    topic_quickstart_title: "快速开始",
    topic_quickstart_copy: "第一次使用时，只需要按下面三步完成最小配置。",
    topic_quickstart_step_topic: "填写研究主题",
    topic_quickstart_step_topic_ready: "主题已填写，可以继续补充标签或直接运行。",
    topic_quickstart_step_topic_pending: "先写一句清晰的研究主题，后续会自动转成 QA 任务。",
    topic_quickstart_step_settings: "完成模型设置",
    topic_quickstart_step_settings_ready: "模型与接口已就绪，程序会自动保存在本机。",
    topic_quickstart_step_settings_pending: "第一次使用请到设置页填写模型厂商、模型和 API 密钥。",
    topic_quickstart_step_run: "点击运行开始生成",
    topic_quickstart_step_run_ready: "现在可以直接点击“运行”，下方会实时显示日志与进度。",
    topic_quickstart_step_run_pending: "补齐前两步后，这里会变成可直接运行。",
    topic_quickstart_open_settings: "打开设置",
    browse_tab_title: "浏览QA",
    model_section_title: "模型配置",
    integration_section_title: "平台接口",
    runtime_section_title: "运行参数",
    advanced_settings_summary: "高级设置",
    advanced_settings_copy: "这里主要是平台接口和运行参数。普通用户一般保持默认即可。",
    run_status_title: "运行状态",
    run_logs_title: "运行日志",
    run_stats_title: "运行统计",
    action_export_logs: "导出日志",
    action_open_run_output_dir: "打开输出文件夹",
    field_help_button: "查看说明",
    runtime_constraint_hint_normal: "参数联动：Shard 大小不能超过目标数量，Batch 大小不能超过 Shard 大小。",
    runtime_constraint_hint_cot: "CoT 安全约束：目标数量不超过 100，Batch 大小固定为 1，最大并发固定为 1，Shard 大小不超过 10 且不超过目标数量。",
    run_locked_hint: "运行中参数已锁定；停止后才会接受新的修改。",
    browse_batches_title: "历史任务",
    browse_batches_empty: "还没有历史任务记录。",
    browse_questions_title: "QA问题列表",
    browse_questions_empty: "请先选择一个批次。",
    browse_detail_title: "QA详情",
    browse_detail_empty: "请选择一条 QA。",
    browse_questions_loading: "正在加载 QA 问题列表...",
    browse_detail_loading: "正在加载 QA 详情...",
    browse_back_batches: "返回批次",
    browse_back_questions: "返回问题列表",
    browse_prev: "上一页",
    browse_next: "下一页",
    browse_total_items: "总数",
    browse_kept_items: "保留",
    browse_generated_items: "已生成",
    browse_target_items: "目标",
    browse_updated_at: "更新时间",
    browse_task_status: "状态",
    browse_request_count: "请求数",
    browse_shard_progress: "分片进度",
    browse_history_count: "任务数",
    browse_status_completed: "已完成",
    browse_status_running: "进行中",
    browse_status_generated: "待打包",
    browse_status_prepared: "已准备",
    browse_subtopic: "子主题",
    browse_axis: "问题轴",
    browse_question_type: "问题类型",
    browse_difficulty: "难度",
    browse_audience: "受众",
    browse_provider: "Provider",
    browse_model: "模型",
    browse_batch_name: "批次",
    browse_output_dir: "输出目录",
    browse_prompt: "主题描述",
    browse_action_open: "浏览",
    browse_action_continue: "继续",
    browse_action_delete: "删除",
    browse_action_upload: "上传",
    browse_upload_url: "QA 上传地址",
    browse_upload_url_hint: "填写 QA 评测平台地址后，生成批次里的“上传”按钮会可用。",
    browse_upload_url_missing: "请先在设置里填写 QA 上传地址。",
    browse_delete_confirm: "确认删除这个生成批次及其全部 QA 吗？",
    browse_delete_success: "已删除生成批次。",
    browse_upload_success: "QA 批次上传成功。",
    browse_upload_failed: "上传失败",
    browse_question: "问题",
    browse_answer: "答案",
    browse_qa_mode: "QA类型",
    browse_source_type: "来源类型",
    browse_grounding: "依据",
    provider_preset: "模型厂商",
    provider_preset_hint: "选择厂商后会自动填入接入方式、模型列表和 Base URL；也可以切到自定义并手动填写。",
    config_profile: "配置档案",
    config_profile_hint: "保存和加载都会作用到这个本地档案名。适合保留多套运行参数。",
    topic_tags: "领域与方向",
    topic_tags_hint: "可以选农业生物育种快速标签，也可以通过弹窗选择二级或三级研究方向；选中的标签会拼接到实际发送给模型的主题描述里。",
    qa_mode: "QA类型",
    qa_mode_hint: "普通 QA 产出标准问答；CoT QA 产出更偏科研思路与分析决策的结构化回答。",
    qa_mode_normal: "普通QA",
    qa_mode_cot: "CoT QA",
    selected_tags: "已选标签",
    quick_tags: "农业生物育种快速标签",
    topic_field_selector: "选择研究领域",
    topic_field_selector_hint: "按基金申请或期刊审稿常见方式，选择二级或三级研究领域方向。",
    topic_field_modal_title: "选择研究领域",
    topic_field_modal_copy: "先选一级领域，再从右侧勾选二级或三级方向，可一次添加多个标签。",
    topic_field_primary_title: "一级领域",
    topic_field_detail_title: "二级 / 三级方向",
    topic_field_pending_title: "待添加标签",
    topic_field_add_selected: "添加所选标签",
    topic_field_cancel: "取消",
    topic_field_close: "关闭",
    topic_field_empty: "当前一级领域下还没有可选方向。",
    topic_field_selected_count: "已选 {count} 个",
    no_tags: "还没有添加标签。",
    custom_tag: "自定义标签",
    custom_tag_placeholder: "例如 作物育种、代谢调控、病害抗性",
    add_tag: "自定义标签",
    preset_custom: "自定义",
    preset_qwen_dashscope: "Qwen / DashScope",
    preset_deepseek: "DeepSeek",
    preset_moonshot_kimi: "Kimi / Moonshot",
    preset_zhipu_glm: "智谱 GLM",
    preset_minimax: "MiniMax",
    preset_tencent_hunyuan: "腾讯混元",
    preset_baidu_qianfan: "百度千帆",
    preset_stub_local: "Stub 本地测试",
    custom_model: "自定义模型",
    model_custom_option: "自定义模型...",
    topic_prompt: "主题描述",
    literature_api_url: "文献 API 地址",
    literature_api_auth: "文献 API 鉴权 Token",
    literature_api_auth_hint: "用于访问文献接口的鉴权信息，保存在本地设置中。",
    browse: "选择",
    provider: "接入方式",
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
    run_pipeline: "运行",
    stop_run: "停止",
    stop_requested: "停止中...",
    managed_run_mode: "任务模式",
    managed_run_mode_new: "新建任务",
    managed_run_mode_resume_latest: "继续当前任务",
    managed_run_mode_hint: "新建任务会创建新的输出目录；继续当前任务会复用最近一次同主题、同 QA 模式、同模型配置的任务目录，并接着已有 shard 继续跑。",
    managed_run_mode_exact_hint: "当前将继续指定历史任务：{value}",
    managed_run_mode_clear: "取消继续，改为新任务",
    managed_run_mode_pick_label: "选择历史任务",
    managed_run_mode_pick_placeholder: "选择一个历史任务继续",
    managed_run_mode_pick_empty: "暂无可继续的历史任务",
    managed_run_mode_pick_hint: "如果要精确接着某个旧任务继续生成，可以直接在这里选择。",
    log_resuming_latest_task: "已切换为继续当前任务模式，将优先复用最近一次匹配任务。",
    log_loaded_batch_task: "已载入历史任务，运行时将继续这个指定批次。",
    log_cleared_batch_task: "已取消指定历史任务续跑，后续运行将新建任务。",
    no_preview: "还没有预览结果。",
    no_run: "还没有运行记录。",
    waiting_events: "等待流水线事件...",
    status_idle: "空闲",
    status_previewing: "预览中",
    status_running: "运行中",
    status_stopping: "停止中",
    status_updating: "更新中",
    preview_generating: "正在生成预览...",
    running_pipeline: "正在运行流水线...",
    stats_elapsed: "已运行",
    stats_avg_speed: "平均速度",
    stats_current_speed: "当前速度",
    stats_eta: "预计剩余",
    stats_generated_progress: "生成进度",
    stats_request_progress: "请求进度",
    stats_shard_progress: "分片进度",
    stats_retry_count: "重试次数",
    stats_failed_requests: "失败请求",
    stats_success_rate: "请求成功率",
    stats_idle: "等待运行",
    stats_not_available: "暂无",
    output_mode_cancelled: "已停止",
    validation_failed: "运行前检查未通过",
    preview_failed: "预览失败",
    pipeline_failed: "流水线失败",
    pipeline_cancelled: "流水线已停止",
    log_request_submitted: "已从 GUI 提交流水线请求。",
    log_stop_requested: "已请求停止运行，正在等待当前请求收尾。",
    log_stop_not_running: "当前没有正在运行的任务。",
    log_stop_failed: "停止运行失败",
    log_pipeline_cancelled: "流水线已按请求停止。",
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
    log_stub_migrated: "检测到旧版 Stub 配置，已自动切换到 Qwen / DashScope，请填写真实 API 密钥后测试。",
    log_cot_runtime_normalized: "检测到旧版 CoT 运行参数，已自动调整为单条安全模式。",
    log_pipeline_completed: "流水线完成，数据集输出到",
    log_exported_logs: "已导出运行日志到",
    log_export_failed: "导出运行日志失败",
    log_export_empty: "当前还没有可导出的运行日志。",
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
    validation_issue_model_required: "模型名称不能为空。",
    validation_issue_base_url_required: "使用 openai-compatible 时必须填写 Base URL。",
    validation_issue_api_key_required: "使用 openai-compatible 时必须填写 API 密钥。",
    validation_issue_target_count_invalid: "目标数量必须是大于 0 的整数。",
    validation_issue_plan_limit_invalid: "规划上限必须是大于 0 的整数。",
    validation_issue_shard_size_invalid: "Shard 大小必须是大于 0 的整数。",
    validation_issue_batch_size_invalid: "Batch 大小必须是大于 0 的整数。",
    validation_issue_max_in_flight_invalid: "最大并发必须是大于 0 的整数。",
    validation_issue_max_retries_invalid: "最大重试必须是大于等于 0 的整数。",
    validation_issue_timeout_invalid: "超时秒数必须是大于 0 的整数。",
    stage_bootstrap: "初始化",
    stage_plan: "规划",
    stage_literature: "文献增强",
    stage_write_config: "写配置",
    stage_generate: "生成",
    stage_pack: "打包",
    stage_complete: "完成",
    event_running: "进行中",
    event_completed: "已完成",
    event_cancelled: "已停止",
    cot_section_workflow_summary: "研究流程概述",
    cot_section_reference_milestones: "参考里程碑",
    cot_section_reference_steps: "参考步骤",
    cot_section_step_rationale: "步骤依据",
    cot_section_decision_points: "关键决策点",
    cot_section_quality_checks: "质量检查",
    cot_section_failure_modes: "失败模式",
    cot_section_final_interpretation: "最终解释",
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
    hero_lede: "You create QA. We help turn it into models and community-facing services.",
    lang_label: "Language",
    panel_title: "Pipeline Input",
    panel_copy: "Switch workspaces on the left, edit the current page in the center, inspect results on the right.",
    nav_title: "Workspace",
    nav_copy: "Switch settings pages like a desktop app.",
    actions_setup: "App",
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
    tab_topic: "QA Generation",
    tab_settings: "Settings",
    tab_browse: "Browse QA",
    tab_topic_copy: "Research topic and domain tags",
    tab_settings_copy: "Model, output, and batch parameters",
    topic_tab_title: "QA Generation",
    topic_tab_copy: "Write the core research theme first, then use tags to add domains, directions, or context.",
    settings_tab_title: "Settings",
    settings_tab_copy: "Model, endpoint, output, and batch settings.",
    settings_basic_copy: "Most users only need a provider, a model, and an API key.",
    settings_checklist_title: "First-Time Setup",
    settings_checklist_copy: "This checks only the minimum needed to get started. Values are saved automatically on this device.",
    settings_checklist_done: "Done",
    settings_checklist_pending: "Pending",
    settings_checklist_provider: "Provider",
    settings_checklist_provider_ready: "Selected: {value}",
    settings_checklist_provider_pending: "Choose a model provider or a compatible adapter first.",
    settings_checklist_model: "Model",
    settings_checklist_model_ready: "Selected: {value}",
    settings_checklist_model_pending: "Choose a model, or enter a custom model name.",
    settings_checklist_connection: "Endpoint and Auth",
    settings_checklist_connection_ready: "Base URL and API key are ready. The settings are saved locally automatically.",
    settings_checklist_connection_not_required: "This adapter does not require a Base URL or API key.",
    settings_checklist_connection_pending: "Still needed: {value}",
    settings_checklist_ready: "Ready to Use",
    settings_checklist_ready_done: "The basic setup is ready. You can return to QA Generation and run a task now.",
    settings_checklist_ready_pending: "The app is not ready to run yet. Please complete: {value}",
    settings_checklist_missing_provider: "provider",
    settings_checklist_missing_model: "model",
    settings_checklist_missing_base_url: "Base URL",
    settings_checklist_missing_api_key: "API key",
    run_readiness_title: "Pre-Run Check",
    run_readiness_ready: "Ready",
    run_readiness_pending: "Pending",
    run_readiness_ready_copy: "The topic and the basic configuration are ready. You can start generation now.",
    run_readiness_pending_copy: "The app is not ready to run yet. Please complete: {value}",
    run_readiness_open_settings: "Open Settings",
    run_readiness_missing_prompt: "topic",
    first_launch_title: "Welcome to QA小灶",
    first_launch_copy: "This is your first time opening the app. In the current version, you only need one minimal setup, then you can use it like a normal desktop app.",
    first_launch_step_settings_title: "1. Finish model setup once",
    first_launch_step_settings_copy: "Open Settings, choose a provider and model, and fill in the API key. The app will save it locally automatically.",
    first_launch_step_topic_title: "2. Enter a research topic and run",
    first_launch_step_topic_copy: "Return to QA Generation, enter the topic, add domain tags if needed, and click Run.",
    first_launch_step_browse_title: "3. Browse the generated QA",
    first_launch_step_browse_copy: "After generation finishes, open Browse QA to review run history, question lists, and single QA details.",
    first_launch_note_title: "Note",
    first_launch_note_copy: "The current first-tier design still connects directly to the model provider, so first-time use requires your own API key, but no Rust, Node, or developer tools are needed.",
    first_launch_open_settings: "Open Settings",
    first_launch_start_now: "Got It",
    topic_quickstart_title: "Quick Start",
    topic_quickstart_copy: "For first-time use, you only need these three steps to get started.",
    topic_quickstart_step_topic: "Enter a research topic",
    topic_quickstart_step_topic_ready: "The topic is ready. You can add tags or run directly.",
    topic_quickstart_step_topic_pending: "Start with one clear research topic. The app will turn it into a QA task.",
    topic_quickstart_step_settings: "Finish model setup",
    topic_quickstart_step_settings_ready: "The model endpoint is ready, and the app saves it locally automatically.",
    topic_quickstart_step_settings_pending: "For first-time use, open Settings and fill in the provider, model, and API key.",
    topic_quickstart_step_run: "Click Run to start generation",
    topic_quickstart_step_run_ready: "You can click Run now. Logs and progress will appear below in real time.",
    topic_quickstart_step_run_pending: "Once the first two steps are done, this will become ready to run.",
    topic_quickstart_open_settings: "Open Settings",
    browse_tab_title: "Browse QA",
    model_section_title: "Model Configuration",
    integration_section_title: "Platform Integrations",
    runtime_section_title: "Runtime Parameters",
    advanced_settings_summary: "Advanced Settings",
    advanced_settings_copy: "These fields are mainly for integrations and runtime tuning. Most users can keep the defaults.",
    run_status_title: "Run Status",
    run_logs_title: "Run Logs",
    run_stats_title: "Run Stats",
    action_export_logs: "Export Logs",
    action_open_run_output_dir: "Open Output Folder",
    field_help_button: "Show details",
    runtime_constraint_hint_normal: "Linked constraints: shard size cannot exceed target count, and batch size cannot exceed shard size.",
    runtime_constraint_hint_cot: "CoT safety constraints: target count is capped at 100, batch size is fixed at 1, max in flight is fixed at 1, and shard size cannot exceed 10 or the target count.",
    run_locked_hint: "Run parameters are locked while the pipeline is active. Stop the run before changing them.",
    browse_batches_title: "Run History",
    browse_batches_empty: "No historical runs yet.",
    browse_questions_title: "QA Question List",
    browse_questions_empty: "Select a batch first.",
    browse_detail_title: "QA Detail",
    browse_detail_empty: "Select a QA item.",
    browse_questions_loading: "Loading QA questions...",
    browse_detail_loading: "Loading QA detail...",
    browse_back_batches: "Back to Batches",
    browse_back_questions: "Back to Questions",
    browse_prev: "Previous",
    browse_next: "Next",
    browse_total_items: "Total",
    browse_kept_items: "Kept",
    browse_generated_items: "Generated",
    browse_target_items: "Target",
    browse_updated_at: "Updated",
    browse_task_status: "Status",
    browse_request_count: "Requests",
    browse_shard_progress: "Shard Progress",
    browse_history_count: "Runs",
    browse_status_completed: "Completed",
    browse_status_running: "Running",
    browse_status_generated: "Awaiting Pack",
    browse_status_prepared: "Prepared",
    browse_subtopic: "Subtopic",
    browse_axis: "Axis",
    browse_question_type: "Question Type",
    browse_difficulty: "Difficulty",
    browse_audience: "Audience",
    browse_provider: "Provider",
    browse_model: "Model",
    browse_batch_name: "Batch",
    browse_output_dir: "Output Directory",
    browse_prompt: "Topic Prompt",
    browse_action_open: "Browse",
    browse_action_continue: "Continue",
    browse_action_delete: "Delete",
    browse_action_upload: "Upload",
    browse_upload_url: "QA Upload URL",
    browse_upload_url_hint: "Set the QA evaluation platform URL to enable batch upload.",
    browse_upload_url_missing: "Set the QA upload URL in Settings first.",
    browse_delete_confirm: "Delete this batch and all of its QA items?",
    browse_delete_success: "Batch deleted.",
    browse_upload_success: "QA batch uploaded.",
    browse_upload_failed: "Upload failed",
    browse_question: "Question",
    browse_answer: "Answer",
    browse_qa_mode: "QA Mode",
    browse_source_type: "Source Type",
    browse_grounding: "Grounding",
    provider_preset: "Model Provider",
    provider_preset_hint: "Selecting a provider fills the adapter type, model list, and base URL. Switch to Custom if you need a private gateway or manual values.",
    config_profile: "Config Profile",
    config_profile_hint: "Load and save both target this local profile name. Use it to keep multiple run setups.",
    topic_tags: "Domains and Directions",
    topic_tags_hint: "Use the agriculture and breeding quick tags, or open the selector to add level-2 or level-3 research fields. Selected tags are appended to the effective prompt.",
    qa_mode: "QA Mode",
    qa_mode_hint: "Normal QA generates standard question-answer pairs. CoT QA generates compact research-planning and decision-oriented answers.",
    qa_mode_normal: "Normal QA",
    qa_mode_cot: "CoT QA",
    selected_tags: "Selected Tags",
    quick_tags: "Agriculture and Breeding Quick Tags",
    topic_field_selector: "Choose Research Field",
    topic_field_selector_hint: "Pick level-2 or level-3 fields similar to grant applications or reviewer forms.",
    topic_field_modal_title: "Choose Research Field",
    topic_field_modal_copy: "Start with a primary domain, then select level-2 or level-3 directions on the right. You can add multiple tags at once.",
    topic_field_primary_title: "Primary Domain",
    topic_field_detail_title: "Level-2 / Level-3 Directions",
    topic_field_pending_title: "Pending Tags",
    topic_field_add_selected: "Add Selected Tags",
    topic_field_cancel: "Cancel",
    topic_field_close: "Close",
    topic_field_empty: "No selectable directions in this primary domain.",
    topic_field_selected_count: "{count} selected",
    no_tags: "No tags added yet.",
    custom_tag: "Custom Tag",
    custom_tag_placeholder: "For example: crop breeding, metabolic regulation, disease resistance",
    add_tag: "Custom Tag",
    preset_custom: "Custom",
    preset_qwen_dashscope: "Qwen / DashScope",
    preset_deepseek: "DeepSeek",
    preset_moonshot_kimi: "Kimi / Moonshot",
    preset_zhipu_glm: "Zhipu GLM",
    preset_minimax: "MiniMax",
    preset_tencent_hunyuan: "Tencent Hunyuan",
    preset_baidu_qianfan: "Baidu Qianfan",
    preset_stub_local: "Stub Local Test",
    custom_model: "Custom Model",
    model_custom_option: "Custom model...",
    topic_prompt: "Topic Prompt",
    literature_api_url: "Literature API URL",
    literature_api_auth: "Literature API Auth Token",
    literature_api_auth_hint: "Authentication token for the literature API, stored in local settings.",
    browse: "Browse",
    provider: "Adapter Type",
    model: "Model",
    base_url: "Base URL",
    api_key: "API Key",
    api_key_hint: "The key is stored in the local config profile and hidden by default in the UI.",
    qa_upload_url_hint: "The key is stored in the local config profile and hidden by default in the UI.",
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
    run_pipeline: "Run",
    stop_run: "Stop",
    stop_requested: "Stopping...",
    managed_run_mode: "Run Mode",
    managed_run_mode_new: "New Run",
    managed_run_mode_resume_latest: "Continue Current Run",
    managed_run_mode_hint: "New Run creates a fresh output directory. Continue Current Run reuses the most recent matching task directory with the same topic, QA mode, and model configuration, then resumes from existing shards.",
    managed_run_mode_exact_hint: "Currently continuing this saved task: {value}",
    managed_run_mode_clear: "Cancel and Start New Run",
    managed_run_mode_pick_label: "Pick History Run",
    managed_run_mode_pick_placeholder: "Choose a historical run to continue",
    managed_run_mode_pick_empty: "No resumable historical runs yet",
    managed_run_mode_pick_hint: "Use this when you want to continue one exact historical run instead of only the latest match.",
    log_resuming_latest_task: "Switched to continue-current-run mode. The app will try to reuse the latest matching task.",
    log_loaded_batch_task: "Loaded a historical task. Running will continue this exact batch.",
    log_cleared_batch_task: "Cleared the specific historical resume target. Future runs will create a new task.",
    no_preview: "No preview yet.",
    no_run: "No run yet.",
    waiting_events: "Waiting for pipeline events...",
    status_idle: "Idle",
    status_previewing: "Previewing",
    status_running: "Running",
    status_stopping: "Stopping",
    status_updating: "Updating",
    preview_generating: "Generating preview...",
    running_pipeline: "Running pipeline...",
    stats_elapsed: "Elapsed",
    stats_avg_speed: "Average Speed",
    stats_current_speed: "Current Speed",
    stats_eta: "ETA",
    stats_generated_progress: "Generated",
    stats_request_progress: "Requests",
    stats_shard_progress: "Shards",
    stats_retry_count: "Retries",
    stats_failed_requests: "Failed Requests",
    stats_success_rate: "Request Success Rate",
    stats_idle: "Waiting to run",
    stats_not_available: "N/A",
    output_mode_cancelled: "Stopped",
    validation_failed: "Run validation failed",
    preview_failed: "Preview failed",
    pipeline_failed: "Pipeline failed",
    pipeline_cancelled: "Pipeline stopped",
    log_request_submitted: "Pipeline request submitted from GUI.",
    log_stop_requested: "Stop requested. Waiting for the current request to settle.",
    log_stop_not_running: "No pipeline is currently running.",
    log_stop_failed: "Failed to stop pipeline",
    log_pipeline_cancelled: "Pipeline stopped on request.",
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
    log_stub_migrated: "Legacy Stub config detected. Switched to Qwen / DashScope. Add a real API key before testing.",
    log_cot_runtime_normalized: "Legacy CoT runtime settings detected. Switched to safe single-item mode.",
    log_pipeline_completed: "Pipeline completed. Dataset at",
    log_exported_logs: "Exported run logs to",
    log_export_failed: "Failed to export run logs",
    log_export_empty: "There are no run logs to export yet.",
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
    validation_issue_model_required: "Model name is required.",
    validation_issue_base_url_required: "Base URL is required for openai-compatible provider.",
    validation_issue_api_key_required: "API key is required for openai-compatible provider.",
    validation_issue_target_count_invalid: "Target count must be an integer greater than 0.",
    validation_issue_plan_limit_invalid: "Plan limit must be an integer greater than 0.",
    validation_issue_shard_size_invalid: "Shard size must be an integer greater than 0.",
    validation_issue_batch_size_invalid: "Batch size must be an integer greater than 0.",
    validation_issue_max_in_flight_invalid: "Max in flight must be an integer greater than 0.",
    validation_issue_max_retries_invalid: "Max retries must be an integer greater than or equal to 0.",
    validation_issue_timeout_invalid: "Timeout secs must be an integer greater than 0.",
    stage_bootstrap: "Bootstrap",
    stage_plan: "Plan",
    stage_literature: "Literature",
    stage_write_config: "Write Config",
    stage_generate: "Generate",
    stage_pack: "Pack",
    stage_complete: "Complete",
    event_running: "running",
    event_completed: "completed",
    event_cancelled: "cancelled",
    cot_section_workflow_summary: "Workflow Summary",
    cot_section_reference_milestones: "Reference Milestones",
    cot_section_reference_steps: "Reference Steps",
    cot_section_step_rationale: "Step Rationale",
    cot_section_decision_points: "Decision Points",
    cot_section_quality_checks: "Quality Checks",
    cot_section_failure_modes: "Failure Modes",
    cot_section_final_interpretation: "Final Interpretation",
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
let currentStatus: "idle" | "previewing" | "running" | "stopping" | "updating" = "idle";
let outputState: OutputState = { kind: "idle" };
let topicTags: string[] = [];
let topicFieldModalPrimaryId = RESEARCH_FIELD_TAXONOMY[0]?.id ?? null;
let pendingTopicFieldTags: string[] = [];
let apiKeyVisible = false;
let autoSaveTimer: number | null = null;
let autoSaveEnabled = false;
let lastPipelineProgressEvent: PipelineProgressEvent | null = null;
let browseBatches: QaBatchSummary[] = [];
let browsePageData: QaRecordPage | null = null;
let browseDetailData: QaRecordDetail | null = null;
let browseSelectedBatchId: string | null = null;
let browseLoading = false;
let browseView: BrowseView = "batches";
let browseQuestionsLoading = false;
let browseDetailLoading = false;
let browseErrorMessage: string | null = null;
let managedResumeBatchId: string | null = null;
let managedResumeBatchLabel: string | null = null;
let runStatsTimer: number | null = null;
let runStats: RunStatsSnapshot = {
  startedAtMs: null,
  lastUpdatedAtMs: null,
  generatedCount: 0,
  targetCount: null,
  shardIndex: null,
  shardCount: null,
  completedBatchCount: 0,
  estimatedBatchCount: null,
  completedShardCount: 0,
  skippedShardCount: 0,
  retryCount: 0,
  failedBatchCount: 0,
  samples: []
};

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
        <div class="tabs" id="tabs">
          <button class="tab-button" type="button" data-tab="topic" id="tab-topic">
            <span class="tab-button-title" id="tab-topic-label">Topic</span>
          </button>
          <button class="tab-button" type="button" data-tab="browse" id="tab-browse">
            <span class="tab-button-title" id="tab-browse-label">Browse QA</span>
          </button>
          <button class="tab-button" type="button" data-tab="settings" id="tab-settings">
            <span class="tab-button-title" id="tab-settings-label">Settings</span>
          </button>
          <button class="tab-button tab-button-plain" type="button" id="check-update">
            <span class="tab-button-title" id="check-update-label">Check Update</span>
          </button>
        </div>
      </aside>
      <section class="stage panel">
        <div class="run-lock-banner" id="run-lock-banner" hidden>Run parameters are locked while the pipeline is active. Stop the run before changing them.</div>
        <section class="tab-panel" data-tab-panel="topic">
        <div class="tab-copy-block">
          <p class="panel-title" id="topic-tab-title">Research Topic</p>
        </div>
        <section class="topic-quickstart" id="topic-quickstart"></section>
        <label for="prompt" id="topic-prompt-label">Topic prompt</label>
        <textarea id="prompt" rows="7">Soybean seed oil and protein improvement under planting density and breeding strategy.</textarea>
        <div class="mode-panel">
          <div>
            <p class="tag-title" id="qa-mode-label">QA Mode</p>
            <p class="panel-copy" id="qa-mode-hint">
              Normal QA generates standard question-answer pairs. CoT QA generates compact research-planning and decision-oriented answers.
            </p>
          </div>
          <div class="radio-group" id="qa-mode-group">
            <label class="radio-card">
              <input id="qa-mode-normal" type="radio" name="qa-mode" value="normal" checked />
              <span id="qa-mode-normal-label">Normal QA</span>
            </label>
            <label class="radio-card">
              <input id="qa-mode-cot" type="radio" name="qa-mode" value="cot" />
              <span id="qa-mode-cot-label">CoT QA</span>
            </label>
          </div>
        </div>
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
          <div class="quick-tag-block">
            <div class="tag-subtitle-row">
              <p class="tag-subtitle" id="quick-tags-label">Agriculture and Breeding Quick Tags</p>
              <button id="open-topic-field-selector" type="button">Choose Research Field</button>
            </div>
            <p class="field-hint" id="topic-field-selector-hint">
              Pick level-2 or level-3 fields similar to grant applications or reviewer forms.
            </p>
            <div class="tag-list suggestions" id="topic-tag-suggestions"></div>
          </div>
          <div class="inline-field">
            <input id="topic-tag-input" placeholder="For example: crop breeding, metabolic regulation, disease resistance" />
            <button id="add-topic-tag" type="button">Custom Tag</button>
          </div>
        </div>
        <div class="modal-shell" id="topic-field-modal" hidden>
          <div class="modal-backdrop" data-modal-close="true"></div>
          <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="topic-field-modal-title">
            <div class="modal-header">
              <div>
                <p class="panel-title" id="topic-field-modal-title">Choose Research Field</p>
                <p class="panel-copy" id="topic-field-modal-copy">
                  Start with a primary domain, then select level-2 or level-3 directions on the right. You can add multiple tags at once.
                </p>
              </div>
              <button id="close-topic-field-modal" type="button">Close</button>
            </div>
            <div class="field-selector-layout">
              <section class="field-selector-primary">
                <p class="field-selector-label" id="topic-field-primary-title">Primary Domain</p>
                <div class="field-selector-primary-list" id="topic-field-primary-list"></div>
              </section>
              <section class="field-selector-detail">
                <div class="field-selector-section">
                  <div class="field-selector-heading">
                    <p class="field-selector-label" id="topic-field-detail-title">Level-2 / Level-3 Directions</p>
                    <p class="field-selector-meta" id="topic-field-selected-count">0 selected</p>
                  </div>
                  <div class="field-selector-detail-list" id="topic-field-detail-list"></div>
                </div>
                <div class="field-selector-section">
                  <p class="field-selector-label" id="topic-field-pending-title">Pending Tags</p>
                  <div class="tag-list selected" id="topic-field-pending-list"></div>
                </div>
              </section>
            </div>
            <div class="modal-actions">
              <button id="cancel-topic-field-selection" type="button">Cancel</button>
              <button id="confirm-topic-field-selection" class="secondary" type="button">Add Selected Tags</button>
            </div>
          </div>
        </div>
        <section class="topic-run-panel">
          <section class="run-readiness-banner" id="run-readiness-banner"></section>
          <div class="topic-run-actions">
            <button id="run" class="secondary run-primary" type="button">Run pipeline</button>
            <button id="open-run-output-dir" type="button" disabled>Open Output Folder</button>
          </div>
          <div class="run-mode-block">
            <p class="field-label-inline" id="managed-run-mode-label">Run Mode</p>
            <div class="radio-group">
              <label class="radio-card">
                <input id="managed-run-mode-new" type="radio" name="managed-run-mode" value="new" checked />
                <span id="managed-run-mode-new-label">New Run</span>
              </label>
              <label class="radio-card">
                <input id="managed-run-mode-resume-latest" type="radio" name="managed-run-mode" value="resume-latest" />
                <span id="managed-run-mode-resume-latest-label">Continue Current Run</span>
              </label>
            </div>
            <p class="field-hint" id="managed-run-mode-hint"></p>
            <label class="managed-run-picker">
              <span id="managed-run-pick-label">Pick History Run</span>
              <select id="managed-run-pick"></select>
              <small class="field-hint" id="managed-run-pick-hint"></small>
            </label>
            <div class="managed-run-banner" id="managed-run-banner" hidden>
              <p class="field-hint managed-run-banner-copy" id="managed-run-mode-current"></p>
              <button id="clear-managed-resume-batch" type="button">Start as New Run</button>
            </div>
          </div>
          <section class="run-stats-panel">
            <div class="panel-header">
              <p class="panel-title run-stats-title" id="run-stats-title">Run Stats</p>
            </div>
            <div class="run-stats-grid" id="run-stats-grid"></div>
          </section>
          <section class="topic-log-panel">
            <div class="panel-header">
              <p class="panel-title run-status-title" id="run-logs-title">Run Logs</p>
              <div class="panel-header-actions">
                <button id="export-logs" class="secondary" type="button">Export Logs</button>
                <div class="progress-summary">
                  <div class="progress-meta" id="progress-meta">0 / 5</div>
                  <div class="progress-detail" id="progress-detail"></div>
                </div>
              </div>
            </div>
            <div class="progress-track">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
            <pre id="logs">No run yet.</pre>
          </section>
        </section>
      </section>
      <section class="tab-panel" data-tab-panel="settings" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="settings-tab-title">Settings</p>
          <p class="panel-copy" id="settings-basic-copy">Most users only need to choose a provider, model, and API key.</p>
        </div>
        <section class="setup-checklist" id="setup-checklist"></section>
        <div class="section-block">
          <p class="section-title" id="model-section-title">Model Configuration</p>
        </div>
        <div class="grid three">
          <label>
            <div class="field-label-row">
              <span id="provider-preset-label">Model Provider</span>
              <button class="field-help-button" data-help-key="provider_preset" type="button">?</button>
            </div>
            <select id="provider-preset">
              <option id="provider-preset-option-custom" value="custom">Custom</option>
              <option id="provider-preset-option-qwen" value="qwen_dashscope">Qwen / DashScope</option>
              <option id="provider-preset-option-deepseek" value="deepseek">DeepSeek</option>
              <option id="provider-preset-option-moonshot" value="moonshot_kimi">Kimi / Moonshot</option>
              <option id="provider-preset-option-zhipu" value="zhipu_glm">Zhipu GLM</option>
              <option id="provider-preset-option-minimax" value="minimax">MiniMax</option>
              <option id="provider-preset-option-hunyuan" value="tencent_hunyuan">Tencent Hunyuan</option>
              <option id="provider-preset-option-qianfan" value="baidu_qianfan">Baidu Qianfan</option>
              <option id="provider-preset-option-stub" value="stub_local" hidden>Stub Local Test</option>
            </select>
            <small class="field-hint" id="provider-preset-hint">
              Selecting a provider fills the adapter type, model list, and base URL. Switch to Custom if you need a private gateway or manual values.
            </small>
          </label>
          <label id="provider-field" hidden>
            <div class="field-label-row">
              <span id="provider-label">Adapter Type</span>
            </div>
            <select id="provider">
              <option value="openai-compatible" selected>openai-compatible</option>
              <option value="stub" hidden>stub</option>
            </select>
          </label>
          <label>
            <div class="field-label-row">
              <span id="model-label">Model</span>
              <button class="field-help-button" data-help-key="model" type="button">?</button>
            </div>
            <select id="model"></select>
          </label>
          <label id="custom-model-field" hidden>
            <div class="field-label-row">
              <span id="custom-model-label">Custom Model</span>
            </div>
            <input id="custom-model" placeholder="例如 glm-5.1" />
          </label>
        </div>
        <div class="grid two">
          <label>
            <div class="field-label-row">
              <span id="base-url-label">Base URL</span>
              <button class="field-help-button" data-help-key="base_url" type="button">?</button>
            </div>
            <input id="base-url" placeholder="https://api.openai.com/v1" />
          </label>
          <label>
            <div class="field-label-row">
              <span id="api-key-label">API key</span>
              <button class="field-help-button" data-help-key="api_key" type="button">?</button>
            </div>
            <div class="inline-field">
              <input id="api-key" type="password" />
              <button id="toggle-api-key-visibility" type="button">Show</button>
            </div>
            <small class="field-hint" id="api-key-hint">
              The key is stored in the local config profile and hidden by default in the UI.
            </small>
          </label>
        </div>
        <details class="advanced-settings" id="advanced-settings">
          <summary id="advanced-settings-summary">Advanced Settings</summary>
          <p class="panel-copy advanced-settings-copy" id="advanced-settings-copy">
            Ordinary users can usually keep the defaults here.
          </p>
          <div class="section-block">
            <p class="section-title" id="integration-section-title">Platform Integrations</p>
          </div>
          <div class="grid two">
            <label>
              <div class="field-label-row">
                <span id="qa-upload-url-label">QA Upload URL</span>
                <button class="field-help-button" data-help-key="qa_upload_url" type="button">?</button>
              </div>
              <input id="qa-upload-url" placeholder="https://example.com/qa/import" />
              <small class="field-hint" id="qa-upload-url-hint">
                Set the QA evaluation platform URL to enable batch upload.
              </small>
            </label>
          </div>
          <div class="grid two">
            <label>
              <div class="field-label-row">
                <span id="literature-api-url-label">Literature API URL</span>
                <button class="field-help-button" data-help-key="literature_api_url" type="button">?</button>
              </div>
              <input id="literature-api-url" placeholder="https://example.com/literature/api" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="literature-api-auth-label">Literature API Auth Token</span>
                <button class="field-help-button" data-help-key="literature_api_auth" type="button">?</button>
              </div>
              <input id="literature-api-auth" type="password" />
              <small class="field-hint" id="literature-api-auth-hint">
                Authentication token for the literature API, stored in local settings.
              </small>
            </label>
          </div>
          <div class="section-block">
            <p class="section-title" id="runtime-section-title">Runtime Parameters</p>
            <p class="field-hint runtime-constraint-hint" id="runtime-constraint-hint"></p>
          </div>
          <div class="grid four">
            <label>
              <div class="field-label-row">
                <span id="target-count-label">Target count</span>
                <button class="field-help-button" data-help-key="target_count" type="button">?</button>
              </div>
              <input id="target-count" type="number" value="10000" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="plan-limit-label">Plan limit</span>
                <button class="field-help-button" data-help-key="plan_limit" type="button">?</button>
              </div>
              <input id="plan-limit" type="number" value="1200" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="shard-size-label">Shard size</span>
                <button class="field-help-button" data-help-key="shard_size" type="button">?</button>
              </div>
              <input id="shard-size" type="number" value="1000" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="batch-size-label">Batch size</span>
                <button class="field-help-button" data-help-key="batch_size" type="button">?</button>
              </div>
              <input id="batch-size" type="number" value="8" />
            </label>
          </div>
          <div class="grid four">
            <label>
              <div class="field-label-row">
                <span id="max-in-flight-label">Max in flight</span>
                <button class="field-help-button" data-help-key="max_in_flight" type="button">?</button>
              </div>
              <input id="max-in-flight" type="number" value="4" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="max-retries-label">Max retries</span>
                <button class="field-help-button" data-help-key="max_retries" type="button">?</button>
              </div>
              <input id="max-retries" type="number" value="3" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="timeout-secs-label">Timeout secs</span>
                <button class="field-help-button" data-help-key="timeout_secs" type="button">?</button>
              </div>
              <input id="request-timeout-secs" type="number" value="180" />
            </label>
            <label class="toggle">
              <div class="field-label-row">
                <span id="resume-existing-label">Resume existing shards</span>
                <button class="field-help-button" data-help-key="resume_existing" type="button">?</button>
              </div>
              <input id="resume" type="checkbox" checked />
            </label>
          </div>
        </details>
      </section>
      <section class="tab-panel" data-tab-panel="browse" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="browse-tab-title">Browse QA</p>
        </div>
        <section class="browse-shell browse-panel">
          <div class="browse-header">
            <button class="browse-back-button" id="browse-back" type="button" hidden>Back</button>
            <div class="browse-header-copy">
              <p class="panel-title browse-panel-title" id="browse-view-title">Batch Runs</p>
              <p class="panel-copy browse-view-meta" id="browse-view-meta"></p>
            </div>
          </div>
          <div id="browse-content"></div>
        </section>
      </section>
      <aside class="inspector" hidden>
        <section class="panel result-panel">
          <div class="result-header">
            <div>
              <p class="panel-title" id="result-title">Current Result</p>
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
      </aside>
    </section>
    <div class="modal-shell" id="first-launch-modal" hidden>
      <div class="modal-backdrop" data-first-launch-close="true"></div>
      <div class="modal-panel first-launch-panel" role="dialog" aria-modal="true" aria-labelledby="first-launch-title">
        <div class="modal-header">
          <div>
            <p class="panel-title" id="first-launch-title">Welcome to QA小灶</p>
            <p class="panel-copy" id="first-launch-copy"></p>
          </div>
        </div>
        <div class="first-launch-grid" id="first-launch-grid"></div>
        <section class="first-launch-note">
          <p class="section-title" id="first-launch-note-title">Note</p>
          <p class="panel-copy first-launch-note-copy" id="first-launch-note-copy"></p>
        </section>
        <div class="modal-actions">
          <button id="first-launch-open-settings" class="secondary" type="button">Open Settings</button>
          <button id="first-launch-confirm" type="button">Got It</button>
        </div>
      </div>
    </div>
  </main>
`;

const promptInput = document.querySelector<HTMLTextAreaElement>("#prompt");
const langSelect = document.querySelector<HTMLSelectElement>("#lang-select");
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tab]"));
const tabPanels = Array.from(document.querySelectorAll<HTMLElement>("[data-tab-panel]"));
const runLockBanner = document.querySelector<HTMLElement>("#run-lock-banner");
const checkUpdateButton = document.querySelector<HTMLButtonElement>("#check-update");
const runButton = document.querySelector<HTMLButtonElement>("#run");
const openRunOutputDirButton = document.querySelector<HTMLButtonElement>("#open-run-output-dir");
const managedRunModeNewInput = document.querySelector<HTMLInputElement>("#managed-run-mode-new");
const managedRunModeResumeLatestInput = document.querySelector<HTMLInputElement>(
  "#managed-run-mode-resume-latest"
);
const managedRunBanner = document.querySelector<HTMLElement>("#managed-run-banner");
const managedRunModeCurrent = document.querySelector<HTMLElement>("#managed-run-mode-current");
const clearManagedResumeBatchButton = document.querySelector<HTMLButtonElement>(
  "#clear-managed-resume-batch"
);
const managedRunPickInput = document.querySelector<HTMLSelectElement>("#managed-run-pick");
const output = document.querySelector<HTMLElement>("#output");
const resultMode = document.querySelector<HTMLElement>("#result-mode");
const resultCards = document.querySelector<HTMLElement>("#result-cards");
const resultActions = document.querySelector<HTMLElement>("#result-actions");
const outputDetails = document.querySelector<HTMLDetailsElement>("#output-details");
const status = document.querySelector<HTMLElement>("#status");
const selectedTopicTags = document.querySelector<HTMLElement>("#selected-topic-tags");
const qaModeNormalInput = document.querySelector<HTMLInputElement>("#qa-mode-normal");
const qaModeCotInput = document.querySelector<HTMLInputElement>("#qa-mode-cot");
const topicTagSuggestions = document.querySelector<HTMLElement>("#topic-tag-suggestions");
const topicTagInput = document.querySelector<HTMLInputElement>("#topic-tag-input");
const addTopicTagButton = document.querySelector<HTMLButtonElement>("#add-topic-tag");
const openTopicFieldSelectorButton = document.querySelector<HTMLButtonElement>("#open-topic-field-selector");
const topicQuickstart = document.querySelector<HTMLElement>("#topic-quickstart");
const firstLaunchModal = document.querySelector<HTMLElement>("#first-launch-modal");
const firstLaunchGrid = document.querySelector<HTMLElement>("#first-launch-grid");
const firstLaunchConfirmButton = document.querySelector<HTMLButtonElement>("#first-launch-confirm");
const firstLaunchOpenSettingsButton = document.querySelector<HTMLButtonElement>("#first-launch-open-settings");
const topicFieldModal = document.querySelector<HTMLElement>("#topic-field-modal");
const closeTopicFieldModalButton = document.querySelector<HTMLButtonElement>("#close-topic-field-modal");
const cancelTopicFieldSelectionButton = document.querySelector<HTMLButtonElement>("#cancel-topic-field-selection");
const confirmTopicFieldSelectionButton = document.querySelector<HTMLButtonElement>("#confirm-topic-field-selection");
const topicFieldPrimaryList = document.querySelector<HTMLElement>("#topic-field-primary-list");
const topicFieldDetailList = document.querySelector<HTMLElement>("#topic-field-detail-list");
const topicFieldPendingList = document.querySelector<HTMLElement>("#topic-field-pending-list");
const topicFieldSelectedCount = document.querySelector<HTMLElement>("#topic-field-selected-count");
const browseContent = document.querySelector<HTMLElement>("#browse-content");
const browseBackButton = document.querySelector<HTMLButtonElement>("#browse-back");
const browseViewTitle = document.querySelector<HTMLElement>("#browse-view-title");
const browseViewMeta = document.querySelector<HTMLElement>("#browse-view-meta");
const providerPresetInput = document.querySelector<HTMLSelectElement>("#provider-preset");
const providerField = document.querySelector<HTMLLabelElement>("#provider-field");
const providerInput = document.querySelector<HTMLSelectElement>("#provider");
const modelInput = document.querySelector<HTMLSelectElement>("#model");
const customModelField = document.querySelector<HTMLLabelElement>("#custom-model-field");
const customModelInput = document.querySelector<HTMLInputElement>("#custom-model");
const setupChecklist = document.querySelector<HTMLElement>("#setup-checklist");
const baseUrlInput = document.querySelector<HTMLInputElement>("#base-url");
const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key");
const qaUploadUrlInput = document.querySelector<HTMLInputElement>("#qa-upload-url");
const literatureApiUrlInput = document.querySelector<HTMLInputElement>("#literature-api-url");
const literatureApiAuthInput = document.querySelector<HTMLInputElement>("#literature-api-auth");
const toggleApiKeyVisibilityButton = document.querySelector<HTMLButtonElement>("#toggle-api-key-visibility");
const runtimeConstraintHint = document.querySelector<HTMLElement>("#runtime-constraint-hint");
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
const progressDetail = document.querySelector<HTMLElement>("#progress-detail");
const runStatsGrid = document.querySelector<HTMLElement>("#run-stats-grid");
const runReadinessBanner = document.querySelector<HTMLElement>("#run-readiness-banner");
const exportLogsButton = document.querySelector<HTMLButtonElement>("#export-logs");
const logs = document.querySelector<HTMLElement>("#logs");
const fieldHelpButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".field-help-button[data-help-key]")
);

if (
  !promptInput ||
  !langSelect ||
  !runLockBanner ||
  !checkUpdateButton ||
  !runButton ||
  !openRunOutputDirButton ||
  !managedRunModeNewInput ||
  !managedRunModeResumeLatestInput ||
  !managedRunBanner ||
  !managedRunModeCurrent ||
  !clearManagedResumeBatchButton ||
  !managedRunPickInput ||
  !output ||
  !resultMode ||
  !resultCards ||
  !resultActions ||
  !outputDetails ||
  !status ||
  !selectedTopicTags ||
  !qaModeNormalInput ||
  !qaModeCotInput ||
  !topicTagSuggestions ||
  !topicTagInput ||
  !addTopicTagButton ||
  !openTopicFieldSelectorButton ||
  !topicQuickstart ||
  !firstLaunchModal ||
  !firstLaunchGrid ||
  !firstLaunchConfirmButton ||
  !firstLaunchOpenSettingsButton ||
  !topicFieldModal ||
  !closeTopicFieldModalButton ||
  !cancelTopicFieldSelectionButton ||
  !confirmTopicFieldSelectionButton ||
  !topicFieldPrimaryList ||
  !topicFieldDetailList ||
  !topicFieldPendingList ||
  !topicFieldSelectedCount ||
  !browseContent ||
  !browseBackButton ||
  !browseViewTitle ||
  !browseViewMeta ||
  !providerPresetInput ||
  !providerField ||
  !providerInput ||
  !modelInput ||
  !customModelField ||
  !customModelInput ||
  !setupChecklist ||
  !baseUrlInput ||
  !apiKeyInput ||
  !qaUploadUrlInput ||
  !literatureApiUrlInput ||
  !literatureApiAuthInput ||
  !toggleApiKeyVisibilityButton ||
  !runtimeConstraintHint ||
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
  !progressDetail ||
  !runStatsGrid ||
  !runReadinessBanner ||
  !exportLogsButton ||
  !logs
) {
  throw new Error("Missing UI elements");
}

const lockableControls: Array<
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
> = [
  promptInput,
  qaModeNormalInput,
  qaModeCotInput,
  topicTagInput,
  addTopicTagButton,
  openTopicFieldSelectorButton,
  managedRunModeNewInput,
  managedRunModeResumeLatestInput,
  clearManagedResumeBatchButton,
  closeTopicFieldModalButton,
  cancelTopicFieldSelectionButton,
  confirmTopicFieldSelectionButton,
  providerPresetInput,
  providerInput,
  modelInput,
  customModelInput,
  baseUrlInput,
  apiKeyInput,
  qaUploadUrlInput,
  literatureApiUrlInput,
  literatureApiAuthInput,
  toggleApiKeyVisibilityButton,
  targetCountInput,
  planLimitInput,
  shardSizeInput,
  batchSizeInput,
  maxInFlightInput,
  maxRetriesInput,
  timeoutInput,
  resumeInput
];

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
  const template = t(key);
  if (value && template.includes("{value}")) {
    return template.replace("{value}", value);
  }

  return value ? `${template} ${value}` : template;
}

function createResearchFieldLabels(
  nodes: readonly ResearchFieldNode[],
  parentsZh: string[] = [],
  parentsEn: string[] = [],
  labels: Record<string, ResearchFieldLabelMeta> = {}
): Record<string, ResearchFieldLabelMeta> {
  for (const node of nodes) {
    const currentZh = [...parentsZh, node.zh];
    const currentEn = [...parentsEn, node.en];
    labels[node.id] = {
      fullZh: currentZh.join(" / "),
      fullEn: currentEn.join(" / "),
      shortZh: node.zh,
      shortEn: node.en
    };

    if (node.children?.length) {
      createResearchFieldLabels(node.children, currentZh, currentEn, labels);
    }
  }

  return labels;
}

function lookupResearchFieldLabel(tag: string, mode: "full" | "short" = "full"): string | null {
  const meta = RESEARCH_FIELD_LABELS[tag];
  if (!meta) {
    return null;
  }

  if (currentLang === "zh") {
    return mode === "short" ? meta.shortZh : meta.fullZh;
  }

  return mode === "short" ? meta.shortEn : meta.fullEn;
}

function topicTagLabel(tag: string, mode: "full" | "short" = "full"): string {
  const researchFieldLabel = lookupResearchFieldLabel(tag, mode);
  if (researchFieldLabel) {
    return researchFieldLabel;
  }

  const translationKey = `tag_${tag}`;
  const translated = translations[currentLang][translationKey];
  return translated ?? tag;
}

function currentTopicFieldNode(): ResearchFieldNode | null {
  if (!topicFieldModalPrimaryId) {
    return RESEARCH_FIELD_TAXONOMY[0] ?? null;
  }

  return RESEARCH_FIELD_TAXONOMY.find((node) => node.id === topicFieldModalPrimaryId) ?? RESEARCH_FIELD_TAXONOMY[0] ?? null;
}

function formatCountTemplate(key: string, count: number): string {
  return t(key).replace("{count}", String(count));
}

function currentQaMode(): "normal" | "cot" {
  return qaModeCotInput.checked ? "cot" : "normal";
}

function currentManagedRunMode(): "new" | "resume-latest" {
  if (managedResumeBatchId) {
    return "resume-batch";
  }

  return managedRunModeResumeLatestInput.checked ? "resume-latest" : "new";
}

function applyQaModeDefaults(qaMode: "normal" | "cot") {
  if (qaMode !== "cot") {
    return;
  }

  targetCountInput.value = String(DEFAULT_COT_TARGET_COUNT);
  shardSizeInput.value = String(DEFAULT_COT_SHARD_SIZE);
  batchSizeInput.value = String(DEFAULT_COT_BATCH_SIZE);
  maxInFlightInput.value = String(DEFAULT_COT_MAX_IN_FLIGHT);
  normalizeRuntimeParameterInputs(true);
  renderSetupSummary();
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

  if (tab === "browse" && !browseLoading && !browseBatches.length) {
    void loadBrowseBatches();
  }
}

function renderTopicFieldModal() {
  const primaryNode = currentTopicFieldNode();

  topicFieldPrimaryList.innerHTML = RESEARCH_FIELD_TAXONOMY.map((node) => {
    const active = node.id === primaryNode?.id;
    return `<button class="field-primary-button${active ? " active" : ""}" type="button" data-field-primary="${escapeHtml(node.id)}">${escapeHtml(topicTagLabel(node.id, "short"))}</button>`;
  }).join("");

  if (!primaryNode?.children?.length) {
    topicFieldDetailList.innerHTML = `<div class="empty-state compact">${escapeHtml(t("topic_field_empty"))}</div>`;
  } else {
    topicFieldDetailList.innerHTML = primaryNode.children
      .map((secondary) => {
        const secondarySelected = pendingTopicFieldTags.includes(secondary.id);
        const tertiaryHtml = secondary.children?.length
          ? `<div class="field-chip-grid">${secondary.children
              .map((tertiary) => {
                const tertiarySelected = pendingTopicFieldTags.includes(tertiary.id);
                return `<button class="field-option${tertiarySelected ? " active" : ""}" type="button" data-field-tag="${escapeHtml(tertiary.id)}">${escapeHtml(topicTagLabel(tertiary.id, "short"))}</button>`;
              })
              .join("")}</div>`
          : "";

        return `
          <section class="field-group">
            <div class="field-group-header">
              <button class="field-option field-option-group${secondarySelected ? " active" : ""}" type="button" data-field-tag="${escapeHtml(secondary.id)}">
                ${escapeHtml(topicTagLabel(secondary.id, "short"))}
              </button>
            </div>
            ${tertiaryHtml}
          </section>
        `;
      })
      .join("");
  }

  if (pendingTopicFieldTags.length === 0) {
    topicFieldPendingList.innerHTML = `<p class="empty-inline">${escapeHtml(t("no_tags"))}</p>`;
  } else {
    topicFieldPendingList.innerHTML = pendingTopicFieldTags
      .map(
        (tag) => `
          <button class="tag-chip active removable" type="button" data-pending-tag="${escapeHtml(tag)}">
            <span>${escapeHtml(topicTagLabel(tag))}</span>
            <span class="tag-chip-close">×</span>
          </button>
        `
      )
      .join("");
  }

  topicFieldSelectedCount.textContent = formatCountTemplate("topic_field_selected_count", pendingTopicFieldTags.length);
  confirmTopicFieldSelectionButton.disabled = pendingTopicFieldTags.length === 0;
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

  topicTagSuggestions.innerHTML = QUICK_TOPIC_TAG_IDS.map((tag) => {
    const active = topicTags.includes(tag);
    return `<button class="tag-chip${active ? " active" : ""}" type="button" data-suggested-tag="${tag}">${escapeHtml(topicTagLabel(tag, "short"))}</button>`;
  }).join("");

  if (!topicFieldModal.hidden) {
    renderTopicFieldModal();
  }
}

function togglePendingTopicFieldTag(tag: string) {
  if (pendingTopicFieldTags.includes(tag)) {
    pendingTopicFieldTags = pendingTopicFieldTags.filter((item) => item !== tag);
  } else {
    pendingTopicFieldTags = [...pendingTopicFieldTags, tag];
  }

  renderTopicFieldModal();
}

function openTopicFieldModal() {
  if (!topicFieldModalPrimaryId) {
    topicFieldModalPrimaryId = RESEARCH_FIELD_TAXONOMY[0]?.id ?? null;
  }

  pendingTopicFieldTags = [];
  topicFieldModal.hidden = false;
  renderTopicFieldModal();
}

function closeTopicFieldModal() {
  topicFieldModal.hidden = true;
  pendingTopicFieldTags = [];
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
    scheduleAutoSave();
  }
}

function removeTopicTag(tag: string) {
  topicTags = topicTags.filter((item) => item !== tag);
  renderTopicTags();
  renderSetupSummary();
  scheduleAutoSave();
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

function currentPresetLabel(presetId: ProviderPresetId): string {
  return t(`preset_${presetId}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function currentModelValue(): string {
  return modelInput.value === CUSTOM_MODEL_VALUE ? customModelInput.value.trim() : modelInput.value.trim();
}

function qaModeLabel(qaMode: string | null | undefined): string {
  return qaMode === "cot" ? t("qa_mode_cot") : t("qa_mode_normal");
}

function batchStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "completed":
      return t("browse_status_completed");
    case "running":
      return t("browse_status_running");
    case "generated":
      return t("browse_status_generated");
    default:
      return t("browse_status_prepared");
  }
}

function syncProviderFieldVisibility(presetId: ProviderPresetId) {
  providerField.hidden = presetId !== "custom";
}

function syncModelOptions(presetId: ProviderPresetId, preferredModel?: string | null) {
  const resolvedModel = preferredModel?.trim() ?? currentModelValue();
  const preset = presetId === "custom" ? null : PROVIDER_PRESETS[presetId];
  const models = preset?.models ?? [];

  modelInput.replaceChildren();

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelInput.append(option);
  }

  const customOption = document.createElement("option");
  customOption.value = CUSTOM_MODEL_VALUE;
  customOption.textContent = t("model_custom_option");
  modelInput.append(customOption);

  const shouldUseCustomModel =
    presetId === "custom" || Boolean(resolvedModel && !models.includes(resolvedModel));

  if (shouldUseCustomModel) {
    modelInput.value = CUSTOM_MODEL_VALUE;
    customModelField.hidden = false;
    customModelInput.value = resolvedModel;
    return;
  }

  customModelField.hidden = true;
  customModelInput.value = "";
  modelInput.value = resolvedModel && models.includes(resolvedModel) ? resolvedModel : preset?.defaultModel ?? "";
}

function detectProviderPreset(fields: {
  provider: string;
  baseUrl: string | null;
}): ProviderPresetId {
  const provider = fields.provider.trim();
  const baseUrl = (fields.baseUrl ?? "").trim();

  for (const [presetId, preset] of Object.entries(PROVIDER_PRESETS) as Array<
    [ProviderPresetConfigKey, ProviderPresetConfig]
  >) {
    if (provider === preset.provider && baseUrl === preset.baseUrl) {
      return presetId;
    }
  }

  return "custom";
}

function migrateLegacyStubRequest(request: PipelineFormRequest): PipelineFormRequest {
  const presetId = detectProviderPreset({
    provider: request.provider,
    baseUrl: request.baseUrl
  });
  if (request.provider !== "stub" && presetId !== "stub_local") {
    return request;
  }

  const preset = PROVIDER_PRESETS[FALLBACK_REAL_PROVIDER_PRESET];
  return {
    ...request,
    provider: preset.provider,
    model: preset.defaultModel,
    baseUrl: preset.baseUrl,
    apiKey: null,
    batchSize: preset.batchSize,
    maxInFlight: preset.maxInFlight,
    requestTimeoutSecs: preset.requestTimeoutSecs
  };
}

function normalizeLoadedCotRequest(request: PipelineFormRequest): PipelineFormRequest {
  if (request.qaMode !== "cot") {
    return request;
  }

  const nextTargetCount = Math.min(request.targetCount || DEFAULT_COT_TARGET_COUNT, COT_TARGET_COUNT_CAP);
  const nextShardSize = Math.min(
    Math.max(request.shardSize || DEFAULT_COT_SHARD_SIZE, 1),
    Math.min(nextTargetCount, COT_SAFE_SHARD_SIZE_CAP)
  );
  const nextBatchSize = DEFAULT_COT_BATCH_SIZE;
  const nextMaxInFlight = DEFAULT_COT_MAX_IN_FLIGHT;

  if (
    nextTargetCount === request.targetCount &&
    nextShardSize === request.shardSize &&
    nextBatchSize === request.batchSize &&
    nextMaxInFlight === request.maxInFlight
  ) {
    return request;
  }

  return {
    ...request,
    targetCount: nextTargetCount,
    shardSize: nextShardSize,
    batchSize: nextBatchSize,
    maxInFlight: nextMaxInFlight
  };
}

function syncProviderPresetInput() {
  const presetId = detectProviderPreset({
    provider: providerInput.value,
    baseUrl: baseUrlInput.value
  });
  providerPresetInput.value = presetId;
  syncProviderFieldVisibility(presetId);
  syncModelOptions(presetId);
}

function applyProviderPreset(presetId: ProviderPresetId, logChange = false) {
  if (presetId === "custom") {
    providerPresetInput.value = "custom";
    syncProviderFieldVisibility("custom");
    syncModelOptions("custom");
    normalizeRuntimeParameterInputs(true);
    renderSetupSummary();
    return;
  }

  const preset = PROVIDER_PRESETS[presetId];
  providerInput.value = preset.provider;
  baseUrlInput.value = preset.baseUrl;
  batchSizeInput.value = String(preset.batchSize);
  maxInFlightInput.value = String(preset.maxInFlight);
  timeoutInput.value = String(preset.requestTimeoutSecs);
  providerPresetInput.value = presetId;
  syncProviderFieldVisibility(presetId);
  syncModelOptions(presetId, preset.defaultModel);
  normalizeRuntimeParameterInputs(true);
  renderSetupSummary();

  if (logChange) {
    appendLog(formatMessage("log_applied_preset", currentPresetLabel(presetId)));
  }
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(currentLang === "zh" ? "zh-CN" : "en-US").format(value);
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) {
    return t("stats_not_available");
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatRate(itemsPerMinute: number | null): string {
  if (itemsPerMinute === null || !Number.isFinite(itemsPerMinute) || itemsPerMinute <= 0) {
    return t("stats_not_available");
  }

  return currentLang === "zh"
    ? `${formatCount(Math.round(itemsPerMinute))} 条/分钟`
    : `${formatCount(Math.round(itemsPerMinute))} items/min`;
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
  const providerReady = providerPresetInput.value.trim().length > 0;
  const modelReady = currentModelValue().length > 0;
  const requiresEndpointAuth = providerInput.value === "openai-compatible";
  const baseUrlReady = !requiresEndpointAuth || baseUrlInput.value.trim().length > 0;
  const apiKeyReady = !requiresEndpointAuth || apiKeyInput.value.trim().length > 0;
  const connectionReady = !requiresEndpointAuth || (baseUrlReady && apiKeyReady);
  const providerLabel = providerReady
    ? providerPresetInput.value === "custom"
      ? providerInput.value.trim() || t("empty_value")
      : currentPresetLabel(providerPresetInput.value as ProviderPresetId)
    : "";
  const missingKeys: string[] = [];

  if (!providerReady) {
    missingKeys.push("settings_checklist_missing_provider");
  }
  if (!modelReady) {
    missingKeys.push("settings_checklist_missing_model");
  }
  if (requiresEndpointAuth && !baseUrlReady) {
    missingKeys.push("settings_checklist_missing_base_url");
  }
  if (requiresEndpointAuth && !apiKeyReady) {
    missingKeys.push("settings_checklist_missing_api_key");
  }

  const missingLabels = missingKeys.map((key) => t(key)).join(currentLang === "zh" ? "、" : ", ");
  const connectionMissingKeys = missingKeys.filter((key) =>
    ["settings_checklist_missing_base_url", "settings_checklist_missing_api_key"].includes(key)
  );
  const connectionMissingLabels = connectionMissingKeys
    .map((key) => t(key))
    .join(currentLang === "zh" ? "、" : ", ");
  const items = [
    {
      label: t("settings_checklist_provider"),
      status: providerReady,
      detail: providerReady
        ? formatMessage("settings_checklist_provider_ready", providerLabel)
        : t("settings_checklist_provider_pending")
    },
    {
      label: t("settings_checklist_model"),
      status: modelReady,
      detail: modelReady
        ? formatMessage("settings_checklist_model_ready", currentModelValue())
        : t("settings_checklist_model_pending")
    },
    {
      label: t("settings_checklist_connection"),
      status: connectionReady,
      detail: !requiresEndpointAuth
        ? t("settings_checklist_connection_not_required")
        : connectionReady
          ? t("settings_checklist_connection_ready")
          : formatMessage("settings_checklist_connection_pending", connectionMissingLabels)
    },
    {
      label: t("settings_checklist_ready"),
      status: missingKeys.length === 0,
      detail:
        missingKeys.length === 0
          ? t("settings_checklist_ready_done")
          : formatMessage("settings_checklist_ready_pending", missingLabels)
    }
  ];

  setupChecklist.innerHTML = `
    <div class="setup-checklist-header">
      <div>
        <p class="setup-checklist-title">${escapeHtml(t("settings_checklist_title"))}</p>
        <p class="setup-checklist-copy">${escapeHtml(t("settings_checklist_copy"))}</p>
      </div>
    </div>
    <div class="setup-checklist-grid">
      ${items
        .map(
          ({ label, status, detail }) => `
            <article class="setup-checklist-item" data-ready="${status ? "true" : "false"}">
              <div class="setup-checklist-item-header">
                <p class="setup-checklist-item-label">${escapeHtml(label)}</p>
                <span class="setup-checklist-status" data-ready="${status ? "true" : "false"}">${escapeHtml(
                  t(status ? "settings_checklist_done" : "settings_checklist_pending")
                )}</span>
              </div>
              <p class="setup-checklist-item-detail">${escapeHtml(detail)}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
  renderTopicQuickstart();
  renderRunReadinessBanner();
  updateRunButtonUi();
}

function resetRunStats() {
  runStats = {
    startedAtMs: null,
    lastUpdatedAtMs: null,
    generatedCount: 0,
    targetCount: null,
    shardIndex: null,
    shardCount: null,
    completedBatchCount: 0,
    estimatedBatchCount: null,
    completedShardCount: 0,
    skippedShardCount: 0,
    retryCount: 0,
    failedBatchCount: 0,
    samples: []
  };
}

function beginRunStats(request: PipelineFormRequest) {
  const startedAtMs = Date.now();
  runStats = {
    startedAtMs,
    lastUpdatedAtMs: startedAtMs,
    generatedCount: 0,
    targetCount: request.targetCount,
    shardIndex: null,
    shardCount: request.shardSize > 0 ? Math.ceil(request.targetCount / request.shardSize) : null,
    completedBatchCount: 0,
    estimatedBatchCount:
      request.batchSize > 0 ? Math.ceil(request.targetCount / request.batchSize) : null,
    completedShardCount: 0,
    skippedShardCount: 0,
    retryCount: 0,
    failedBatchCount: 0,
    samples: [{ atMs: startedAtMs, generatedCount: 0 }]
  };
}

function stopRunStatsTicker() {
  if (runStatsTimer !== null) {
    window.clearInterval(runStatsTimer);
    runStatsTimer = null;
  }
}

function startRunStatsTicker() {
  stopRunStatsTicker();
  runStatsTimer = window.setInterval(() => {
    renderRunStats();
  }, 1000);
}

function updateRunStatsFromEvent(payload: PipelineProgressEvent) {
  const now = Date.now();
  if (runStats.startedAtMs === null) {
    runStats.startedAtMs = now;
  }

  runStats.lastUpdatedAtMs = now;
  if (payload.targetCount !== null && payload.targetCount !== undefined) {
    runStats.targetCount = payload.targetCount;
  }
  if (payload.totalGenerated !== null && payload.totalGenerated !== undefined) {
    runStats.generatedCount = payload.totalGenerated;
  }
  if (payload.shardIndex !== null && payload.shardIndex !== undefined) {
    runStats.shardIndex = payload.shardIndex;
  }
  if (payload.shardCount !== null && payload.shardCount !== undefined) {
    runStats.shardCount = payload.shardCount;
  }

  if (payload.runtimeKind === "batch_completed") {
    runStats.completedBatchCount += 1;
  } else if (payload.runtimeKind === "shard_completed") {
    runStats.completedShardCount += 1;
  } else if (payload.runtimeKind === "shard_skipped") {
    runStats.skippedShardCount += 1;
  } else if (payload.runtimeKind === "batch_retry") {
    runStats.retryCount += 1;
  } else if (payload.runtimeKind === "batch_failed") {
    runStats.failedBatchCount += 1;
  }

  if (
    runStats.samples.length === 0 ||
    runStats.samples[runStats.samples.length - 1]?.generatedCount !== runStats.generatedCount
  ) {
    runStats.samples.push({ atMs: now, generatedCount: runStats.generatedCount });
  }

  runStats.samples = runStats.samples.filter((sample) => now - sample.atMs <= 5 * 60 * 1000);
}

function renderRunStats() {
  const now = Date.now();
  const startedAtMs = runStats.startedAtMs;
  const elapsedMs = startedAtMs === null ? null : now - startedAtMs;
  const totalGenerated = runStats.generatedCount;
  const totalTarget = runStats.targetCount;
  const avgRatePerMinute =
    startedAtMs !== null && elapsedMs !== null && elapsedMs > 0
      ? (totalGenerated / elapsedMs) * 60_000
      : null;

  const recentWindowStart = now - 60_000;
  const recentSample = [...runStats.samples]
    .reverse()
    .find((sample) => sample.atMs <= recentWindowStart) ?? runStats.samples[0] ?? null;
  const currentRatePerMinute =
    recentSample && recentSample.atMs < now
      ? ((totalGenerated - recentSample.generatedCount) / (now - recentSample.atMs)) * 60_000
      : avgRatePerMinute;
  const remainingCount =
    totalTarget !== null && totalTarget >= totalGenerated ? totalTarget - totalGenerated : null;
  const totalRequestAttempts =
    runStats.completedBatchCount + runStats.retryCount + runStats.failedBatchCount;
  const successRate =
    totalRequestAttempts > 0 ? (runStats.completedBatchCount / totalRequestAttempts) * 100 : null;
  const etaMs =
    remainingCount !== null &&
    currentRatePerMinute !== null &&
    currentRatePerMinute > 0 &&
    remainingCount > 0
      ? (remainingCount / currentRatePerMinute) * 60_000
      : remainingCount === 0
        ? 0
        : null;

  const generatedProgress =
    totalTarget !== null
      ? `${formatCount(totalGenerated)} / ${formatCount(totalTarget)}`
      : totalGenerated > 0
        ? formatCount(totalGenerated)
        : t("stats_idle");
  const requestProgress =
    runStats.estimatedBatchCount !== null
      ? `${formatCount(runStats.completedBatchCount)} / ${formatCount(runStats.estimatedBatchCount)}`
      : runStats.completedBatchCount > 0
        ? formatCount(runStats.completedBatchCount)
        : t("stats_idle");
  const shardCompleted = runStats.completedShardCount + runStats.skippedShardCount;
  const shardProgress =
    runStats.shardCount !== null
      ? `${formatCount(shardCompleted)} / ${formatCount(runStats.shardCount)}`
      : runStats.shardIndex !== null
        ? formatCount(runStats.shardIndex)
        : t("stats_idle");

  const cards = [
    { label: t("stats_elapsed"), value: startedAtMs === null ? t("stats_idle") : formatDuration(elapsedMs) },
    { label: t("stats_avg_speed"), value: formatRate(avgRatePerMinute) },
    { label: t("stats_current_speed"), value: formatRate(currentRatePerMinute) },
    { label: t("stats_eta"), value: formatDuration(etaMs) },
    { label: t("stats_generated_progress"), value: generatedProgress },
    { label: t("stats_request_progress"), value: requestProgress },
    { label: t("stats_shard_progress"), value: shardProgress },
    { label: t("stats_retry_count"), value: formatCount(runStats.retryCount) },
    { label: t("stats_failed_requests"), value: formatCount(runStats.failedBatchCount) },
    {
      label: t("stats_success_rate"),
      value:
        successRate === null || !Number.isFinite(successRate)
          ? t("stats_not_available")
          : `${successRate.toFixed(1)}%`
    }
  ];

  runStatsGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="run-stat-card">
          <p class="run-stat-label">${escapeHtml(card.label)}</p>
          <p class="run-stat-value">${escapeHtml(card.value)}</p>
        </article>
      `
    )
    .join("");
}

function currentBrowseBatch(): QaBatchSummary | null {
  return (
    browseBatches.find((batch) => batch.id === browseSelectedBatchId) ??
    browsePageData?.batch ??
    browseDetailData?.batch ??
    null
  );
}

function currentQaUploadUrl(): string {
  return qaUploadUrlInput.value.trim();
}

function formatBrowsePageLabel(page: number, totalPages: number): string {
  return currentLang === "zh"
    ? `第 ${page} / ${totalPages} 页`
    : `Page ${page} / ${totalPages}`;
}

function formatUpdatedAt(updatedAtMs: number | null): string {
  if (!updatedAtMs) {
    return t("empty_value");
  }

  return new Intl.DateTimeFormat(currentLang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(updatedAtMs));
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function parseCotAnswerSections(answer: string): Array<{ label: string; value: string }> {
  const headingPattern = COT_SECTION_CONFIG.map(({ heading }) => escapeRegExp(heading)).join("|");
  const matcher = new RegExp(`^(${headingPattern})\\s*:\\s*`, "gm");
  const matches = Array.from(answer.matchAll(matcher));
  if (!matches.length) {
    return [];
  }

  return matches
    .map((match, index) => {
      const heading = match[1];
      const start = (match.index ?? 0) + match[0].length;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? answer.length) : answer.length;
      const value = answer.slice(start, end).trim();
      const section = COT_SECTION_CONFIG.find((item) => item.heading === heading);
      return section && value
        ? {
            label: t(section.translationKey),
            value
          }
        : null;
    })
    .filter((section): section is { label: string; value: string } => Boolean(section));
}

function renderBrowseView() {
  if (browseView === "batches") {
    browseBackButton.hidden = true;
    browseBackButton.textContent = "";
    browseViewTitle.textContent = t("browse_batches_title");
    browseViewMeta.textContent = browseBatches.length
      ? `${t("browse_history_count")} ${formatCount(browseBatches.length)}`
      : t("browse_batches_empty");
    browseContent.innerHTML = renderBrowseBatches();
    return;
  }

  const batch = currentBrowseBatch();

  if (browseView === "questions") {
    browseBackButton.hidden = false;
    browseBackButton.textContent = t("browse_back_batches");
    browseViewTitle.textContent = batch ? batch.topicName || batch.name : t("browse_questions_title");
    browseViewMeta.textContent = browsePageData
      ? `${t("browse_total_items")} ${formatCount(browsePageData.totalItems)} · ${formatBrowsePageLabel(browsePageData.page, browsePageData.totalPages)}`
      : browseQuestionsLoading
        ? t("browse_questions_loading")
        : t("browse_questions_empty");
    browseContent.innerHTML = renderBrowseQaList();
    return;
  }

  browseBackButton.hidden = false;
  browseBackButton.textContent = t("browse_back_questions");
  browseViewTitle.textContent = t("browse_detail_title");
  browseViewMeta.textContent = browseDetailData
    ? `${batch ? `${batch.topicName || batch.name} · ` : ""}${truncateText(browseDetailData.item.question, 88)}`
    : browseDetailLoading
      ? t("browse_detail_loading")
      : t("browse_detail_empty");
  browseContent.innerHTML = renderBrowseDetail();
}

function renderBrowseBatches(): string {
  if (!browseBatches.length) {
    return `<div class="empty-state">${escapeHtml(t("browse_batches_empty"))}</div>`;
  }

  const hasUploadUrl = Boolean(currentQaUploadUrl());
  return `<div class="browse-list">${browseBatches
    .map((batch) => {
      const selected = batch.id === browseSelectedBatchId;
      const stats = [
        batch.targetCount !== null
          ? `${t("browse_target_items")} ${formatCount(batch.targetCount)}`
          : null,
        `${t("browse_generated_items")} ${formatCount(batch.generatedCount)}`,
        `${t("browse_kept_items")} ${formatCount(batch.keptCount)}`,
        batch.requestCount !== null
          ? `${t("browse_request_count")} ${formatCount(batch.requestCount)}`
          : null
      ]
        .filter(Boolean)
        .join(" · ");
      const meta = [
        `${t("browse_task_status")} ${batchStatusLabel(batch.status)}`,
        batch.qaMode ? qaModeLabel(batch.qaMode) : null,
        batch.model ? `${t("browse_model")} ${batch.model}` : null,
        `${t("browse_updated_at")} ${formatUpdatedAt(batch.updatedAtMs)}`
      ]
        .filter(Boolean)
        .join(" · ");
      const progress = batch.shardCount
        ? `${t("browse_shard_progress")} ${formatCount(batch.completedShards + batch.skippedShards)} / ${formatCount(batch.shardCount)}`
        : null;

      return `
        <article class="browse-row${selected ? " active" : ""}">
          <button class="browse-row-main" type="button" data-batch-id="${escapeHtml(batch.id)}">
            <span class="browse-row-title">${escapeHtml(batch.topicName || batch.name)}</span>
            <span class="browse-row-meta">${escapeHtml(meta)}</span>
            <span class="browse-row-stats">${escapeHtml(stats)}</span>
            ${progress ? `<span class="browse-row-progress">${escapeHtml(progress)}</span>` : ""}
            <span class="browse-row-copy">${escapeHtml(truncateText(batch.prompt, 96) || batch.outputDir)}</span>
          </button>
          <div class="browse-row-actions">
            <button type="button" class="browse-mini-button" data-batch-action="continue" data-batch-id="${escapeHtml(batch.id)}">${escapeHtml(t("browse_action_continue"))}</button>
            <button type="button" class="browse-mini-button" data-batch-action="open" data-batch-id="${escapeHtml(batch.id)}">${escapeHtml(t("browse_action_open"))}</button>
            <button type="button" class="browse-mini-button browse-mini-button-danger" data-batch-action="delete" data-batch-id="${escapeHtml(batch.id)}">${escapeHtml(t("browse_action_delete"))}</button>
            <button type="button" class="browse-mini-button${hasUploadUrl ? "" : " browse-mini-button-muted"}" data-batch-action="upload" data-batch-id="${escapeHtml(batch.id)}" data-upload-ready="${hasUploadUrl ? "true" : "false"}">${escapeHtml(t("browse_action_upload"))}</button>
          </div>
        </article>
      `;
    })
    .join("")}</div>`;
}

function renderBrowseQaList(): string {
  if (browseErrorMessage) {
    return `<div class="empty-state">${escapeHtml(browseErrorMessage)}</div>`;
  }

  if (browseQuestionsLoading) {
    return `<div class="empty-state">${escapeHtml(t("browse_questions_loading"))}</div>`;
  }

  if (!browsePageData || !browseSelectedBatchId) {
    return `<div class="empty-state">${escapeHtml(t("browse_questions_empty"))}</div>`;
  }

  const listHtml = !browsePageData.items.length
    ? `<div class="empty-state">${escapeHtml(t("browse_questions_empty"))}</div>`
    : `<div class="browse-list">${browsePageData.items
        .map((item) => {
          const active = browseDetailData?.item.id === item.id;
          const meta = [item.subtopic, item.axis, item.questionType, item.difficulty]
            .filter(Boolean)
            .join(" · ");
          return `
            <button class="browse-row${active ? " active" : ""}" type="button" data-qa-id="${escapeHtml(item.id)}">
              <span class="browse-row-title">${escapeHtml(truncateText(item.question, 100))}</span>
              <span class="browse-row-meta">${escapeHtml(meta)}</span>
            </button>
          `;
        })
        .join("")}</div>`;

  return `
    ${listHtml}
    <div class="browse-pagination">
      <button type="button" id="browse-prev-page" ${browsePageData.page <= 1 ? "disabled" : ""}>${escapeHtml(t("browse_prev"))}</button>
      <span class="browse-page-label">${escapeHtml(formatBrowsePageLabel(browsePageData.page, browsePageData.totalPages))}</span>
      <button type="button" id="browse-next-page" ${browsePageData.page >= browsePageData.totalPages ? "disabled" : ""}>${escapeHtml(t("browse_next"))}</button>
    </div>
  `;
}

function renderBrowseDetail(): string {
  if (browseErrorMessage) {
    return `<div class="empty-state">${escapeHtml(browseErrorMessage)}</div>`;
  }

  if (browseDetailLoading) {
    return `<div class="empty-state">${escapeHtml(t("browse_detail_loading"))}</div>`;
  }

  if (!browseDetailData) {
    return `<div class="empty-state">${escapeHtml(t("browse_detail_empty"))}</div>`;
  }

  const { batch, item } = browseDetailData;
  const cotSections = item.qa_mode === "cot" ? parseCotAnswerSections(item.answer) : [];
  const cards = [
    { label: t("browse_batch_name"), value: batch.topicName || batch.name },
    { label: t("browse_task_status"), value: batchStatusLabel(batch.status) },
    { label: t("browse_qa_mode"), value: qaModeLabel(item.qa_mode) },
    {
      label: t("browse_target_items"),
      value: batch.targetCount !== null ? formatCount(batch.targetCount) : t("empty_value")
    },
    { label: t("browse_generated_items"), value: formatCount(batch.generatedCount) },
    { label: t("browse_kept_items"), value: formatCount(batch.keptCount) },
    {
      label: t("browse_shard_progress"),
      value: batch.shardCount
        ? `${formatCount(batch.completedShards + batch.skippedShards)} / ${formatCount(batch.shardCount)}`
        : t("empty_value")
    },
    { label: t("browse_subtopic"), value: item.subtopic },
    { label: t("browse_axis"), value: item.axis },
    { label: t("browse_question_type"), value: item.question_type },
    { label: t("browse_difficulty"), value: item.difficulty },
    { label: t("browse_audience"), value: item.audience },
    { label: t("browse_provider"), value: item.provider },
    { label: t("browse_model"), value: item.model },
    {
      label: t("browse_request_count"),
      value: batch.requestCount !== null ? formatCount(batch.requestCount) : t("empty_value")
    },
    { label: t("browse_output_dir"), value: batch.outputDir, wide: true },
    { label: t("browse_prompt"), value: batch.prompt || t("empty_value"), wide: true },
    { label: t("browse_question"), value: item.question, wide: true },
    { label: t("browse_source_type"), value: item.source_type },
    { label: t("browse_grounding"), value: item.grounding }
  ];

  const answerCards =
    cotSections.length > 0
      ? cotSections.map(({ label, value }) => ({ label, value, wide: true, multiline: true }))
      : [{ label: t("browse_answer"), value: item.answer, wide: true, multiline: true }];

  return `<div class="browse-detail">${[...cards, ...answerCards]
    .map(
      ({ label, value, wide, multiline }) => `
        <article class="result-card${wide ? " wide" : ""}">
          <p class="result-card-label">${escapeHtml(label)}</p>
          <p class="result-card-value${multiline ? " multiline" : ""}">${escapeHtml(displayValue(value))}</p>
        </article>
      `
    )
    .join("")}</div>`;
}

async function deleteBrowseBatch(batchId: string) {
  const confirmed = window.confirm(t("browse_delete_confirm"));
  if (!confirmed) {
    return;
  }

  try {
    await invoke("delete_qa_batch", { batchId });
    if (browseSelectedBatchId === batchId) {
      browseView = "batches";
      browseSelectedBatchId = null;
      browsePageData = null;
      browseDetailData = null;
    }
    await loadBrowseBatches();
    window.alert(t("browse_delete_success"));
  } catch (error) {
    window.alert(`${t("browse_action_delete")}: ${String(error)}`);
  }
}

async function uploadBrowseBatch(batchId: string) {
  const uploadUrl = currentQaUploadUrl();
  if (!uploadUrl) {
    window.alert(t("browse_upload_url_missing"));
    setCurrentTab("settings");
    qaUploadUrlInput.focus();
    return;
  }

  try {
    const response = await invoke<QaBatchUploadResponse>("upload_qa_batch", {
      batchId,
      uploadUrl
    });
    window.alert(`${t("browse_upload_success")} (${formatCount(response.uploadedCount)})`);
  } catch (error) {
    window.alert(`${t("browse_upload_failed")}: ${String(error)}`);
  }
}

async function resumeBrowseBatch(batchId: string) {
  try {
    const currentRequest = collectRequest();
    const loadedRequest = await invoke<PipelineFormRequest>("load_batch_pipeline_request", {
      batchId
    });
    const batch = browseBatches.find((item) => item.id === batchId) ?? null;
    const mergedRequest: PipelineFormRequest = {
      ...loadedRequest,
      apiKey: currentRequest.apiKey,
      qaUploadUrl: currentRequest.qaUploadUrl,
      literatureApiUrl: currentRequest.literatureApiUrl,
      literatureApiAuthToken: currentRequest.literatureApiAuthToken
    };

    managedResumeBatchId = batchId;
    managedResumeBatchLabel = batch?.topicName || batch?.name || batchId;
    applyRequest(mergedRequest);
    syncManagedRunModeUi();
    setCurrentTab("topic");
    void persistCurrentConfig(true);
    appendLog(t("log_loaded_batch_task"));
  } catch (error) {
    window.alert(`${t("browse_action_continue")}: ${String(error)}`);
  }
}

async function loadBrowseBatches() {
  if (browseLoading) {
    return;
  }

  browseLoading = true;
  try {
    browseErrorMessage = null;
    browseBatches = await invoke<QaBatchSummary[]>("list_qa_batches");
    if (!browseBatches.length) {
      browseView = "batches";
      browseSelectedBatchId = null;
      browsePageData = null;
      browseDetailData = null;
      browseQuestionsLoading = false;
      browseDetailLoading = false;
    } else if (!browseSelectedBatchId || !browseBatches.some((batch) => batch.id === browseSelectedBatchId)) {
      browseView = "batches";
      browseSelectedBatchId = null;
      browsePageData = null;
      browseDetailData = null;
      browseQuestionsLoading = false;
      browseDetailLoading = false;
    }
  } catch (error) {
    browseView = "batches";
    browseBatches = [];
    browseSelectedBatchId = null;
    browsePageData = null;
    browseDetailData = null;
    browseQuestionsLoading = false;
    browseDetailLoading = false;
    browseErrorMessage = `Browse QA failed: ${String(error)}`;
    appendLog(`Browse QA failed: ${String(error)}`);
  } finally {
    browseLoading = false;
    renderManagedRunPicker();
    renderBrowseView();
  }
}

async function loadBrowseQaPage(batchId: string, page: number) {
  browseSelectedBatchId = batchId;
  browseView = "questions";
  browseQuestionsLoading = true;
  browseDetailLoading = false;
  browsePageData = null;
  browseDetailData = null;
  browseErrorMessage = null;
  renderBrowseView();

  try {
    browsePageData = await invoke<QaRecordPage>("list_batch_qa_records", {
      batchId,
      page,
      pageSize: 20
    });
  } catch (error) {
    browsePageData = null;
    browseDetailData = null;
    browseErrorMessage = `Load QA list failed: ${String(error)}`;
    appendLog(`Browse QA page failed: ${String(error)}`);
  } finally {
    browseQuestionsLoading = false;
    renderBrowseView();
  }
}

async function loadBrowseDetail(batchId: string, qaId: string) {
  browseDetailLoading = true;
  browseView = "detail";
  browseErrorMessage = null;
  renderBrowseView();

  try {
    browseDetailData = await invoke<QaRecordDetail>("get_batch_qa_record", {
      batchId,
      qaId
    });
  } catch (error) {
    browseDetailData = null;
    browseErrorMessage = `Load QA detail failed: ${String(error)}`;
    appendLog(`Browse QA detail failed: ${String(error)}`);
  } finally {
    browseDetailLoading = false;
    renderBrowseView();
  }
}

function currentRunResponse(): PipelineResponse | null {
  return outputState.kind === "run_success" ? outputState.response : null;
}

function isPipelineCancelledMessage(message: string): boolean {
  return message.toLowerCase().includes("pipeline canceled by user");
}

function failureTitle(phase: "preview" | "run"): string {
  return t(phase === "preview" ? "preview_failed" : "pipeline_failed");
}

function updateRunOutputDirButton() {
  const response = currentRunResponse();
  openRunOutputDirButton.textContent = t("action_open_run_output_dir");
  openRunOutputDirButton.disabled = !response;
}

function renderOutput() {
  setText("result-title", t("result_title"));
  setText("result-copy", t("result_copy"));
  setText("raw-output-summary", t("raw_json"));
  updateRunOutputDirButton();

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
    case "cancelled":
      resultMode.textContent = t("output_mode_cancelled");
      renderEmptyCard(outputState.message);
      renderActionButtons([]);
      output.textContent = outputState.message;
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
  setText("tab-topic-label", t("tab_topic"));
  setText("tab-settings-label", t("tab_settings"));
  setText("tab-browse-label", t("tab_browse"));
  setText("check-update-label", t("action_check_update"));
  setText("topic-tab-title", t("topic_tab_title"));
  setText("settings-tab-title", t("settings_tab_title"));
  setText("settings-basic-copy", t("settings_basic_copy"));
  setText("browse-tab-title", t("browse_tab_title"));
  setText("model-section-title", t("model_section_title"));
  setText("integration-section-title", t("integration_section_title"));
  setText("runtime-section-title", t("runtime_section_title"));
  setText("advanced-settings-summary", t("advanced_settings_summary"));
  setText("advanced-settings-copy", t("advanced_settings_copy"));
  setText("run-lock-banner", t("run_locked_hint"));
  setText("managed-run-mode-label", t("managed_run_mode"));
  setText("managed-run-mode-new-label", t("managed_run_mode_new"));
  setText("managed-run-mode-resume-latest-label", t("managed_run_mode_resume_latest"));
  setText("managed-run-mode-hint", t("managed_run_mode_hint"));
  setText("managed-run-pick-label", t("managed_run_mode_pick_label"));
  setText("managed-run-pick-hint", t("managed_run_mode_pick_hint"));
  syncManagedRunModeUi();
  setText("topic-prompt-label", t("topic_prompt"));
  setText("topic-tags-label", t("topic_tags"));
  setText("topic-tags-hint", t("topic_tags_hint"));
  setText("qa-mode-label", t("qa_mode"));
  setText("qa-mode-hint", t("qa_mode_hint"));
  setText("qa-mode-normal-label", t("qa_mode_normal"));
  setText("qa-mode-cot-label", t("qa_mode_cot"));
  setText("selected-tags-label", t("selected_tags"));
  setText("quick-tags-label", t("quick_tags"));
  setText("open-topic-field-selector", t("topic_field_selector"));
  setText("topic-field-selector-hint", t("topic_field_selector_hint"));
  setText("topic-field-modal-title", t("topic_field_modal_title"));
  setText("topic-field-modal-copy", t("topic_field_modal_copy"));
  setText("topic-field-primary-title", t("topic_field_primary_title"));
  setText("topic-field-detail-title", t("topic_field_detail_title"));
  setText("topic-field-pending-title", t("topic_field_pending_title"));
  setText("confirm-topic-field-selection", t("topic_field_add_selected"));
  setText("cancel-topic-field-selection", t("topic_field_cancel"));
  setText("close-topic-field-modal", t("topic_field_close"));
  setText("provider-preset-label", t("provider_preset"));
  setText("provider-preset-hint", t("provider_preset_hint"));
  setText("provider-label", t("provider"));
  setText("model-label", t("model"));
  setText("custom-model-label", t("custom_model"));
  setText("base-url-label", t("base_url"));
  setText("api-key-label", t("api_key"));
  setText("api-key-hint", t("api_key_hint"));
  setText("qa-upload-url-label", t("browse_upload_url"));
  setText("qa-upload-url-hint", t("browse_upload_url_hint"));
  setText("literature-api-url-label", t("literature_api_url"));
  setText("literature-api-auth-label", t("literature_api_auth"));
  setText("literature-api-auth-hint", t("literature_api_auth_hint"));
  setText("provider-preset-option-custom", t("preset_custom"));
  setText("provider-preset-option-qwen", t("preset_qwen_dashscope"));
  setText("provider-preset-option-deepseek", t("preset_deepseek"));
  setText("provider-preset-option-moonshot", t("preset_moonshot_kimi"));
  setText("provider-preset-option-zhipu", t("preset_zhipu_glm"));
  setText("provider-preset-option-minimax", t("preset_minimax"));
  setText("provider-preset-option-hunyuan", t("preset_tencent_hunyuan"));
  setText("provider-preset-option-qianfan", t("preset_baidu_qianfan"));
  setText("provider-preset-option-stub", t("preset_stub_local"));
  setText("target-count-label", t("target_count"));
  setText("plan-limit-label", t("plan_limit"));
  setText("shard-size-label", t("shard_size"));
  setText("batch-size-label", t("batch_size"));
  setText("max-in-flight-label", t("max_in_flight"));
  setText("max-retries-label", t("max_retries"));
  setText("timeout-secs-label", t("timeout_secs"));
  setText("resume-existing-label", t("resume_existing"));
  setText("result-title", t("result_title"));
  setText("run-logs-title", t("run_logs_title"));
  setText("run-stats-title", t("run_stats_title"));
  setText("export-logs", t("action_export_logs"));
  setText("browse-batches-title", t("browse_batches_title"));
  for (const button of fieldHelpButtons) {
    button.title = t("field_help_button");
    button.setAttribute("aria-label", t("field_help_button"));
  }
  customModelInput.placeholder = currentLang === "zh" ? "例如 glm-5.1" : "For example: glm-5.1";
  syncModelOptions(providerPresetInput.value as ProviderPresetId);
  setText("browse-questions-title", t("browse_questions_title"));
  setText("browse-detail-title", t("browse_detail_title"));
  updateRunButtonUi();
  addTopicTagButton.textContent = t("add_tag");
  topicTagInput.placeholder = t("custom_tag_placeholder");
  qaUploadUrlInput.placeholder = "https://example.com/qa/import";
  literatureApiUrlInput.placeholder = "https://example.com/literature/api";
  updateApiKeyVisibilityUi();
  const logPlaceholderKey = findMatchingTranslationKey(logs.textContent, [
    "no_run",
    "waiting_events"
  ]);
  if (logPlaceholderKey) {
    logs.textContent = t(logPlaceholderKey);
  }
  updateRuntimeConstraintHint();
  setStatus(currentStatus, currentStatus !== "idle");
  renderProgressSnapshot(lastPipelineProgressEvent);
  setCurrentTab(currentTab);
  renderTopicTags();
  renderTopicFieldModal();
  renderSetupSummary();
  renderFirstLaunchModal();
  renderOutput();
  renderBrowseView();
}

function readNumber(input: HTMLInputElement): number {
  return Number.parseInt(input.value, 10);
}

function defaultNumberValue(input: HTMLInputElement): number {
  const value = Number.parseInt(input.defaultValue, 10);
  return Number.isFinite(value) ? value : 1;
}

function readOptionalInteger(input: HTMLInputElement): number | null {
  const trimmed = input.value.trim();
  if (!trimmed) {
    return null;
  }

  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) ? value : null;
}

function setNumberValueIfNeeded(input: HTMLInputElement, value: number) {
  const next = String(value);
  if (input.value !== next) {
    input.value = next;
  }
}

function updateRuntimeConstraintHint() {
  runtimeConstraintHint.textContent = t(
    currentQaMode() === "cot" ? "runtime_constraint_hint_cot" : "runtime_constraint_hint_normal"
  );
}

function syncRuntimeParameterInputBounds() {
  const targetValue = readOptionalInteger(targetCountInput) ?? defaultNumberValue(targetCountInput);
  const safeTarget = Math.max(
    1,
    currentQaMode() === "cot" ? Math.min(targetValue, COT_TARGET_COUNT_CAP) : targetValue
  );
  const shardCap =
    currentQaMode() === "cot" ? Math.min(safeTarget, COT_SAFE_SHARD_SIZE_CAP) : safeTarget;
  const currentShardValue = readOptionalInteger(shardSizeInput);
  const batchCap =
    currentQaMode() === "cot"
      ? 1
      : Math.max(1, Math.min(currentShardValue ?? shardCap, shardCap));

  targetCountInput.min = "1";
  targetCountInput.max = currentQaMode() === "cot" ? String(COT_TARGET_COUNT_CAP) : "";
  planLimitInput.min = "1";
  shardSizeInput.min = "1";
  shardSizeInput.max = String(Math.max(1, shardCap));
  batchSizeInput.min = "1";
  batchSizeInput.max = String(batchCap);
  maxInFlightInput.min = "1";
  maxInFlightInput.max = currentQaMode() === "cot" ? "1" : "";
  maxRetriesInput.min = "0";
  timeoutInput.min = "1";
}

function syncRuntimeParameterControlStates() {
  if (isPipelineBusyStatus(currentStatus)) {
    return;
  }

  const cotMode = currentQaMode() === "cot";
  const resumeMode = currentManagedRunMode() !== "new";
  batchSizeInput.disabled = cotMode;
  maxInFlightInput.disabled = cotMode;
  if (resumeMode) {
    resumeInput.checked = true;
  }
  resumeInput.disabled = resumeMode;
}

function syncManagedRunModeUi() {
  managedRunBanner.hidden = !managedResumeBatchId;
  managedRunModeCurrent.textContent = managedResumeBatchId
    ? formatMessage("managed_run_mode_exact_hint", managedResumeBatchLabel ?? managedResumeBatchId)
    : "";
  clearManagedResumeBatchButton.textContent = t("managed_run_mode_clear");
  renderManagedRunPicker();
}

function renderManagedRunPicker() {
  const options = [
    {
      value: "",
      label: browseBatches.length ? t("managed_run_mode_pick_placeholder") : t("managed_run_mode_pick_empty")
    },
    ...browseBatches.map((batch) => ({
      value: batch.id,
      label: `${batch.topicName || batch.name} · ${formatUpdatedAt(batch.updatedAtMs)}`
    }))
  ];

  managedRunPickInput.innerHTML = options
    .map(
      ({ value, label }) =>
        `<option value="${escapeHtml(value)}"${value === "" ? "" : ""}>${escapeHtml(label)}</option>`
    )
    .join("");
  managedRunPickInput.value = managedResumeBatchId ?? "";
  managedRunPickInput.disabled = currentStatus === "running" || currentStatus === "stopping" || browseBatches.length === 0;
}

function clearManagedResumeBatch(logChange = false) {
  managedResumeBatchId = null;
  managedResumeBatchLabel = null;
  managedRunModeNewInput.checked = true;
  managedRunModeResumeLatestInput.checked = false;
  syncManagedRunModeUi();
  syncRuntimeParameterControlStates();
  if (logChange) {
    appendLog(t("log_cleared_batch_task"));
  }
}

function normalizeRuntimeParameterInputs(commit = false) {
  const cotMode = currentQaMode() === "cot";
  const fallbackTarget = cotMode ? DEFAULT_COT_TARGET_COUNT : defaultNumberValue(targetCountInput);
  const fallbackShard = cotMode ? DEFAULT_COT_SHARD_SIZE : defaultNumberValue(shardSizeInput);
  const fallbackBatch = cotMode ? DEFAULT_COT_BATCH_SIZE : defaultNumberValue(batchSizeInput);
  const fallbackMaxInFlight = cotMode
    ? DEFAULT_COT_MAX_IN_FLIGHT
    : defaultNumberValue(maxInFlightInput);
  const fallbackPlanLimit = defaultNumberValue(planLimitInput);
  const fallbackMaxRetries = Math.max(0, defaultNumberValue(maxRetriesInput));
  const fallbackTimeout = defaultNumberValue(timeoutInput);

  let target = readOptionalInteger(targetCountInput);
  let planLimit = readOptionalInteger(planLimitInput);
  let shardSize = readOptionalInteger(shardSizeInput);
  let batchSize = readOptionalInteger(batchSizeInput);
  let maxInFlight = readOptionalInteger(maxInFlightInput);
  let maxRetries = readOptionalInteger(maxRetriesInput);
  let timeout = readOptionalInteger(timeoutInput);

  if (commit) {
    target ??= fallbackTarget;
    planLimit ??= fallbackPlanLimit;
    shardSize ??= fallbackShard;
    batchSize ??= fallbackBatch;
    maxInFlight ??= fallbackMaxInFlight;
    maxRetries ??= fallbackMaxRetries;
    timeout ??= fallbackTimeout;
  }

  if (target !== null) {
    target = Math.max(1, cotMode ? Math.min(target, COT_TARGET_COUNT_CAP) : target);
    setNumberValueIfNeeded(targetCountInput, target);
  }

  if (planLimit !== null) {
    planLimit = Math.max(1, planLimit);
    setNumberValueIfNeeded(planLimitInput, planLimit);
  }

  if (shardSize !== null) {
    const shardUpperBound = target !== null
      ? cotMode
        ? Math.min(target, COT_SAFE_SHARD_SIZE_CAP)
        : target
      : cotMode
        ? COT_SAFE_SHARD_SIZE_CAP
        : null;
    shardSize = Math.max(1, shardSize);
    if (shardUpperBound !== null) {
      shardSize = Math.min(shardSize, Math.max(1, shardUpperBound));
    }
    setNumberValueIfNeeded(shardSizeInput, shardSize);
  }

  if (batchSize !== null) {
    batchSize = cotMode ? 1 : Math.max(1, batchSize);
    if (!cotMode && shardSize !== null) {
      batchSize = Math.min(batchSize, Math.max(1, shardSize));
    }
    setNumberValueIfNeeded(batchSizeInput, batchSize);
  }

  if (maxInFlight !== null) {
    maxInFlight = cotMode ? 1 : Math.max(1, maxInFlight);
    setNumberValueIfNeeded(maxInFlightInput, maxInFlight);
  }

  if (maxRetries !== null) {
    maxRetries = Math.max(0, maxRetries);
    setNumberValueIfNeeded(maxRetriesInput, maxRetries);
  }

  if (timeout !== null) {
    timeout = Math.max(1, timeout);
    setNumberValueIfNeeded(timeoutInput, timeout);
  }

  syncRuntimeParameterInputBounds();
  updateRuntimeConstraintHint();
  syncRuntimeParameterControlStates();
}

async function showSettingHelp(helpKey: string) {
  const content = SETTING_HELP_CONTENT[currentLang][helpKey];
  if (!content) {
    return;
  }

  await message(content.body, {
    title: content.title,
    kind: "info"
  });
}

function isPipelineBusyStatus(statusValue: typeof currentStatus): boolean {
  return statusValue === "running" || statusValue === "stopping";
}

function runReadinessMissingKeys(): string[] {
  const missingKeys: string[] = [];

  if (!promptInput.value.trim()) {
    missingKeys.push("run_readiness_missing_prompt");
  }
  if (!providerPresetInput.value.trim()) {
    missingKeys.push("settings_checklist_missing_provider");
  }
  if (!currentModelValue()) {
    missingKeys.push("settings_checklist_missing_model");
  }
  if (providerInput.value === "openai-compatible" && !baseUrlInput.value.trim()) {
    missingKeys.push("settings_checklist_missing_base_url");
  }
  if (providerInput.value === "openai-compatible" && !apiKeyInput.value.trim()) {
    missingKeys.push("settings_checklist_missing_api_key");
  }

  return missingKeys;
}

function hasModelSettingsReady() {
  return runReadinessMissingKeys().every((key) =>
    ![
      "settings_checklist_missing_provider",
      "settings_checklist_missing_model",
      "settings_checklist_missing_base_url",
      "settings_checklist_missing_api_key"
    ].includes(key)
  );
}

function shouldShowFirstLaunchModal() {
  return window.localStorage.getItem(FIRST_LAUNCH_COMPLETED_KEY) !== "true";
}

function closeFirstLaunchModal() {
  firstLaunchModal.hidden = true;
  window.localStorage.setItem(FIRST_LAUNCH_COMPLETED_KEY, "true");
}

function renderFirstLaunchModal() {
  const cards = [
    {
      title: t("first_launch_step_settings_title"),
      copy: t("first_launch_step_settings_copy")
    },
    {
      title: t("first_launch_step_topic_title"),
      copy: t("first_launch_step_topic_copy")
    },
    {
      title: t("first_launch_step_browse_title"),
      copy: t("first_launch_step_browse_copy")
    }
  ];

  setText("first-launch-title", t("first_launch_title"));
  setText("first-launch-copy", t("first_launch_copy"));
  setText("first-launch-note-title", t("first_launch_note_title"));
  setText("first-launch-note-copy", t("first_launch_note_copy"));
  setText("first-launch-open-settings", t("first_launch_open_settings"));
  setText("first-launch-confirm", t("first_launch_start_now"));

  firstLaunchGrid.innerHTML = cards
    .map(
      ({ title, copy }) => `
        <article class="first-launch-card">
          <p class="first-launch-card-title">${escapeHtml(title)}</p>
          <p class="first-launch-card-copy">${escapeHtml(copy)}</p>
        </article>
      `
    )
    .join("");
}

function maybeShowFirstLaunchModal() {
  renderFirstLaunchModal();
  firstLaunchModal.hidden = !shouldShowFirstLaunchModal();
}

function isRunReady() {
  return runReadinessMissingKeys().length === 0;
}

function renderTopicQuickstart() {
  const topicReady = promptInput.value.trim().length > 0;
  const settingsReady = hasModelSettingsReady();
  const runReady = isRunReady();
  const steps = [
    {
      title: t("topic_quickstart_step_topic"),
      ready: topicReady,
      detail: t(topicReady ? "topic_quickstart_step_topic_ready" : "topic_quickstart_step_topic_pending")
    },
    {
      title: t("topic_quickstart_step_settings"),
      ready: settingsReady,
      detail: t(
        settingsReady ? "topic_quickstart_step_settings_ready" : "topic_quickstart_step_settings_pending"
      ),
      action: settingsReady
        ? ""
        : `<button class="secondary" type="button" data-open-tab="settings">${escapeHtml(t("topic_quickstart_open_settings"))}</button>`
    },
    {
      title: t("topic_quickstart_step_run"),
      ready: runReady,
      detail: t(runReady ? "topic_quickstart_step_run_ready" : "topic_quickstart_step_run_pending")
    }
  ];

  topicQuickstart.innerHTML = `
    <div class="topic-quickstart-header">
      <div>
        <p class="topic-quickstart-title">${escapeHtml(t("topic_quickstart_title"))}</p>
        <p class="topic-quickstart-copy">${escapeHtml(t("topic_quickstart_copy"))}</p>
      </div>
    </div>
    <div class="topic-quickstart-grid">
      ${steps
        .map(
          ({ title, ready, detail, action }) => `
            <article class="topic-quickstart-step" data-ready="${ready ? "true" : "false"}">
              <div class="topic-quickstart-step-header">
                <p class="topic-quickstart-step-title">${escapeHtml(title)}</p>
                <span class="topic-quickstart-step-status" data-ready="${ready ? "true" : "false"}">${escapeHtml(
                  t(ready ? "settings_checklist_done" : "settings_checklist_pending")
                )}</span>
              </div>
              <p class="topic-quickstart-step-detail">${escapeHtml(detail)}</p>
              ${action ?? ""}
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRunReadinessBanner() {
  const missingLabels = runReadinessMissingKeys().map((key) => t(key));
  const ready = missingLabels.length === 0;
  const needsSettingsShortcut = runReadinessMissingKeys().some((key) =>
    [
      "settings_checklist_missing_provider",
      "settings_checklist_missing_model",
      "settings_checklist_missing_base_url",
      "settings_checklist_missing_api_key"
    ].includes(key)
  );

  runReadinessBanner.innerHTML = `
    <div class="run-readiness-copy">
      <div class="run-readiness-header">
        <p class="run-readiness-title">${escapeHtml(t("run_readiness_title"))}</p>
        <span class="run-readiness-status" data-ready="${ready ? "true" : "false"}">${escapeHtml(
          t(ready ? "run_readiness_ready" : "run_readiness_pending")
        )}</span>
      </div>
      <p class="run-readiness-detail">${escapeHtml(
        ready
          ? t("run_readiness_ready_copy")
          : formatMessage("run_readiness_pending_copy", missingLabels.join(currentLang === "zh" ? "、" : ", "))
      )}</p>
    </div>
    ${
      ready || !needsSettingsShortcut
        ? ""
        : `<button class="secondary" type="button" data-open-tab="settings">${escapeHtml(t("run_readiness_open_settings"))}</button>`
    }
  `;
  runReadinessBanner.dataset.ready = ready ? "true" : "false";
}

function updateRunButtonUi() {
  runButton.dataset.intent = currentStatus === "running" || currentStatus === "stopping" ? "stop" : "run";
  if (currentStatus === "running") {
    runButton.textContent = t("stop_run");
  } else if (currentStatus === "stopping") {
    runButton.textContent = t("stop_requested");
  } else {
    runButton.textContent = t("run_pipeline");
  }

  runButton.disabled =
    currentStatus === "previewing" ||
    currentStatus === "updating" ||
    currentStatus === "stopping" ||
    (currentStatus !== "running" && !isRunReady());
}

function buildLogExportFileName() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ];

  return `distill-studio-run-log-${parts.join("")}.txt`;
}

async function exportLogs() {
  const placeholderKey = findMatchingTranslationKey(logs.textContent, ["no_run", "waiting_events"]);
  if (placeholderKey || !logs.textContent?.trim()) {
    appendLog(t("log_export_empty"));
    return;
  }

  try {
    const fileName = buildLogExportFileName();
    const blob = new Blob([`${logs.textContent.trimEnd()}\n`], {
      type: "text/plain;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    appendLog(formatMessage("log_exported_logs", fileName));
  } catch (error) {
    appendLog(`${t("log_export_failed")}: ${String(error)}`);
  }
}

function setControlsLocked(locked: boolean) {
  for (const control of lockableControls) {
    control.disabled = locked;
  }
  runLockBanner.hidden = !locked;
  syncRuntimeParameterControlStates();
}

function formatProgressSummary(payload: PipelineProgressEvent | null): string {
  if (!payload?.shardCount || !payload.shardIndex) {
    return payload ? `${payload.currentStep} / ${payload.totalSteps}` : "0 / 5";
  }

  return currentLang === "zh"
    ? `分片 ${payload.shardIndex} / ${payload.shardCount}`
    : `Shard ${payload.shardIndex} / ${payload.shardCount}`;
}

function formatProgressDetail(payload: PipelineProgressEvent | null): string {
  if (!payload?.shardCount || !payload.shardIndex || !payload.shardItemTotal) {
    return "";
  }

  const shardCompleted = payload.shardItemCompleted ?? 0;
  const totalGenerated = payload.totalGenerated ?? 0;
  const targetCount = payload.targetCount ?? 0;

  return currentLang === "zh"
    ? `当前 shard ${formatCount(shardCompleted)} / ${formatCount(payload.shardItemTotal)} · 总计 ${formatCount(totalGenerated)} / ${formatCount(targetCount)}`
    : `Current shard ${formatCount(shardCompleted)} / ${formatCount(payload.shardItemTotal)} · Total ${formatCount(totalGenerated)} / ${formatCount(targetCount)}`;
}

function renderProgressSnapshot(payload: PipelineProgressEvent | null) {
  progressMeta.textContent = formatProgressSummary(payload);
  progressDetail.textContent = formatProgressDetail(payload);
  renderRunStats();
}

function setProgressFill(percent: number) {
  const safePercent = Math.max(0, Math.min(100, percent));
  progressFill.style.width = `${safePercent}%`;
}

function updateProgressFromEvent(payload: PipelineProgressEvent) {
  const mergedPayload: PipelineProgressEvent =
    lastPipelineProgressEvent === null
      ? payload
      : {
          ...lastPipelineProgressEvent,
          ...payload,
          runtimeKind: payload.runtimeKind ?? lastPipelineProgressEvent.runtimeKind ?? null,
          retryAttempt: payload.retryAttempt ?? lastPipelineProgressEvent.retryAttempt ?? null,
          retryLimit: payload.retryLimit ?? lastPipelineProgressEvent.retryLimit ?? null,
          errorMessage: payload.errorMessage ?? lastPipelineProgressEvent.errorMessage ?? null,
          shardIndex: payload.shardIndex ?? lastPipelineProgressEvent.shardIndex ?? null,
          shardCount: payload.shardCount ?? lastPipelineProgressEvent.shardCount ?? null,
          shardItemCompleted:
            payload.shardItemCompleted ?? lastPipelineProgressEvent.shardItemCompleted ?? null,
          shardItemTotal: payload.shardItemTotal ?? lastPipelineProgressEvent.shardItemTotal ?? null,
          totalGenerated: payload.totalGenerated ?? lastPipelineProgressEvent.totalGenerated ?? null,
          targetCount: payload.targetCount ?? lastPipelineProgressEvent.targetCount ?? null
        };
  lastPipelineProgressEvent = mergedPayload;
  updateRunStatsFromEvent(payload);

  if (
    mergedPayload.stage === "generate" &&
    mergedPayload.targetCount &&
    mergedPayload.totalGenerated !== null &&
    mergedPayload.totalGenerated !== undefined
  ) {
    const generatedRatio =
      mergedPayload.targetCount <= 0 ? 0 : mergedPayload.totalGenerated / mergedPayload.targetCount;
    setProgressFill(((3 + generatedRatio) / mergedPayload.totalSteps) * 100);
  } else {
    const safeTotal = mergedPayload.totalSteps <= 0 ? 1 : mergedPayload.totalSteps;
    setProgressFill((mergedPayload.currentStep / safeTotal) * 100);
  }

  renderProgressSnapshot(mergedPayload);
}

function setStatus(nextStatus: "idle" | "previewing" | "running" | "stopping" | "updating", busy = false) {
  currentStatus = nextStatus;
  status.textContent = t(`status_${nextStatus}`);
  status.dataset.busy = busy ? "true" : "false";
  checkUpdateButton.disabled = busy;
  setControlsLocked(isPipelineBusyStatus(nextStatus));
  updateRunButtonUi();
}

function appendLog(line: string) {
  const now = new Date().toLocaleTimeString();
  const next = `[${now}] ${line}`;
  logs.textContent = matchesAnyTranslation(logs.textContent, ["no_run", "waiting_events"])
    ? next
    : `${logs.textContent}\n${next}`;
  logs.scrollTop = logs.scrollHeight;
}

function resetTelemetry() {
  lastPipelineProgressEvent = null;
  logs.textContent = t("waiting_events");
  setProgressFill(0);
  resetRunStats();
  renderProgressSnapshot(null);
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
  normalizeRuntimeParameterInputs(true);

  const request: PipelineFormRequest = {
    prompt: promptInput.value.trim(),
    topicTags: [...topicTags],
    qaMode: currentQaMode(),
    targetCount: readNumber(targetCountInput),
    planLimit: readNumber(planLimitInput),
    outputDir: MANAGED_OUTPUT_DIR,
    provider: providerInput.value,
    model: currentModelValue(),
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
    resume: resumeInput.checked,
    managedRunMode: currentManagedRunMode(),
    managedRunBatchId: managedResumeBatchId,
    qaUploadUrl: currentQaUploadUrl() || null,
    literatureApiUrl: literatureApiUrlInput.value.trim() || null,
    literatureApiAuthToken: literatureApiAuthInput.value.trim() || null
  };

  return request;
}

function validateRequest(request: PipelineFormRequest): ValidationIssueKey[] {
  const issues: ValidationIssueKey[] = [];

  if (!request.prompt) {
    issues.push("validation_issue_prompt_required");
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
  if (!Number.isInteger(request.targetCount) || request.targetCount <= 0) {
    issues.push("validation_issue_target_count_invalid");
  }
  if (!Number.isInteger(request.planLimit) || request.planLimit <= 0) {
    issues.push("validation_issue_plan_limit_invalid");
  }
  if (!Number.isInteger(request.shardSize) || request.shardSize <= 0) {
    issues.push("validation_issue_shard_size_invalid");
  }
  if (!Number.isInteger(request.batchSize) || request.batchSize <= 0) {
    issues.push("validation_issue_batch_size_invalid");
  }
  if (!Number.isInteger(request.maxInFlight) || request.maxInFlight <= 0) {
    issues.push("validation_issue_max_in_flight_invalid");
  }
  if (!Number.isInteger(request.maxRetries) || request.maxRetries < 0) {
    issues.push("validation_issue_max_retries_invalid");
  }
  if (!Number.isInteger(request.requestTimeoutSecs) || request.requestTimeoutSecs <= 0) {
    issues.push("validation_issue_timeout_invalid");
  }

  return issues;
}

function applyRequest(request: PipelineFormRequest) {
  promptInput.value = request.prompt;
  topicTags = [...request.topicTags];
  qaModeNormalInput.checked = (request.qaMode ?? "normal") !== "cot";
  qaModeCotInput.checked = (request.qaMode ?? "normal") === "cot";
  targetCountInput.value = String(request.targetCount);
  planLimitInput.value = String(request.planLimit);
  providerInput.value = request.provider;
  baseUrlInput.value = request.baseUrl ?? "";
  apiKeyInput.value = request.apiKey ?? "";
  qaUploadUrlInput.value = request.qaUploadUrl ?? "";
  literatureApiUrlInput.value = request.literatureApiUrl ?? "";
  literatureApiAuthInput.value = request.literatureApiAuthToken ?? "";
  shardSizeInput.value = String(request.shardSize);
  batchSizeInput.value = String(request.batchSize);
  maxInFlightInput.value = String(request.maxInFlight);
  maxRetriesInput.value = String(request.maxRetries);
  timeoutInput.value = String(request.requestTimeoutSecs);
  resumeInput.checked = request.resume;
  managedResumeBatchId = request.managedRunMode === "resume-batch" ? request.managedRunBatchId ?? null : null;
  managedResumeBatchLabel = null;
  managedRunModeNewInput.checked = (request.managedRunMode ?? "new") === "new";
  managedRunModeResumeLatestInput.checked = (request.managedRunMode ?? "new") !== "new";
  const presetId = detectProviderPreset({
    provider: request.provider,
    baseUrl: request.baseUrl
  });
  providerPresetInput.value = presetId;
  syncProviderFieldVisibility(presetId);
  syncModelOptions(presetId, request.model);
  normalizeRuntimeParameterInputs(true);
  syncManagedRunModeUi();
  renderTopicTags();
  renderSetupSummary();
}

void listen<PipelineProgressEvent>("pipeline-progress", (event) => {
  const payload = event.payload;
  const stageKey = `stage_${payload.stage.replace(/-/g, "_")}`;
  const statusKey = `event_${payload.status.replace(/-/g, "_")}`;
  updateProgressFromEvent(payload);
  appendLog(`${t(stageKey)} [${t(statusKey)}] ${payload.message}`);
});

void listen<AppUpdateProgressEvent>("app-update-progress", (event) => {
  appendLog(event.payload.message);
});

async function persistCurrentConfig(silent = true) {
  try {
    await invoke("save_local_pipeline_config", {
      profileName: DEFAULT_PROFILE_NAME,
      request: collectRequest()
    });
    if (!silent) {
      appendLog(t("log_saved_config"));
    }
  } catch (error) {
    appendLog(`${t("log_save_failed")}: ${String(error)}`);
  }
}

function scheduleAutoSave() {
  if (!autoSaveEnabled) {
    return;
  }

  if (autoSaveTimer !== null) {
    window.clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = null;
    void persistCurrentConfig(true);
  }, AUTO_SAVE_DELAY_MS);
}

async function loadConfig(auto = false) {
  try {
    const request = await invoke<PipelineFormRequest | null>("load_local_pipeline_config", {
      profileName: DEFAULT_PROFILE_NAME
    });
    if (!request) {
      return;
    }
    const stubMigratedRequest = migrateLegacyStubRequest(request);
    const normalizedRequest = normalizeLoadedCotRequest(stubMigratedRequest);
    applyRequest(normalizedRequest);
    if (normalizedRequest !== request) {
      if (stubMigratedRequest !== request) {
        appendLog(t("log_stub_migrated"));
      }
      if (normalizedRequest !== stubMigratedRequest) {
        appendLog(t("log_cot_runtime_normalized"));
      }
      await invoke("save_local_pipeline_config", {
        profileName: DEFAULT_PROFILE_NAME,
        request: normalizedRequest
      });
    }
    appendLog(
      formatMessage(
        auto ? "log_loaded_startup_profile" : "log_loaded_manual_profile",
        DEFAULT_PROFILE_NAME
      )
    );
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

openTopicFieldSelectorButton.addEventListener("click", () => {
  openTopicFieldModal();
});

topicFieldModal.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.dataset.modalClose === "true") {
    closeTopicFieldModal();
    return;
  }

  const primaryButton = target.closest<HTMLElement>("[data-field-primary]");
  if (primaryButton?.dataset.fieldPrimary) {
    topicFieldModalPrimaryId = primaryButton.dataset.fieldPrimary;
    renderTopicFieldModal();
    return;
  }

  const fieldButton = target.closest<HTMLElement>("[data-field-tag]");
  if (fieldButton?.dataset.fieldTag) {
    togglePendingTopicFieldTag(fieldButton.dataset.fieldTag);
    return;
  }

  const pendingButton = target.closest<HTMLElement>("[data-pending-tag]");
  if (pendingButton?.dataset.pendingTag) {
    togglePendingTopicFieldTag(pendingButton.dataset.pendingTag);
  }
});

closeTopicFieldModalButton.addEventListener("click", () => {
  closeTopicFieldModal();
});

cancelTopicFieldSelectionButton.addEventListener("click", () => {
  closeTopicFieldModal();
});

confirmTopicFieldSelectionButton.addEventListener("click", () => {
  for (const tag of pendingTopicFieldTags) {
    addTopicTag(tag);
  }
  closeTopicFieldModal();
});

addTopicTagButton.addEventListener("click", () => {
  addTopicTag(topicTagInput.value);
  topicTagInput.value = "";
});

for (const button of fieldHelpButtons) {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const helpKey = button.dataset.helpKey;
    if (!helpKey) {
      return;
    }
    void showSettingHelp(helpKey);
  });
}

topicTagInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addTopicTag(topicTagInput.value);
    topicTagInput.value = "";
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !topicFieldModal.hidden) {
    closeTopicFieldModal();
  }
});

qaModeNormalInput.addEventListener("change", () => {
  normalizeRuntimeParameterInputs(true);
  scheduleAutoSave();
});
qaModeCotInput.addEventListener("change", () => {
  if (qaModeCotInput.checked) {
    applyQaModeDefaults("cot");
  } else {
    normalizeRuntimeParameterInputs(true);
  }
  scheduleAutoSave();
});

managedRunModeNewInput.addEventListener("change", () => {
  clearManagedResumeBatch(false);
  scheduleAutoSave();
});

managedRunModeResumeLatestInput.addEventListener("change", () => {
  if (managedRunModeResumeLatestInput.checked) {
    managedResumeBatchId = null;
    managedResumeBatchLabel = null;
    appendLog(t("log_resuming_latest_task"));
  }
  syncManagedRunModeUi();
  syncRuntimeParameterControlStates();
  scheduleAutoSave();
});

managedRunPickInput.addEventListener("change", () => {
  const batchId = managedRunPickInput.value;
  if (!batchId) {
    return;
  }

  void resumeBrowseBatch(batchId);
});

clearManagedResumeBatchButton.addEventListener("click", () => {
  clearManagedResumeBatch(true);
  scheduleAutoSave();
});

providerPresetInput.addEventListener("change", () => {
  const presetId = providerPresetInput.value as ProviderPresetId;
  applyProviderPreset(presetId, presetId !== "custom");
  scheduleAutoSave();
});

providerInput.addEventListener("change", () => {
  syncProviderPresetInput();
  renderSetupSummary();
  scheduleAutoSave();
});
modelInput.addEventListener("change", () => {
  const usesCustomModel = modelInput.value === CUSTOM_MODEL_VALUE;
  customModelField.hidden = !usesCustomModel;
  if (usesCustomModel) {
    customModelInput.focus();
  } else {
    customModelInput.value = "";
  }
  syncProviderPresetInput();
  renderSetupSummary();
  scheduleAutoSave();
});
customModelInput.addEventListener("input", () => {
  renderSetupSummary();
  scheduleAutoSave();
});
baseUrlInput.addEventListener("input", () => {
  syncProviderPresetInput();
  renderSetupSummary();
  scheduleAutoSave();
});
apiKeyInput.addEventListener("input", () => {
  renderSetupSummary();
  scheduleAutoSave();
});
qaUploadUrlInput.addEventListener("input", () => {
  renderBrowseView();
  scheduleAutoSave();
});
literatureApiUrlInput.addEventListener("input", scheduleAutoSave);
literatureApiAuthInput.addEventListener("input", scheduleAutoSave);
toggleApiKeyVisibilityButton.addEventListener("click", () => {
  apiKeyVisible = !apiKeyVisible;
  updateApiKeyVisibilityUi();
});
promptInput.addEventListener("input", () => {
  renderSetupSummary();
  scheduleAutoSave();
});
targetCountInput.addEventListener("input", () => {
  normalizeRuntimeParameterInputs(false);
  renderSetupSummary();
  scheduleAutoSave();
});
planLimitInput.addEventListener("input", () => {
  normalizeRuntimeParameterInputs(false);
  renderSetupSummary();
  scheduleAutoSave();
});
shardSizeInput.addEventListener("input", () => {
  normalizeRuntimeParameterInputs(false);
  scheduleAutoSave();
});
batchSizeInput.addEventListener("input", () => {
  normalizeRuntimeParameterInputs(false);
  scheduleAutoSave();
});
maxInFlightInput.addEventListener("input", () => {
  normalizeRuntimeParameterInputs(false);
  scheduleAutoSave();
});
maxRetriesInput.addEventListener("input", () => {
  normalizeRuntimeParameterInputs(false);
  scheduleAutoSave();
});
timeoutInput.addEventListener("input", () => {
  normalizeRuntimeParameterInputs(false);
  scheduleAutoSave();
});
targetCountInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
planLimitInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
shardSizeInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
batchSizeInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
maxInFlightInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
maxRetriesInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
timeoutInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
resumeInput.addEventListener("change", scheduleAutoSave);

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

browseContent.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionButton = target.closest<HTMLElement>("[data-batch-action]");
  const action = actionButton?.dataset.batchAction;
  const actionBatchId = actionButton?.dataset.batchId;
  if (action && actionBatchId) {
    if (action === "continue") {
      void resumeBrowseBatch(actionBatchId);
      return;
    }
    if (action === "open") {
      browseDetailData = null;
      void loadBrowseQaPage(actionBatchId, 1);
      return;
    }
    if (action === "delete") {
      void deleteBrowseBatch(actionBatchId);
      return;
    }
    if (action === "upload") {
      void uploadBrowseBatch(actionBatchId);
      return;
    }
  }

  const batchButton = target.closest<HTMLElement>("[data-batch-id]");
  const batchId = batchButton?.dataset.batchId;
  if (batchId) {
    if (batchId === browseSelectedBatchId && browsePageData) {
      browseView = "questions";
      renderBrowseView();
      return;
    }

    browseDetailData = null;
    void loadBrowseQaPage(batchId, 1);
    return;
  }

  const qaButton = target.closest<HTMLElement>("[data-qa-id]");
  const qaId = qaButton?.dataset.qaId;
  if (qaId) {
    if (!browseSelectedBatchId) {
      return;
    }

    if (qaId === browseDetailData?.item.id && browseView === "detail") {
      return;
    }

    void loadBrowseDetail(browseSelectedBatchId, qaId);
    return;
  }

  if (!browsePageData || !browseSelectedBatchId) {
    return;
  }

  const button = target.closest<HTMLButtonElement>("button");
  if (!button || button.disabled) {
    return;
  }

  if (button.id === "browse-prev-page" && browsePageData.page > 1) {
    void loadBrowseQaPage(browseSelectedBatchId, browsePageData.page - 1);
  }

  if (button.id === "browse-next-page" && browsePageData.page < browsePageData.totalPages) {
    void loadBrowseQaPage(browseSelectedBatchId, browsePageData.page + 1);
  }
});

browseBackButton.addEventListener("click", () => {
  browseErrorMessage = null;
  if (browseView === "detail") {
    browseView = "questions";
  } else if (browseView === "questions") {
    browseView = "batches";
  }

  renderBrowseView();
});

runReadinessBanner.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest<HTMLElement>("[data-open-tab]");
  const nextTab = button?.dataset.openTab as UiTab | undefined;
  if (nextTab) {
    setCurrentTab(nextTab);
  }
});

topicQuickstart.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest<HTMLElement>("[data-open-tab]");
  const nextTab = button?.dataset.openTab as UiTab | undefined;
  if (nextTab) {
    setCurrentTab(nextTab);
  }
});

firstLaunchModal.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.dataset.firstLaunchClose === "true") {
    closeFirstLaunchModal();
  }
});

firstLaunchOpenSettingsButton.addEventListener("click", () => {
  closeFirstLaunchModal();
  setCurrentTab("settings");
});

firstLaunchConfirmButton.addEventListener("click", () => {
  closeFirstLaunchModal();
});

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
      await message(`${t("log_update_not_available")} (${response.currentVersion})`, {
        title: t("action_check_update"),
        kind: "info"
      });
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

exportLogsButton.addEventListener("click", () => {
  void exportLogs();
});

openRunOutputDirButton.addEventListener("click", async () => {
  const response = currentRunResponse();
  if (!response) {
    return;
  }

  await openResultPath(response.outputDir);
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
  if (currentStatus === "running") {
    setStatus("stopping", true);
    appendLog(t("log_stop_requested"));

    try {
      const stopped = await invoke<boolean>("stop_pipeline");
      if (!stopped) {
        appendLog(t("log_stop_not_running"));
        setStatus("idle", false);
      }
    } catch (error) {
      appendLog(`${t("log_stop_failed")}: ${String(error)}`);
      setStatus("running", true);
    }
    return;
  }

  if (currentStatus === "stopping" || currentStatus === "updating" || currentStatus === "previewing") {
    return;
  }

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
  beginRunStats(request);
  startRunStatsTicker();
  renderRunStats();
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
    browseSelectedBatchId = null;
    void loadBrowseBatches();
    appendLog(formatMessage("log_pipeline_completed", response.datasetPath));
  } catch (error) {
    const message = String(error);
    if (isPipelineCancelledMessage(message)) {
      outputState = { kind: "cancelled", message: t("pipeline_cancelled") };
      renderOutput();
      appendLog(t("log_pipeline_cancelled"));
    } else {
      outputState = { kind: "error", phase: "run", message };
      renderOutput();
      appendLog(`${t("pipeline_failed")}: ${message}`);
    }
  } finally {
    stopRunStatsTicker();
    renderRunStats();
    setStatus("idle", false);
  }
});

async function initializeApp() {
  applyTranslations();
  syncProviderPresetInput();
  normalizeRuntimeParameterInputs(true);
  await loadConfig(true);
  normalizeRuntimeParameterInputs(true);
  autoSaveEnabled = true;
  renderRunStats();
  void loadBrowseBatches();
  maybeShowFirstLaunchModal();
}

void initializeApp();
