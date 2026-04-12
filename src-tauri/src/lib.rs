use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use keyring::credential::CredentialPersistence;
use keyring::default as keyring_default;
use keyring::Entry;
use reqwest::Client;
use reqwest::Method;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri_plugin_fs::FsExt;

const SAMPLE_NOTES_STATE_FILE: &str = ".markdown-press-sample-notes-state.json";
const SAMPLE_NOTES_FOLDER_NAME: &str = "示例笔记";
const LEGACY_SAMPLE_NOTES_RENAMES: [(&str, &str); 1] =
    [("02-Obsidian-内联语法.md", "02-Obsidian-内联语法示例.md")];
const GITHUB_API_CONNECT_TIMEOUT_SECS: u64 = 10;
const GITHUB_API_REQUEST_TIMEOUT_SECS: u64 = 30;
const SECURE_SETTINGS_SERVICE: &str = "com.bxyz.markdown-press";
const SECRET_KEY_BLOG_GITHUB_TOKEN: &str = "blogGithubToken";
const SECRET_KEY_GEMINI_API_KEY: &str = "geminiApiKey";
const SECRET_KEY_CODEX_API_KEY: &str = "codexApiKey";

fn publish_log(message: impl AsRef<str>) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let line = format!(
        "[publish_simple_blog][{}.{:03}] {}",
        now.as_secs(),
        now.subsec_millis(),
        message.as_ref()
    );
    println!("{}", line);
    log::info!("{}", line);
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open("/tmp/markdown-press-publish.log")
    {
        let _ = writeln!(file, "{}", line);
    }
}

fn startup_log(message: impl AsRef<str>) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let line = format!(
        "[startup][{}.{:03}] {}",
        now.as_secs(),
        now.subsec_millis(),
        message.as_ref()
    );
    println!("{}", line);
    log::info!("{}", line);
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CopySampleNotesResult {
    updated: bool,
    copied_files: Vec<String>,
    skipped_files: Vec<String>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SampleNotesState {
    bundle_hash: String,
    files: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublishSimpleBlogAsset {
    source_path: String,
    target_relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublishSimpleBlogRequest {
    blog_repo_url: String,
    blog_github_token: Option<String>,
    post_relative_path: String,
    asset_directory_relative_path: String,
    markdown_content: String,
    assets: Vec<PublishSimpleBlogAsset>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublishSimpleBlogResult {
    deployment_url: Option<String>,
    build_output: String,
    deploy_output: String,
}

#[derive(Debug)]
struct PreparedPublishFile {
    relative_path: PathBuf,
    bytes: Vec<u8>,
}

#[derive(Debug, Deserialize)]
struct GitHubRepoResponse {
    default_branch: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRefResponse {
    object: GitHubGitObject,
}

#[derive(Debug, Deserialize)]
struct GitHubGitObject {
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GitHubCommitResponse {
    tree: GitHubCommitTree,
}

#[derive(Debug, Deserialize)]
struct GitHubCommitTree {
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GitHubTreeResponse {
    truncated: bool,
    tree: Vec<GitHubTreeItem>,
}

#[derive(Debug, Deserialize)]
struct GitHubTreeItem {
    path: String,
    #[serde(rename = "type")]
    item_type: String,
    sha: Option<String>,
}

#[derive(Debug, Serialize)]
struct GitHubCreateBlobRequest {
    content: String,
    encoding: String,
}

#[derive(Debug, Deserialize)]
struct GitHubCreateBlobResponse {
    sha: String,
}

#[derive(Debug, Serialize)]
struct GitHubCreateTreeRequest {
    base_tree: String,
    tree: Vec<GitHubTreeEntry>,
}

#[derive(Debug, Serialize)]
struct GitHubTreeEntry {
    path: String,
    mode: String,
    #[serde(rename = "type")]
    item_type: String,
    sha: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubCreateTreeResponse {
    sha: String,
}

#[derive(Debug, Serialize)]
struct GitHubCreateCommitRequest {
    message: String,
    tree: String,
    parents: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubCreateCommitResponse {
    sha: String,
}

#[derive(Debug, Serialize)]
struct GitHubUpdateRefRequest {
    sha: String,
    force: bool,
}

#[derive(Debug, Deserialize)]
struct GitHubApiErrorResponse {
    message: String,
}

#[derive(Debug, Clone)]
struct AllowedPathEntry {
    path: PathBuf,
    recursive: bool,
}

#[derive(Debug, Default)]
struct SecurityState {
    allowed_paths: Mutex<Vec<AllowedPathEntry>>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct SecureSettingsResult {
    blog_github_token: Option<String>,
    gemini_api_key: Option<String>,
    codex_api_key: Option<String>,
}

fn canonicalize_existing_path(path: &str) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|e| format!("Failed to resolve path {}: {}", path, e))
}

fn canonicalize_scope_path(path: &str) -> Result<PathBuf, String> {
    match fs::canonicalize(path) {
        Ok(canonical) => Ok(canonical),
        Err(_) => {
            let candidate = PathBuf::from(path);
            let parent = candidate
                .parent()
                .ok_or_else(|| format!("Failed to resolve path {}: missing parent directory", path))?;
            let canonical_parent = fs::canonicalize(parent)
                .map_err(|e| format!("Failed to resolve path {}: {}", path, e))?;
            let file_name = candidate
                .file_name()
                .ok_or_else(|| format!("Failed to resolve path {}: missing final path segment", path))?;
            Ok(canonical_parent.join(file_name))
        }
    }
}

fn is_path_allowed(state: &SecurityState, path: &Path) -> Result<bool, String> {
    let allowed_paths = state
        .allowed_paths
        .lock()
        .map_err(|_| "Failed to acquire security state lock.".to_string())?;

    Ok(allowed_paths.iter().any(|entry| {
        if entry.recursive {
            path == entry.path || path.starts_with(&entry.path)
        } else {
            path == entry.path
        }
    }))
}

fn ensure_path_allowed(state: &SecurityState, path: &Path) -> Result<(), String> {
    if is_path_allowed(state, path)? {
        return Ok(());
    }

    Err(format!(
        "Access denied for path outside the authorized workspace: {}",
        path.display()
    ))
}

fn secure_entry(key: &str) -> Result<Entry, String> {
    let persistence = keyring_default::default_credential_builder().persistence();
    if !matches!(persistence, CredentialPersistence::UntilDelete | CredentialPersistence::UntilReboot)
    {
        return Err(
            "Secure storage backend is not persistent. This build is not using the native system keychain."
                .to_string(),
        );
    }

    Entry::new(SECURE_SETTINGS_SERVICE, key)
        .map_err(|e| format!("Failed to initialize secure storage entry for {}: {}", key, e))
}

fn read_secure_secret(key: &str) -> Result<Option<String>, String> {
    match secure_entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read secure secret {}: {}", key, e)),
    }
}

fn write_secure_secret(key: &str, value: Option<&str>) -> Result<(), String> {
    let entry = secure_entry(key)?;
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        Some(secret) => entry
            .set_password(secret)
            .map_err(|e| format!("Failed to store secure secret {}: {}", key, e)),
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Failed to clear secure secret {}: {}", key, e)),
        },
    }
}

fn resolve_secret_key(key: &str) -> Option<&'static str> {
    match key {
        SECRET_KEY_BLOG_GITHUB_TOKEN => Some(SECRET_KEY_BLOG_GITHUB_TOKEN),
        SECRET_KEY_GEMINI_API_KEY => Some(SECRET_KEY_GEMINI_API_KEY),
        SECRET_KEY_CODEX_API_KEY => Some(SECRET_KEY_CODEX_API_KEY),
        _ => None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SecurityState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            trace_startup,
            get_secure_settings,
            set_secure_secret,
            register_allowed_path,
            delete_path_recursively,
            reveal_in_explorer,
            copy_sample_notes,
            publish_simple_blog
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn trace_startup(event: String) -> Result<(), String> {
    startup_log(event);
    Ok(())
}

#[tauri::command]
async fn publish_simple_blog(
    request: PublishSimpleBlogRequest,
    security_state: tauri::State<'_, SecurityState>,
) -> Result<PublishSimpleBlogResult, String> {
    validate_publish_request_access(security_state.inner(), &request)?;
    publish_remote_simple_blog(&request).await
}

#[tauri::command]
fn get_secure_settings() -> Result<SecureSettingsResult, String> {
    Ok(SecureSettingsResult {
        blog_github_token: read_secure_secret(SECRET_KEY_BLOG_GITHUB_TOKEN)?,
        gemini_api_key: read_secure_secret(SECRET_KEY_GEMINI_API_KEY)?,
        codex_api_key: read_secure_secret(SECRET_KEY_CODEX_API_KEY)?,
    })
}

#[tauri::command]
fn set_secure_secret(key: String, value: Option<String>) -> Result<(), String> {
    let Some(secret_key) = resolve_secret_key(&key) else {
        return Err(format!("Unsupported secure setting key: {}", key));
    };

    write_secure_secret(secret_key, value.as_deref())
}

#[tauri::command]
fn register_allowed_path(
    path: String,
    recursive: bool,
    app: tauri::AppHandle,
    security_state: tauri::State<'_, SecurityState>,
) -> Result<(), String> {
    let canonical = canonicalize_scope_path(&path)?;
    let fs_scope = app.fs_scope();

    if canonical.is_dir() {
        fs_scope
            .allow_directory(&canonical, recursive)
            .map_err(|e| format!("Failed to register fs scope for directory: {}", e))?;
    } else {
        fs_scope
            .allow_file(&canonical)
            .map_err(|e| format!("Failed to register fs scope for file: {}", e))?;
    }

    let mut allowed_paths = security_state
        .allowed_paths
        .lock()
        .map_err(|_| "Failed to acquire security state lock.".to_string())?;

    if let Some(existing) = allowed_paths.iter_mut().find(|entry| entry.path == canonical) {
        existing.recursive = existing.recursive || recursive;
        return Ok(());
    }

    allowed_paths.push(AllowedPathEntry {
        path: canonical,
        recursive,
    });

    Ok(())
}

#[tauri::command]
fn delete_path_recursively(
    path: String,
    security_state: tauri::State<'_, SecurityState>,
) -> Result<(), String> {
    let canonical = canonicalize_existing_path(&path)?;
    ensure_path_allowed(security_state.inner(), &canonical)?;

    if canonical.is_dir() {
        fs::remove_dir_all(&canonical)
            .map_err(|e| format!("Failed to delete directory {}: {}", canonical.display(), e))?;
    } else {
        fs::remove_file(&canonical)
            .map_err(|e| format!("Failed to delete file {}: {}", canonical.display(), e))?;
    }

    Ok(())
}

#[tauri::command]
fn reveal_in_explorer(
    path: String,
    security_state: tauri::State<'_, SecurityState>,
) -> Result<(), String> {
    let canonical = canonicalize_existing_path(&path)?;
    ensure_path_allowed(security_state.inner(), &canonical)?;

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg("-R")
            .arg(&canonical)
            .status()
            .map_err(|e| format!("Failed to reveal path in Finder: {}", e))?;
        if !status.success() {
            return Err(format!("Finder failed to reveal path: {}", canonical.display()));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("explorer")
            .arg(format!("/select,{}", canonical.display()))
            .status()
            .map_err(|e| format!("Failed to reveal path in Explorer: {}", e))?;
        if !status.success() {
            return Err(format!("Explorer failed to reveal path: {}", canonical.display()));
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = canonical.parent().unwrap_or(&canonical);
        let status = Command::new("xdg-open")
            .arg(parent)
            .status()
            .map_err(|e| format!("Failed to reveal path in file manager: {}", e))?;
        if !status.success() {
            return Err(format!(
                "File manager failed to reveal path: {}",
                canonical.display()
            ));
        }
    }

    Ok(())
}

async fn publish_remote_simple_blog(
    request: &PublishSimpleBlogRequest,
) -> Result<PublishSimpleBlogResult, String> {
    publish_log("start request");
    let remote_repo = normalize_repo_target(&request.blog_repo_url)?;
    let token =
        normalize_optional_token(request.blog_github_token.as_deref()).ok_or_else(|| {
            "GitHub token is required for publishing. Set it in Publishing settings first."
                .to_string()
        })?;
    let repo_slug = github_repo_slug_from_remote(&remote_repo).ok_or_else(|| {
        "Failed to resolve the GitHub repository owner and name from the configured repository URL."
            .to_string()
    })?;
    publish_log(format!(
        "normalized repo={} post={} assets={}",
        repo_slug,
        request.post_relative_path,
        request.assets.len()
    ));

    publish_remote_simple_blog_via_github_api(request, &remote_repo, &repo_slug, &token).await
}

fn validate_publish_request_access(
    security_state: &SecurityState,
    request: &PublishSimpleBlogRequest,
) -> Result<(), String> {
    for asset in &request.assets {
        let source_path = canonicalize_existing_path(&asset.source_path)?;
        ensure_path_allowed(security_state, &source_path)?;
    }

    Ok(())
}

/// Copy sample notes from resources to the target directory
#[tauri::command]
async fn copy_sample_notes(
    app_handle: tauri::AppHandle,
    target_dir: String,
    security_state: tauri::State<'_, SecurityState>,
) -> Result<CopySampleNotesResult, String> {
    use tauri::Manager;

    let target_root = canonicalize_existing_path(&target_dir)?;
    ensure_path_allowed(security_state.inner(), &target_root)?;

    // Get the resource directory
    let resource_dir = app_handle
        .path()
        .resolve(
            "resources/sample-notes",
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|e| format!("Failed to resolve sample notes resource directory: {}", e))?;

    let source = Path::new(&resource_dir);
    let target = target_root.join(SAMPLE_NOTES_FOLDER_NAME);

    println!("[copy_sample_notes] Source: {:?}", source);
    println!("[copy_sample_notes] Target: {:?}", target);
    println!("[copy_sample_notes] Source exists: {}", source.exists());

    if !source.exists() {
        return Err(format!(
            "Sample notes source directory not found: {:?}",
            source
        ));
    }

    // Ensure target directory exists
    if !target.exists() {
        fs::create_dir_all(&target)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    let (mut previous_state, _) = read_sample_notes_state(&target)?;
    migrate_legacy_sample_notes(&target, &mut previous_state)?;

    let source_files = collect_files(source, source)?;
    let source_hashes = build_source_hashes(&source_files)?;
    let bundle_hash = hash_manifest(&source_hashes)?;

    if previous_state.bundle_hash == bundle_hash {
        return Ok(CopySampleNotesResult {
            updated: false,
            copied_files: Vec::new(),
            skipped_files: Vec::new(),
        });
    }

    let mut next_state = SampleNotesState {
        bundle_hash,
        files: BTreeMap::new(),
    };
    let mut copied_files = Vec::new();
    let mut skipped_files = Vec::new();

    remove_stale_sample_note_files(&target, &previous_state, &source_hashes)?;

    for (relative_path, source_path) in source_files {
        let source_hash = source_hashes
            .get(&relative_path)
            .ok_or_else(|| format!("Missing source hash for {}", relative_path))?
            .clone();
        let target_path = target.join(relative_path.as_str());
        let copy_decision = decide_copy_action(
            &target_path,
            &source_hash,
            previous_state.files.get(&relative_path),
        )?;

        if copy_decision.should_copy {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directory {:?}: {}", parent, e))?;
            }

            fs::copy(&source_path, &target_path)
                .map_err(|e| format!("Failed to copy file {:?}: {}", source_path, e))?;
            copied_files.push(relative_path.clone());
            next_state.files.insert(relative_path, source_hash);
            continue;
        }

        if copy_decision.skip_reason_user_modified {
            skipped_files.push(relative_path.clone());
        }

        let tracked_hash = copy_decision.tracked_hash.unwrap_or(source_hash);
        next_state.files.insert(relative_path, tracked_hash);
    }

    write_sample_notes_state(&target, &next_state)?;

    Ok(CopySampleNotesResult {
        updated: !copied_files.is_empty(),
        copied_files,
        skipped_files,
    })
}

#[derive(Debug)]
struct CopyDecision {
    should_copy: bool,
    skip_reason_user_modified: bool,
    tracked_hash: Option<String>,
}

fn collect_files(base: &Path, current: &Path) -> Result<BTreeMap<String, PathBuf>, String> {
    let mut files = BTreeMap::new();

    for entry in fs::read_dir(current).map_err(|e| format!("Failed to read directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            files.extend(collect_files(base, &path)?);
            continue;
        }

        let relative = path
            .strip_prefix(base)
            .map_err(|e| format!("Failed to resolve relative path {:?}: {}", path, e))?;
        files.insert(relative.to_string_lossy().replace('\\', "/"), path);
    }

    Ok(files)
}

fn build_source_hashes(
    files: &BTreeMap<String, PathBuf>,
) -> Result<BTreeMap<String, String>, String> {
    files
        .iter()
        .map(|(relative_path, full_path)| {
            hash_file(full_path).map(|hash| (relative_path.clone(), hash))
        })
        .collect()
}

fn hash_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read file {:?}: {}", path, e))?;
    Ok(hash_bytes(&bytes))
}

fn hash_manifest(manifest: &BTreeMap<String, String>) -> Result<String, String> {
    let bytes = serde_json::to_vec(manifest)
        .map_err(|e| format!("Failed to serialize sample notes manifest: {}", e))?;
    Ok(hash_bytes(&bytes))
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn read_sample_notes_state(target: &Path) -> Result<(SampleNotesState, bool), String> {
    let state_path = target.join(SAMPLE_NOTES_STATE_FILE);
    if !state_path.exists() {
        return Ok((SampleNotesState::default(), false));
    }

    let content = fs::read_to_string(&state_path)
        .map_err(|e| format!("Failed to read sample notes state {:?}: {}", state_path, e))?;
    serde_json::from_str(&content)
        .map(|state| (state, true))
        .map_err(|e| format!("Failed to parse sample notes state {:?}: {}", state_path, e))
}

fn write_sample_notes_state(target: &Path, state: &SampleNotesState) -> Result<(), String> {
    let state_path = target.join(SAMPLE_NOTES_STATE_FILE);
    let content = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize sample notes state: {}", e))?;
    fs::write(&state_path, content)
        .map_err(|e| format!("Failed to write sample notes state {:?}: {}", state_path, e))
}

async fn publish_remote_simple_blog_via_github_api(
    request: &PublishSimpleBlogRequest,
    remote_repo: &str,
    repo_slug: &str,
    token: &str,
) -> Result<PublishSimpleBlogResult, String> {
    publish_log("creating GitHub API client");
    let client = create_github_api_client(token)?;
    let (owner, repo) = split_github_repo_slug(repo_slug)?;
    publish_log(format!("loading repo metadata for {}/{}", owner, repo));
    let repo_info: GitHubRepoResponse =
        github_api_get(&client, &format!("/repos/{}/{}", owner, repo)).await?;

    let branch = repo_info.default_branch.trim();
    if branch.is_empty() {
        return Err("GitHub repository default branch is empty.".to_string());
    }
    publish_log(format!("default branch={}", branch));

    publish_log("loading branch ref");
    let branch_ref: GitHubRefResponse = github_api_get(
        &client,
        &format!("/repos/{}/{}/git/ref/heads/{}", owner, repo, branch),
    )
    .await?;
    let current_commit_sha = branch_ref.object.sha;
    publish_log(format!("current commit sha={}", current_commit_sha));

    publish_log("loading current commit");
    let current_commit: GitHubCommitResponse = github_api_get(
        &client,
        &format!(
            "/repos/{}/{}/git/commits/{}",
            owner, repo, current_commit_sha
        ),
    )
    .await?;
    let current_tree_sha = current_commit.tree.sha;
    publish_log(format!("current tree sha={}", current_tree_sha));

    publish_log("loading repository tree");
    let current_tree: GitHubTreeResponse = github_api_get(
        &client,
        &format!(
            "/repos/{}/{}/git/trees/{}?recursive=1",
            owner, repo, current_tree_sha
        ),
    )
    .await?;
    if current_tree.truncated {
        return Err(
            "GitHub returned a truncated repository tree, so this repository is not currently supported by the API-only publish flow."
                .to_string(),
        );
    }
    publish_log(format!(
        "repository tree entries={}",
        current_tree.tree.len()
    ));

    publish_log("collecting publish files");
    let prepared_files = collect_simple_blog_publish_files(request, remote_repo, branch)?;
    publish_log(format!("prepared files={}", prepared_files.len()));
    let current_files = current_tree_blob_map(&current_tree);
    publish_log(format!("current blob files={}", current_files.len()));
    publish_log("building tree entries");
    let tree_entries = build_github_tree_entries(
        &client,
        owner,
        repo,
        request,
        &prepared_files,
        &current_files,
    )
    .await?;
    publish_log(format!("tree entries to update={}", tree_entries.len()));

    if tree_entries.is_empty() {
        publish_log("no content changes detected");
        return Ok(PublishSimpleBlogResult {
            deployment_url: None,
            build_output: "No content changes detected. Skip GitHub commit update.".to_string(),
            deploy_output: String::new(),
        });
    }

    publish_log("creating git tree");
    let create_tree: GitHubCreateTreeResponse = github_api_post(
        &client,
        &format!("/repos/{}/{}/git/trees", owner, repo),
        &GitHubCreateTreeRequest {
            base_tree: current_tree_sha,
            tree: tree_entries,
        },
    )
    .await?;
    publish_log(format!("created tree sha={}", create_tree.sha));

    let post_relative_path = sanitize_relative_path(&request.post_relative_path)?;
    let post_name = post_relative_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("post");
    publish_log(format!("creating commit for {}", post_name));
    let create_commit: GitHubCreateCommitResponse = github_api_post(
        &client,
        &format!("/repos/{}/{}/git/commits", owner, repo),
        &GitHubCreateCommitRequest {
            message: format!("publish: update {}", post_name),
            tree: create_tree.sha,
            parents: vec![current_commit_sha.clone()],
        },
    )
    .await?;
    publish_log(format!("created commit sha={}", create_commit.sha));

    publish_log(format!("updating branch ref {}", branch));
    let _: GitHubRefResponse = github_api_patch(
        &client,
        &format!("/repos/{}/{}/git/refs/heads/{}", owner, repo, branch),
        &GitHubUpdateRefRequest {
            sha: create_commit.sha.clone(),
            force: false,
        },
    )
    .await?;
    publish_log("publish finished successfully");

    Ok(PublishSimpleBlogResult {
        deployment_url: None,
        build_output: format!("Created GitHub commit {}", create_commit.sha),
        deploy_output: format!("Updated branch {} via GitHub API.", branch),
    })
}

fn collect_simple_blog_publish_files(
    request: &PublishSimpleBlogRequest,
    remote_repo: &str,
    target_branch: &str,
) -> Result<Vec<PreparedPublishFile>, String> {
    publish_log("rewriting markdown asset URLs");
    let post_relative_path = sanitize_relative_path(&request.post_relative_path)?;
    let markdown_content = rewrite_markdown_asset_urls(
        &request.markdown_content,
        &request.assets,
        remote_repo,
        target_branch,
    )?;
    let mut files = vec![PreparedPublishFile {
        relative_path: post_relative_path,
        bytes: markdown_content.into_bytes(),
    }];

    for asset in &request.assets {
        let source_path = PathBuf::from(&asset.source_path);
        if !source_path.exists() {
            return Err(format!(
                "Referenced asset does not exist: {}",
                source_path.display()
            ));
        }

        let target_relative_path = sanitize_relative_path(&asset.target_relative_path)?;
        publish_log(format!(
            "reading asset {} -> {}",
            source_path.display(),
            target_relative_path.display()
        ));
        let bytes = fs::read(&source_path)
            .map_err(|e| format!("Failed to read asset from {:?}: {}", source_path, e))?;

        files.push(PreparedPublishFile {
            relative_path: target_relative_path,
            bytes,
        });
    }

    Ok(files)
}

fn rewrite_markdown_asset_urls(
    markdown_content: &str,
    assets: &[PublishSimpleBlogAsset],
    remote_repo: &str,
    target_branch: &str,
) -> Result<String, String> {
    let Some(raw_base_url) = github_raw_base_url(remote_repo, target_branch) else {
        return Ok(markdown_content.to_string());
    };

    let mut rewritten = markdown_content.to_string();
    for asset in assets {
        let target_relative_path = sanitize_relative_path(&asset.target_relative_path)?;
        let normalized_path = target_relative_path.to_string_lossy().replace('\\', "/");
        let raw_url = format!(
            "{}/{}",
            raw_base_url,
            encode_raw_path(&target_relative_path)
        );
        rewritten = rewritten.replace(
            &format!("](/{})", normalized_path),
            &format!("]({})", raw_url),
        );
    }

    Ok(rewritten)
}

fn sanitize_relative_path(raw: &str) -> Result<PathBuf, String> {
    let path = Path::new(raw);
    if path.is_absolute() {
        return Err(format!("Path must be relative: {}", raw));
    }

    let mut sanitized = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(part) => sanitized.push(part),
            std::path::Component::CurDir => {}
            _ => return Err(format!("Unsafe path component in: {}", raw)),
        }
    }

    if sanitized.as_os_str().is_empty() {
        return Err("Relative path cannot be empty".to_string());
    }

    Ok(sanitized)
}

fn is_valid_repo_segment(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
}

fn normalize_github_repo_path(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_matches('/');
    let repo = trimmed.trim_end_matches(".git");
    let mut parts = repo.split('/');
    let owner = parts.next()?;
    let name = parts.next()?;
    if parts.next().is_some() || !is_valid_repo_segment(owner) || !is_valid_repo_segment(name) {
        return None;
    }
    Some(format!("{}/{}", owner, name))
}

fn normalize_repo_target(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Blog repository URL cannot be empty.".to_string());
    }

    if let Some(stripped) = trimmed.strip_prefix("https://github.com/") {
        return normalize_github_repo_path(stripped)
            .map(|repo| format!("https://github.com/{}", repo))
            .ok_or_else(|| {
                "Blog repository URL must point to a GitHub repository, for example https://github.com/owner/repo."
                    .to_string()
            });
    }

    if let Some(stripped) = trimmed.strip_prefix("git@github.com:") {
        return normalize_github_repo_path(stripped)
            .map(|repo| format!("git@github.com:{}.git", repo))
            .ok_or_else(|| {
                "Blog repository URL must point to a GitHub repository, for example https://github.com/owner/repo."
                    .to_string()
            });
    }

    if let Some(stripped) = trimmed.strip_prefix("github.com/") {
        return normalize_github_repo_path(stripped)
            .map(|repo| format!("https://github.com/{}", repo))
            .ok_or_else(|| {
                "Blog repository URL must point to a GitHub repository, for example https://github.com/owner/repo."
                    .to_string()
            });
    }

    normalize_github_repo_path(trimmed)
        .map(|repo| format!("https://github.com/{}", repo))
        .ok_or_else(|| {
            "Blog repository URL must point to a GitHub repository, for example https://github.com/owner/repo."
                .to_string()
        })
}

fn github_repo_slug_from_remote(remote_repo: &str) -> Option<String> {
    if let Some(stripped) = remote_repo.trim().strip_prefix("https://github.com/") {
        return normalize_github_repo_path(stripped);
    }

    if let Some(stripped) = remote_repo.trim().strip_prefix("git@github.com:") {
        return normalize_github_repo_path(stripped);
    }

    None
}

fn github_raw_base_url(remote_repo: &str, target_branch: &str) -> Option<String> {
    let repo_slug = github_repo_slug_from_remote(remote_repo)?;
    let (owner, repo) = repo_slug.split_once('/')?;
    Some(format!(
        "https://raw.githubusercontent.com/{}/{}/{}",
        owner,
        repo,
        percent_encode_component(target_branch)
    ))
}

fn encode_raw_path(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            std::path::Component::Normal(part) => {
                Some(percent_encode_component(&part.to_string_lossy()))
            }
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn percent_encode_component(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        let ch = *byte as char;
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '~') {
            encoded.push(ch);
        } else {
            encoded.push_str(&format!("%{:02X}", byte));
        }
    }
    encoded
}

fn normalize_optional_token(raw: Option<&str>) -> Option<String> {
    let trimmed = raw?.trim();
    if trimmed.is_empty() {
        return None;
    }

    Some(trimmed.to_string())
}

fn split_github_repo_slug(repo_slug: &str) -> Result<(&str, &str), String> {
    repo_slug
        .split_once('/')
        .ok_or_else(|| format!("Invalid GitHub repository slug: {}", repo_slug))
}

fn create_github_api_client(token: &str) -> Result<Client, String> {
    publish_log("create_github_api_client: preparing headers");
    let mut headers = reqwest::header::HeaderMap::new();
    let auth_value = reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token))
        .map_err(|e| format!("Failed to encode GitHub token header: {}", e))?;
    headers.insert(reqwest::header::AUTHORIZATION, auth_value);
    publish_log("create_github_api_client: building reqwest client");

    let client = Client::builder()
        .default_headers(headers)
        .connect_timeout(Duration::from_secs(GITHUB_API_CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(GITHUB_API_REQUEST_TIMEOUT_SECS))
        .user_agent("markdown-press")
        .build()
        .map_err(|e| format!("Failed to create GitHub API client: {}", e))?;
    publish_log("create_github_api_client: client ready");
    Ok(client)
}

async fn github_api_get<T: DeserializeOwned>(client: &Client, path: &str) -> Result<T, String> {
    github_api_json(
        client,
        Method::GET,
        path,
        Option::<&serde_json::Value>::None,
    )
    .await
}

async fn github_api_post<T: DeserializeOwned, B: Serialize>(
    client: &Client,
    path: &str,
    body: &B,
) -> Result<T, String> {
    github_api_json(client, Method::POST, path, Some(body)).await
}

async fn github_api_patch<T: DeserializeOwned, B: Serialize>(
    client: &Client,
    path: &str,
    body: &B,
) -> Result<T, String> {
    github_api_json(client, Method::PATCH, path, Some(body)).await
}

async fn github_api_json<T: DeserializeOwned, B: Serialize>(
    client: &Client,
    method: Method,
    path: &str,
    body: Option<&B>,
) -> Result<T, String> {
    let url = format!("https://api.github.com{}", path);
    let method_name = method.as_str().to_string();
    publish_log(format!("GitHub API start {} {}", method_name, path));
    let mut request = client
        .request(method.clone(), &url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");

    if let Some(body) = body {
        request = request.json(body);
    }

    let response = request
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                publish_log(format!("GitHub API timeout {} {}", method_name, path));
                return format!(
                    "GitHub API request timed out for {} {}. Check your network connection to github.com and api.github.com, then try again.",
                    method, path
                );
            }

            publish_log(format!(
                "GitHub API failure {} {}: {}",
                method_name, path, e
            ));
            format!("GitHub API request failed for {} {}: {}", method, path, e)
        })?;
    let status = response.status();
    publish_log(format!(
        "GitHub API response {} {} -> {}",
        method_name, path, status
    ));

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let api_message = serde_json::from_str::<GitHubApiErrorResponse>(&body)
            .map(|parsed| parsed.message)
            .unwrap_or_else(|_| body.trim().to_string());
        publish_log(format!(
            "GitHub API error {} {} -> {}",
            method_name, path, api_message
        ));
        let suffix = if api_message.is_empty() {
            String::new()
        } else {
            format!(" {}", api_message)
        };

        return Err(format!(
            "GitHub API returned {} for {}.{}",
            status, path, suffix
        ));
    }

    response
        .json::<T>()
        .await
        .map_err(|e| format!("Failed to decode GitHub API response for {}: {}", path, e))
}

fn current_tree_blob_map(tree: &GitHubTreeResponse) -> BTreeMap<String, String> {
    tree.tree
        .iter()
        .filter(|item| item.item_type == "blob")
        .filter_map(|item| {
            item.sha
                .as_ref()
                .map(|sha| (item.path.clone(), sha.clone()))
        })
        .collect()
}

async fn build_github_tree_entries(
    client: &Client,
    owner: &str,
    repo: &str,
    request: &PublishSimpleBlogRequest,
    files: &[PreparedPublishFile],
    current_files: &BTreeMap<String, String>,
) -> Result<Vec<GitHubTreeEntry>, String> {
    let desired_paths: Vec<String> = files
        .iter()
        .map(|file| file.relative_path.to_string_lossy().replace('\\', "/"))
        .collect();
    let desired_path_set: BTreeSet<&str> = desired_paths.iter().map(String::as_str).collect();
    let asset_directory_relative_path =
        sanitize_relative_path(&request.asset_directory_relative_path)?;
    let asset_directory_prefix = format!(
        "{}/",
        asset_directory_relative_path
            .to_string_lossy()
            .replace('\\', "/")
    );
    let mut entries = Vec::new();

    for file in files {
        let path = file.relative_path.to_string_lossy().replace('\\', "/");
        let local_blob_sha = git_blob_sha(&file.bytes);
        if current_files.get(&path) == Some(&local_blob_sha) {
            continue;
        }

        let blob: GitHubCreateBlobResponse = github_api_post(
            client,
            &format!("/repos/{}/{}/git/blobs", owner, repo),
            &GitHubCreateBlobRequest {
                content: BASE64_STANDARD.encode(&file.bytes),
                encoding: "base64".to_string(),
            },
        )
        .await?;

        entries.push(GitHubTreeEntry {
            path,
            mode: "100644".to_string(),
            item_type: "blob".to_string(),
            sha: Some(blob.sha),
        });
    }

    for path in current_files.keys() {
        if path.starts_with(&asset_directory_prefix) && !desired_path_set.contains(path.as_str()) {
            entries.push(GitHubTreeEntry {
                path: path.clone(),
                mode: "100644".to_string(),
                item_type: "blob".to_string(),
                sha: None,
            });
        }
    }

    Ok(entries)
}

fn git_blob_sha(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(format!("blob {}\0", bytes.len()).as_bytes());
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn decide_copy_action(
    target_path: &Path,
    source_hash: &str,
    previous_hash: Option<&String>,
) -> Result<CopyDecision, String> {
    if !target_path.exists() {
        return Ok(CopyDecision {
            should_copy: true,
            skip_reason_user_modified: false,
            tracked_hash: None,
        });
    }

    let current_target_hash = hash_file(target_path)?;
    if current_target_hash == source_hash {
        return Ok(CopyDecision {
            should_copy: false,
            skip_reason_user_modified: false,
            tracked_hash: Some(source_hash.to_string()),
        });
    }

    if let Some(previous_hash) = previous_hash {
        if current_target_hash == *previous_hash {
            return Ok(CopyDecision {
                should_copy: true,
                skip_reason_user_modified: false,
                tracked_hash: None,
            });
        }

        return Ok(CopyDecision {
            should_copy: false,
            skip_reason_user_modified: true,
            tracked_hash: Some(previous_hash.clone()),
        });
    }

    Ok(CopyDecision {
        should_copy: true,
        skip_reason_user_modified: false,
        tracked_hash: None,
    })
}

fn migrate_legacy_sample_notes(target: &Path, state: &mut SampleNotesState) -> Result<(), String> {
    for (legacy_relative_path, current_relative_path) in LEGACY_SAMPLE_NOTES_RENAMES {
        let legacy_path = target.join(legacy_relative_path);
        if !legacy_path.exists() {
            state.files.remove(legacy_relative_path);
            continue;
        }

        if let Some(previous_hash) = state.files.remove(legacy_relative_path) {
            state
                .files
                .entry(current_relative_path.to_string())
                .or_insert(previous_hash);
        }

        let current_path = target.join(current_relative_path);
        if current_path.exists() {
            fs::remove_file(&legacy_path).map_err(|e| {
                format!(
                    "Failed to remove migrated legacy sample note {:?}: {}",
                    legacy_path, e
                )
            })?;
            continue;
        }

        if let Some(parent) = current_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory {:?}: {}", parent, e))?;
        }

        fs::rename(&legacy_path, &current_path).map_err(|e| {
            format!(
                "Failed to rename legacy sample note {:?} to {:?}: {}",
                legacy_path, current_path, e
            )
        })?;
    }

    Ok(())
}

fn remove_stale_sample_note_files(
    target: &Path,
    previous_state: &SampleNotesState,
    source_hashes: &BTreeMap<String, String>,
) -> Result<(), String> {
    for (relative_path, tracked_hash) in &previous_state.files {
        if source_hashes.contains_key(relative_path) {
            continue;
        }

        let target_path = target.join(relative_path);
        if !target_path.exists() {
            continue;
        }

        let current_hash = hash_file(&target_path)?;
        if current_hash != *tracked_hash {
            continue;
        }

        fs::remove_file(&target_path).map_err(|e| {
            format!(
                "Failed to remove stale sample note {:?}: {}",
                target_path, e
            )
        })?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn publish_requires_github_token() {
        let request = PublishSimpleBlogRequest {
            blog_repo_url: "https://github.com/Yunz93/bxyz-blog".to_string(),
            blog_github_token: None,
            post_relative_path: "posts/test-post.md".to_string(),
            asset_directory_relative_path: "resource/test-post".to_string(),
            markdown_content: "---\ntitle: test\n---\n\nbody\n".to_string(),
            assets: vec![],
        };

        let error =
            tauri::async_runtime::block_on(publish_remote_simple_blog(&request)).unwrap_err();
        assert!(error.contains("GitHub token is required"));
    }

    #[test]
    fn local_path_is_rejected_as_blog_repo_url() {
        assert!(normalize_repo_target("/Users/yunz/Code/VibeCoding/simple-blog").is_err());
    }

    #[test]
    fn github_assets_are_rewritten_to_raw_urls() {
        let rewritten = rewrite_markdown_asset_urls(
            "![cover](/resource/test-post/01-cover.txt)",
            &[PublishSimpleBlogAsset {
                source_path: "/tmp/cover.txt".to_string(),
                target_relative_path: "resource/test-post/01-cover.txt".to_string(),
            }],
            "https://github.com/Yunz93/bxyz-blog",
            "main",
        )
        .unwrap();

        assert_eq!(
            rewritten,
            "![cover](https://raw.githubusercontent.com/Yunz93/bxyz-blog/main/resource/test-post/01-cover.txt)"
        );
    }

    #[test]
    fn untracked_existing_sample_note_is_replaced_with_latest_bundle_version() {
        let temp_dir = create_test_directory("sample-note-replace");
        let target_path = temp_dir.join("02-Obsidian-内联语法示例.md");
        fs::write(&target_path, "# old sample version\n").expect("write target");

        let decision = decide_copy_action(&target_path, &hash_bytes(b"# bundled version\n"), None)
            .expect("copy decision");

        assert!(decision.should_copy);
        assert!(!decision.skip_reason_user_modified);
        assert!(decision.tracked_hash.is_none());

        cleanup_test_directory(&temp_dir);
    }

    #[test]
    fn migrate_legacy_sample_note_removes_duplicate_file() {
        let temp_dir = create_test_directory("sample-note-migration");
        let legacy_relative_path = "02-Obsidian-内联语法.md";
        let current_relative_path = "02-Obsidian-内联语法示例.md";
        let legacy_path = temp_dir.join(legacy_relative_path);
        let current_path = temp_dir.join(current_relative_path);
        fs::write(&legacy_path, "# legacy sample\n").expect("write legacy sample");
        fs::write(&current_path, "# current bundled sample\n").expect("write current sample");

        let mut state = SampleNotesState::default();
        migrate_legacy_sample_notes(&temp_dir, &mut state).expect("migrate legacy sample");

        assert!(!legacy_path.exists());
        assert!(current_path.exists());
        assert!(state.files.get(current_relative_path).is_none());

        cleanup_test_directory(&temp_dir);
    }

    fn create_test_directory(prefix: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        let unique = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
        path.push(format!(
            "markdown-press-{}-{}-{}",
            prefix,
            std::process::id(),
            unique
        ));

        if path.exists() {
            fs::remove_dir_all(&path).expect("cleanup existing test dir");
        }

        fs::create_dir_all(&path).expect("create test dir");
        path
    }

    fn cleanup_test_directory(path: &Path) {
        if path.exists() {
            fs::remove_dir_all(path).expect("cleanup test dir");
        }
    }
}
