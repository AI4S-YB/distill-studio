use anyhow::Result;
use clap::{Parser, Subcommand};
use distill_core::{
    bootstrap_topic, default_generate_config, default_pack_config, draft_question_plans,
    pack_qa_records, GeneratedQa, PackConfig, QaShard, QuestionPlan, TopicSpec,
};
use distill_runtime::generate_to_directory;
use std::fs;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "distill-cli")]
#[command(about = "High-throughput QA distillation CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    Init {
        #[arg(long)]
        prompt: String,
        #[arg(long, default_value_t = 100_000)]
        target_count: u32,
        #[arg(long)]
        output: PathBuf,
    },
    Plan {
        #[arg(long)]
        topic: PathBuf,
        #[arg(long, default_value_t = 500)]
        limit: usize,
        #[arg(long)]
        output: PathBuf,
    },
    Generate {
        #[arg(long)]
        topic: PathBuf,
        #[arg(long)]
        plans: PathBuf,
        #[arg(long)]
        config: Option<PathBuf>,
        #[arg(long)]
        output_dir: PathBuf,
    },
    Pack {
        #[arg(long)]
        input_dir: PathBuf,
        #[arg(long)]
        output: PathBuf,
        #[arg(long)]
        summary_output: Option<PathBuf>,
        #[arg(long)]
        config: Option<PathBuf>,
    },
    WriteDefaultConfig {
        #[arg(long, default_value_t = 100_000)]
        target_count: usize,
        #[arg(long)]
        output: PathBuf,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Init {
            prompt,
            target_count,
            output,
        } => {
            let topic = bootstrap_topic(&prompt, target_count)?;
            write_json(&output, &topic)?;
            println!("Wrote topic spec to {}", output.display());
        }
        Commands::Plan {
            topic,
            limit,
            output,
        } => {
            let content = fs::read_to_string(&topic)?;
            let topic = serde_json::from_str(&content)?;
            let plans = draft_question_plans(&topic, limit);
            write_json(&output, &plans)?;
            println!(
                "Wrote {} question plans to {}",
                plans.len(),
                output.display()
            );
        }
        Commands::Generate {
            topic,
            plans,
            config,
            output_dir,
        } => {
            let topic: TopicSpec = read_json(&topic)?;
            let plans: Vec<QuestionPlan> = read_json(&plans)?;
            let config = match config {
                Some(path) => read_json(&path)?,
                None => default_generate_config(topic.target_count as usize),
            };
            let summary = generate_to_directory(&topic, &plans, &config, &output_dir).await?;
            println!(
                "Wrote {} QA items across {} shards to {} ({}/{} shards generated, {} resumed)",
                summary.generated_count,
                summary.shard_count,
                output_dir.display(),
                summary.completed_shards,
                summary.shard_count,
                summary.skipped_shards
            );
        }
        Commands::Pack {
            input_dir,
            output,
            summary_output,
            config,
        } => {
            let config: PackConfig = match config {
                Some(path) => read_json(&path)?,
                None => default_pack_config(),
            };
            let topic = infer_topic_from_generated_records(&input_dir)?;
            let (_, records) = load_generated_records(&input_dir)?;
            let packed = pack_qa_records(&topic, records, &config);
            write_jsonl(&output, &packed.items)?;

            if let Some(path) = summary_output {
                write_json(&path, &packed)?;
            }

            println!(
                "Packed {} records from {} input items into {}",
                packed.kept,
                packed.total_input,
                output.display()
            );
        }
        Commands::WriteDefaultConfig {
            target_count,
            output,
        } => {
            let config = default_generate_config(target_count);
            write_json(&output, &config)?;
            println!("Wrote default generate config to {}", output.display());
        }
    }

    Ok(())
}

fn write_json<T: serde::Serialize>(path: &PathBuf, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(value)?)?;
    Ok(())
}

fn read_json<T: serde::de::DeserializeOwned>(path: &PathBuf) -> Result<T> {
    let content = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&content)?)
}

fn write_jsonl(path: &PathBuf, records: &[GeneratedQa]) -> Result<()> {
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

fn load_generated_records(input_dir: &PathBuf) -> Result<(String, Vec<GeneratedQa>)> {
    let mut paths = fs::read_dir(input_dir)?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| {
            path.extension().and_then(|ext| ext.to_str()) == Some("json")
                && path.file_name().and_then(|name| name.to_str()) != Some("summary.json")
        })
        .collect::<Vec<_>>();
    paths.sort();

    let mut topic_name = String::new();
    let mut records = Vec::new();

    for path in paths {
        let shard: QaShard = read_json(&path)?;
        if topic_name.is_empty() {
            topic_name = shard.topic_name.clone();
        }
        records.extend(shard.items);
    }

    Ok((topic_name, records))
}

fn infer_topic_from_generated_records(input_dir: &PathBuf) -> Result<TopicSpec> {
    let (_, records) = load_generated_records(input_dir)?;
    let first = records
        .first()
        .ok_or_else(|| anyhow::anyhow!("no generated records found in {}", input_dir.display()))?;

    let mut keywords = vec![
        first.subtopic.to_lowercase(),
        first.axis.to_lowercase(),
        first.topic_name.to_lowercase(),
    ];
    keywords.sort();
    keywords.dedup();

    Ok(TopicSpec {
        user_intent: first.topic_name.clone(),
        topic_name: first.topic_name.clone(),
        goal: format!("Packed QA records for {}", first.topic_name),
        keywords,
        subtopics: vec![distill_core::Subtopic {
            name: first.subtopic.clone(),
            intent: format!("Recovered from generated QA for {}", first.subtopic),
        }],
        question_axes: vec![first.axis.clone()],
        target_count: records.len() as u32,
    })
}
