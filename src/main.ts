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
  keptCount: number;
  totalCount: number;
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
  | "validation_issue_api_key_required";

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
  | { kind: "validation_error"; issues: ValidationIssueKey[] }
  | { kind: "error"; phase: "preview" | "run"; message: string };

const LANG_STORAGE_KEY = "distill-studio.lang";
const DEFAULT_PROFILE_NAME = "default";
const AUTO_SAVE_DELAY_MS = 600;
const MANAGED_OUTPUT_DIR = "__managed__";
const CUSTOM_MODEL_VALUE = "__custom__";
const DEFAULT_COT_TARGET_COUNT = 10;
const DEFAULT_COT_SHARD_SIZE = 10;
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
    browse_tab_title: "浏览QA",
    model_section_title: "模型配置",
    integration_section_title: "平台接口",
    runtime_section_title: "运行参数",
    run_status_title: "运行状态",
    run_logs_title: "运行日志",
    browse_batches_title: "生成批次",
    browse_batches_empty: "还没有 QA 生成批次。",
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
    browse_updated_at: "更新时间",
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
    log_stub_migrated: "检测到旧版 Stub 配置，已自动切换到 Qwen / DashScope，请填写真实 API 密钥后测试。",
    log_cot_runtime_normalized: "检测到旧版 CoT 运行参数，已自动调整为单条安全模式。",
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
    validation_issue_model_required: "模型名称不能为空。",
    validation_issue_base_url_required: "使用 openai-compatible 时必须填写 Base URL。",
    validation_issue_api_key_required: "使用 openai-compatible 时必须填写 API 密钥。",
    stage_bootstrap: "初始化",
    stage_plan: "规划",
    stage_literature: "文献增强",
    stage_write_config: "写配置",
    stage_generate: "生成",
    stage_pack: "打包",
    stage_complete: "完成",
    event_running: "进行中",
    event_completed: "已完成",
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
    browse_tab_title: "Browse QA",
    model_section_title: "Model Configuration",
    integration_section_title: "Platform Integrations",
    runtime_section_title: "Runtime Parameters",
    run_status_title: "Run Status",
    run_logs_title: "Run Logs",
    browse_batches_title: "Batch Runs",
    browse_batches_empty: "No QA generation batches yet.",
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
    browse_updated_at: "Updated",
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
    log_stub_migrated: "Legacy Stub config detected. Switched to Qwen / DashScope. Add a real API key before testing.",
    log_cot_runtime_normalized: "Legacy CoT runtime settings detected. Switched to safe single-item mode.",
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
    validation_issue_model_required: "Model name is required.",
    validation_issue_base_url_required: "Base URL is required for openai-compatible provider.",
    validation_issue_api_key_required: "API key is required for openai-compatible provider.",
    stage_bootstrap: "Bootstrap",
    stage_plan: "Plan",
    stage_literature: "Literature",
    stage_write_config: "Write Config",
    stage_generate: "Generate",
    stage_pack: "Pack",
    stage_complete: "Complete",
    event_running: "running",
    event_completed: "completed",
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
let currentStatus: "idle" | "previewing" | "running" | "updating" = "idle";
let outputState: OutputState = { kind: "idle" };
let topicTags: string[] = [];
let topicFieldModalPrimaryId = RESEARCH_FIELD_TAXONOMY[0]?.id ?? null;
let pendingTopicFieldTags: string[] = [];
let apiKeyVisible = false;
let autoSaveTimer: number | null = null;
let autoSaveEnabled = false;
let browseBatches: QaBatchSummary[] = [];
let browsePageData: QaRecordPage | null = null;
let browseDetailData: QaRecordDetail | null = null;
let browseSelectedBatchId: string | null = null;
let browseLoading = false;
let browseView: BrowseView = "batches";
let browseQuestionsLoading = false;
let browseDetailLoading = false;
let browseErrorMessage: string | null = null;

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
        <section class="tab-panel" data-tab-panel="topic">
        <div class="tab-copy-block">
          <p class="panel-title" id="topic-tab-title">Research Topic</p>
        </div>
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
              <button id="confirm-topic-field-selection" class="secondary" type="button">Add Selected Tags</button>
              <button id="cancel-topic-field-selection" type="button">Cancel</button>
            </div>
          </div>
        </div>
        <section class="topic-run-panel">
          <div class="topic-run-actions">
            <button id="run" class="secondary run-primary" type="button">Run pipeline</button>
          </div>
          <section class="topic-log-panel">
            <div class="panel-header">
              <p class="panel-title run-status-title" id="run-logs-title">Run Logs</p>
              <div class="progress-meta" id="progress-meta">0 / 5</div>
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
        </div>
        <div class="section-block">
          <p class="section-title" id="model-section-title">Model Configuration</p>
        </div>
        <div class="grid three">
          <label>
            <span id="provider-preset-label">Model Provider</span>
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
            <span id="provider-label">Adapter Type</span>
            <select id="provider">
              <option value="openai-compatible" selected>openai-compatible</option>
              <option value="stub" hidden>stub</option>
            </select>
          </label>
          <label>
            <span id="model-label">Model</span>
            <select id="model"></select>
          </label>
          <label id="custom-model-field" hidden>
            <span id="custom-model-label">Custom Model</span>
            <input id="custom-model" placeholder="例如 glm-5.1" />
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
        <div class="section-block">
          <p class="section-title" id="integration-section-title">Platform Integrations</p>
        </div>
        <div class="grid two">
          <label>
            <span id="qa-upload-url-label">QA Upload URL</span>
            <input id="qa-upload-url" placeholder="https://example.com/qa/import" />
            <small class="field-hint" id="qa-upload-url-hint">
              Set the QA evaluation platform URL to enable batch upload.
            </small>
          </label>
        </div>
        <div class="grid two">
          <label>
            <span id="literature-api-url-label">Literature API URL</span>
            <input id="literature-api-url" placeholder="https://example.com/literature/api" />
          </label>
          <label>
            <span id="literature-api-auth-label">Literature API Auth Token</span>
            <input id="literature-api-auth" type="password" />
            <small class="field-hint" id="literature-api-auth-hint">
              Authentication token for the literature API, stored in local settings.
            </small>
          </label>
        </div>
        <div class="section-block">
          <p class="section-title" id="runtime-section-title">Runtime Parameters</p>
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
  </main>
`;

const promptInput = document.querySelector<HTMLTextAreaElement>("#prompt");
const langSelect = document.querySelector<HTMLSelectElement>("#lang-select");
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tab]"));
const tabPanels = Array.from(document.querySelectorAll<HTMLElement>("[data-tab-panel]"));
const checkUpdateButton = document.querySelector<HTMLButtonElement>("#check-update");
const runButton = document.querySelector<HTMLButtonElement>("#run");
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
const baseUrlInput = document.querySelector<HTMLInputElement>("#base-url");
const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key");
const qaUploadUrlInput = document.querySelector<HTMLInputElement>("#qa-upload-url");
const literatureApiUrlInput = document.querySelector<HTMLInputElement>("#literature-api-url");
const literatureApiAuthInput = document.querySelector<HTMLInputElement>("#literature-api-auth");
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
  !checkUpdateButton ||
  !runButton ||
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
  !baseUrlInput ||
  !apiKeyInput ||
  !qaUploadUrlInput ||
  !literatureApiUrlInput ||
  !literatureApiAuthInput ||
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

function applyQaModeDefaults(qaMode: "normal" | "cot") {
  if (qaMode !== "cot") {
    return;
  }

  targetCountInput.value = String(DEFAULT_COT_TARGET_COUNT);
  shardSizeInput.value = String(DEFAULT_COT_SHARD_SIZE);
  batchSizeInput.value = String(DEFAULT_COT_BATCH_SIZE);
  maxInFlightInput.value = String(DEFAULT_COT_MAX_IN_FLIGHT);
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

  const nextTargetCount = Math.min(request.targetCount || DEFAULT_COT_TARGET_COUNT, DEFAULT_COT_TARGET_COUNT);
  const nextShardSize = Math.min(
    Math.max(request.shardSize || DEFAULT_COT_SHARD_SIZE, 1),
    DEFAULT_COT_SHARD_SIZE
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
  return;
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
      ? `${t("browse_total_items")} ${formatCount(browseBatches.length)}`
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
      const meta = [
        `${t("browse_kept_items")} ${formatCount(batch.keptCount)}/${formatCount(batch.totalCount)}`,
        batch.model ? `${t("browse_model")} ${batch.model}` : null,
        `${t("browse_updated_at")} ${formatUpdatedAt(batch.updatedAtMs)}`
      ]
        .filter(Boolean)
        .join(" · ");

      return `
        <article class="browse-row${selected ? " active" : ""}">
          <button class="browse-row-main" type="button" data-batch-id="${escapeHtml(batch.id)}">
            <span class="browse-row-title">${escapeHtml(batch.topicName || batch.name)}</span>
            <span class="browse-row-meta">${escapeHtml(meta)}</span>
            <span class="browse-row-copy">${escapeHtml(truncateText(batch.prompt, 96) || batch.outputDir)}</span>
          </button>
          <div class="browse-row-actions">
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
    { label: t("browse_qa_mode"), value: qaModeLabel(item.qa_mode) },
    { label: t("browse_subtopic"), value: item.subtopic },
    { label: t("browse_axis"), value: item.axis },
    { label: t("browse_question_type"), value: item.question_type },
    { label: t("browse_difficulty"), value: item.difficulty },
    { label: t("browse_audience"), value: item.audience },
    { label: t("browse_provider"), value: item.provider },
    { label: t("browse_model"), value: item.model },
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
  setText("tab-topic-label", t("tab_topic"));
  setText("tab-settings-label", t("tab_settings"));
  setText("tab-browse-label", t("tab_browse"));
  setText("check-update-label", t("action_check_update"));
  setText("topic-tab-title", t("topic_tab_title"));
  setText("settings-tab-title", t("settings_tab_title"));
  setText("browse-tab-title", t("browse_tab_title"));
  setText("model-section-title", t("model_section_title"));
  setText("integration-section-title", t("integration_section_title"));
  setText("runtime-section-title", t("runtime_section_title"));
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
  setText("browse-batches-title", t("browse_batches_title"));
  customModelInput.placeholder = currentLang === "zh" ? "例如 glm-5.1" : "For example: glm-5.1";
  syncModelOptions(providerPresetInput.value as ProviderPresetId);
  setText("browse-questions-title", t("browse_questions_title"));
  setText("browse-detail-title", t("browse_detail_title"));
  runButton.textContent = t("run_pipeline");
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
  setStatus(currentStatus, currentStatus !== "idle");
  setCurrentTab(currentTab);
  renderTopicTags();
  renderTopicFieldModal();
  renderSetupSummary();
  renderOutput();
  renderBrowseView();
}

function readNumber(input: HTMLInputElement): number {
  return Number.parseInt(input.value, 10);
}

function setStatus(nextStatus: "idle" | "previewing" | "running" | "updating", busy = false) {
  currentStatus = nextStatus;
  status.textContent = t(`status_${nextStatus}`);
  status.dataset.busy = busy ? "true" : "false";
  checkUpdateButton.disabled = busy;
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
  const presetId = detectProviderPreset({
    provider: request.provider,
    baseUrl: request.baseUrl
  });
  providerPresetInput.value = presetId;
  syncProviderFieldVisibility(presetId);
  syncModelOptions(presetId, request.model);
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
  scheduleAutoSave();
});
qaModeCotInput.addEventListener("change", () => {
  if (qaModeCotInput.checked) {
    applyQaModeDefaults("cot");
  }
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
  renderSetupSummary();
  scheduleAutoSave();
});
planLimitInput.addEventListener("input", () => {
  renderSetupSummary();
  scheduleAutoSave();
});
shardSizeInput.addEventListener("input", scheduleAutoSave);
batchSizeInput.addEventListener("input", scheduleAutoSave);
maxInFlightInput.addEventListener("input", scheduleAutoSave);
maxRetriesInput.addEventListener("input", scheduleAutoSave);
timeoutInput.addEventListener("input", scheduleAutoSave);
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
    browseSelectedBatchId = null;
    void loadBrowseBatches();
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
  syncProviderPresetInput();
  await loadConfig(true);
  autoSaveEnabled = true;
  void loadBrowseBatches();
}

void initializeApp();
