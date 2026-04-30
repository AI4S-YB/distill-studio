import type { Lang, ProviderPresetId, ProviderPresetConfigKey, ProviderPresetConfig, ResearchFieldNode } from "./types";

const DEFAULT_COT_SECTION_HEADERS_EN = [
  "Workflow Summary",
  "Reference Milestones",
  "Reference Steps",
  "Step Rationale",
  "Decision Points",
  "Quality Checks",
  "Failure Modes",
  "Final Interpretation"
] as const;

const DEFAULT_COT_SECTION_HEADERS_ZH = [
  "研究流程概述",
  "参考里程碑",
  "参考步骤",
  "步骤依据",
  "关键决策点",
  "质量检查",
  "失败模式",
  "最终解释"
] as const;

function defaultCotSectionHeadersForLang(lang: Lang): string[] {
  return [...(lang === "zh" ? DEFAULT_COT_SECTION_HEADERS_ZH : DEFAULT_COT_SECTION_HEADERS_EN)];
}

function normalizeCotSectionHeaders(headers: string[] | null | undefined, lang: Lang): string[] {
  const normalized = (headers ?? [])
    .map((value) => value.trim().replace(/:+$/, "").trim())
    .filter(Boolean);
  return normalized.length ? normalized : defaultCotSectionHeadersForLang(lang);
}

function formatCotSectionHeaders(headers: readonly string[] | null | undefined, lang: Lang): string {
  return normalizeCotSectionHeaders(headers, lang).join("\n");
}

function isDefaultCotSectionHeaderText(value: string, lang: Lang): boolean {
  const normalized = formatCotSectionHeaders(value.split(/\r?\n/), lang);
  return (
    normalized === formatCotSectionHeaders(DEFAULT_COT_SECTION_HEADERS_ZH, lang) ||
    normalized === formatCotSectionHeaders(DEFAULT_COT_SECTION_HEADERS_EN, lang)
  );
}

const LANG_STORAGE_KEY = "distill-studio.lang";
const CHAT_SESSIONS_STORAGE_KEY = "distill-studio.chat-sessions";
const PAPER_QA_STORAGE_KEY = "distill-studio.paper-qa";
const DEFAULT_PROFILE_NAME = "default";
const AUTO_SAVE_DELAY_MS = 600;
const MANAGED_OUTPUT_DIR = "__managed__";
const CUSTOM_MODEL_VALUE = "__custom__";
const DEFAULT_COT_TARGET_COUNT = 10;
const COT_TARGET_COUNT_CAP = 100;
const DEFAULT_COT_SHARD_SIZE = 10;
const COT_SAFE_SHARD_SIZE_CAP = 10;
const DEFAULT_COT_BATCH_SIZE = 1;
const DEFAULT_COT_MAX_IN_FLIGHT = 2;
const FALLBACK_REAL_PROVIDER_PRESET: ProviderPresetConfigKey = "qwen_dashscope";

const PROVIDER_PRESETS: Record<ProviderPresetConfigKey, ProviderPresetConfig> = {
  qwen_dashscope: {
    provider: "openai-compatible",
    defaultModel: "qwen3.6-max-preview",
    models: [
      "qwen3.6-max-preview",
      "qwen3.6-plus",
      "qwen-plus",
      "qwen-max",
      "qwen-turbo",
      "qwen-long",
      "qwen3-max"
    ],
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

const DEFAULT_MANUAL_UPDATE_URL = "https://github.com/AI4S-YB/distill-studio/releases/latest";

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

export {
  formatCotSectionHeaders,
  defaultCotSectionHeadersForLang,
  isDefaultCotSectionHeaderText,
  normalizeCotSectionHeaders,
  LANG_STORAGE_KEY,
  CHAT_SESSIONS_STORAGE_KEY,
  PAPER_QA_STORAGE_KEY,
  DEFAULT_PROFILE_NAME,
  AUTO_SAVE_DELAY_MS,
  MANAGED_OUTPUT_DIR,
  CUSTOM_MODEL_VALUE,
  DEFAULT_COT_TARGET_COUNT,
  COT_TARGET_COUNT_CAP,
  DEFAULT_COT_SHARD_SIZE,
  COT_SAFE_SHARD_SIZE_CAP,
  DEFAULT_COT_BATCH_SIZE,
  DEFAULT_COT_MAX_IN_FLIGHT,
  FALLBACK_REAL_PROVIDER_PRESET,
  PROVIDER_PRESETS,
  DEFAULT_COT_SECTION_HEADERS_ZH,
  DEFAULT_COT_SECTION_HEADERS_EN,
  DEFAULT_MANUAL_UPDATE_URL,
  RESEARCH_FIELD_TAXONOMY,
};
