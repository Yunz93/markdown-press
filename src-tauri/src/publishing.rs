use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use reqwest::{Client, Method};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::{canonicalize_existing_path, ensure_path_allowed, SecurityState};

const GITHUB_API_CONNECT_TIMEOUT_SECS: u64 = 10;
const GITHUB_API_REQUEST_TIMEOUT_SECS: u64 = 30;
const WECHAT_API_CONNECT_TIMEOUT_SECS: u64 = 10;
const WECHAT_API_REQUEST_TIMEOUT_SECS: u64 = 30;

/// Matches `identifier` in `tauri.conf.json` — log path aligns with Tauri app config folder layout.
const APP_CONFIG_DIR_NAME: &str = "com.bxyz.markdown-press";

fn publish_log_file_path() -> Option<PathBuf> {
    static CACHE: OnceLock<Option<PathBuf>> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let mut path = dirs::config_dir()?;
            path.push(APP_CONFIG_DIR_NAME);
            path.push("publish-debug.log");
            Some(path)
        })
        .clone()
}

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
    if let Some(path) = publish_log_file_path() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(file, "{}", line);
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishSimpleBlogAsset {
    source_path: String,
    target_relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishWechatLocalImageAsset {
    placeholder: String,
    source_path: Option<String>,
    source_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishSimpleBlogRequest {
    blog_repo_url: String,
    blog_github_token: Option<String>,
    post_relative_path: String,
    asset_directory_relative_path: String,
    markdown_content: String,
    assets: Vec<PublishSimpleBlogAsset>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishWechatDraftRequest {
    wechat_app_id: String,
    wechat_app_secret: Option<String>,
    draft_media_id: Option<String>,
    title: String,
    author: Option<String>,
    digest: Option<String>,
    content_source_url: Option<String>,
    show_cover_pic: bool,
    cover_image_path: String,
    content_html: String,
    image_assets: Vec<PublishWechatLocalImageAsset>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishSimpleBlogResult {
    deployment_url: Option<String>,
    build_output: String,
    deploy_output: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishWechatDraftResult {
    media_id: String,
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

#[derive(Debug, Deserialize)]
struct WechatAccessTokenResponse {
    access_token: Option<String>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WechatUploadImageResponse {
    url: Option<String>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WechatAddMaterialResponse {
    media_id: Option<String>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WechatDraftAddResponse {
    media_id: Option<String>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WechatCommonResponse {
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Debug, Serialize)]
struct WechatDraftArticleRequest {
    title: String,
    author: String,
    digest: String,
    content: String,
    content_source_url: String,
    thumb_media_id: String,
    show_cover_pic: u8,
}

#[derive(Debug, Serialize)]
struct WechatDraftAddPayload {
    articles: Vec<WechatDraftArticleRequest>,
}

#[derive(Debug, Serialize)]
struct WechatDraftUpdatePayload {
    media_id: String,
    index: u8,
    articles: WechatDraftArticleRequest,
}

#[tauri::command]
pub(crate) async fn publish_simple_blog(
    request: PublishSimpleBlogRequest,
    security_state: tauri::State<'_, SecurityState>,
) -> Result<PublishSimpleBlogResult, String> {
    validate_publish_request_access(security_state.inner(), &request)?;
    publish_remote_simple_blog(&request).await
}

#[tauri::command]
pub(crate) async fn publish_wechat_draft(
    request: PublishWechatDraftRequest,
    security_state: tauri::State<'_, SecurityState>,
) -> Result<PublishWechatDraftResult, String> {
    validate_wechat_publish_request_access(security_state.inner(), &request)?;
    publish_remote_wechat_draft(&request).await
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

fn validate_wechat_publish_request_access(
    security_state: &SecurityState,
    request: &PublishWechatDraftRequest,
) -> Result<(), String> {
    let cover_image_path = canonicalize_existing_path(&request.cover_image_path)?;
    ensure_path_allowed(security_state, &cover_image_path)?;

    for asset in &request.image_assets {
        if let Some(source_path) = asset
            .source_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let source_path = canonicalize_existing_path(source_path)?;
            ensure_path_allowed(security_state, &source_path)?;
        }
    }

    Ok(())
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

async fn publish_remote_wechat_draft(
    request: &PublishWechatDraftRequest,
) -> Result<PublishWechatDraftResult, String> {
    publish_log("publish_wechat_draft: start request");

    let app_id = request.wechat_app_id.trim();
    if app_id.is_empty() {
        return Err("WeChat AppID is required for publishing.".to_string());
    }

    let app_secret = request
        .wechat_app_secret
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "WeChat AppSecret is required for publishing.".to_string())?;

    if request.title.trim().is_empty() {
        return Err("WeChat draft title is required.".to_string());
    }

    let client = create_wechat_api_client()?;
    let access_token = fetch_wechat_access_token(&client, app_id, app_secret).await?;
    publish_log("publish_wechat_draft: access token ready");

    let mut content_html = request.content_html.clone();
    for asset in &request.image_assets {
        let url = upload_wechat_article_image(&client, &access_token, asset).await?;
        content_html = content_html.replace(&asset.placeholder, &url);
    }

    let thumb_media_id =
        upload_wechat_thumb_image(&client, &access_token, Path::new(&request.cover_image_path))
            .await?;

    let article = WechatDraftArticleRequest {
        title: request.title.trim().to_string(),
        author: request.author.as_deref().unwrap_or("").trim().to_string(),
        digest: request.digest.as_deref().unwrap_or("").trim().to_string(),
        content: content_html,
        content_source_url: request
            .content_source_url
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_string(),
        thumb_media_id,
        show_cover_pic: if request.show_cover_pic { 1 } else { 0 },
    };

    let media_id = if let Some(existing_media_id) = request
        .draft_media_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        update_wechat_draft(&client, &access_token, existing_media_id, &article).await?;
        existing_media_id.to_string()
    } else {
        create_wechat_draft(&client, &access_token, &article).await?
    };

    publish_log(format!(
        "publish_wechat_draft: finished media_id={}",
        media_id
    ));
    Ok(PublishWechatDraftResult { media_id })
}

fn create_wechat_api_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(WECHAT_API_CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(WECHAT_API_REQUEST_TIMEOUT_SECS))
        .user_agent("markdown-press")
        .build()
        .map_err(|e| format!("Failed to create WeChat API client: {}", e))
}

fn wechat_api_error(
    errcode: Option<i64>,
    errmsg: Option<String>,
    context: &str,
) -> Result<(), String> {
    match errcode.unwrap_or(0) {
        0 => Ok(()),
        code => Err(format!(
            "WeChat API error {} during {}: {}",
            code,
            context,
            errmsg.unwrap_or_else(|| "unknown error".to_string())
        )),
    }
}

async fn fetch_wechat_access_token(
    client: &Client,
    app_id: &str,
    app_secret: &str,
) -> Result<String, String> {
    let response = client
        .get("https://api.weixin.qq.com/cgi-bin/token")
        .query(&[
            ("grant_type", "client_credential"),
            ("appid", app_id),
            ("secret", app_secret),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to request WeChat access token: {}", e))?;

    let payload = response
        .json::<WechatAccessTokenResponse>()
        .await
        .map_err(|e| format!("Failed to decode WeChat access token response: {}", e))?;

    wechat_api_error(payload.errcode, payload.errmsg, "fetching access token")?;
    payload
        .access_token
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "WeChat access token response did not include access_token.".to_string())
}

fn guess_mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn guess_mime_type_from_name(name: &str) -> &'static str {
    match name
        .rsplit('.')
        .next()
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

async fn wechat_api_upload_bytes<T: DeserializeOwned>(
    client: &Client,
    url: &str,
    context: &str,
    file_name: String,
    mime_type: &str,
    bytes: Vec<u8>,
) -> Result<T, String> {
    let media = reqwest::multipart::Part::bytes(bytes)
        .file_name(file_name)
        .mime_str(mime_type)
        .map_err(|e| format!("Failed to prepare {} multipart upload: {}", context, e))?;
    let form = reqwest::multipart::Form::new().part("media", media);

    client
        .post(url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed to upload {} to WeChat API: {}", context, e))?
        .json::<T>()
        .await
        .map_err(|e| format!("Failed to decode WeChat {} upload response: {}", context, e))
}

async fn wechat_api_upload_file<T: DeserializeOwned>(
    client: &Client,
    url: &str,
    source_path: &Path,
    context: &str,
) -> Result<T, String> {
    let bytes = fs::read(source_path).map_err(|e| {
        format!(
            "Failed to read {} file {}: {}",
            context,
            source_path.display(),
            e
        )
    })?;
    let file_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("upload.bin")
        .to_string();
    wechat_api_upload_bytes(
        client,
        url,
        context,
        file_name,
        guess_mime_type(source_path),
        bytes,
    )
    .await
}

async fn wechat_api_upload_remote_url<T: DeserializeOwned>(
    client: &Client,
    url: &str,
    remote_url: &str,
    context: &str,
) -> Result<T, String> {
    let response = client.get(remote_url).send().await.map_err(|e| {
        format!(
            "Failed to download remote {} {}: {}",
            context, remote_url, e
        )
    })?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "Failed to download remote {} {}: HTTP {}",
            context, remote_url, status
        ));
    }

    let downloaded_url = response.url().clone();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.split(';').next().unwrap_or(value).trim().to_string());
    let bytes = response
        .bytes()
        .await
        .map_err(|e| {
            format!(
                "Failed to read remote {} bytes {}: {}",
                context, remote_url, e
            )
        })?
        .to_vec();
    let file_name = downloaded_url
        .path_segments()
        .and_then(|segments| segments.last())
        .filter(|segment| !segment.trim().is_empty())
        .unwrap_or("remote-image")
        .to_string();
    let mime_type = content_type
        .as_deref()
        .filter(|value| value.starts_with("image/"))
        .unwrap_or_else(|| guess_mime_type_from_name(&file_name));

    wechat_api_upload_bytes(client, url, context, file_name, mime_type, bytes).await
}

async fn upload_wechat_article_image(
    client: &Client,
    access_token: &str,
    asset: &PublishWechatLocalImageAsset,
) -> Result<String, String> {
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token={}",
        access_token
    );
    let payload: WechatUploadImageResponse = if let Some(source_path) = asset
        .source_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        wechat_api_upload_file(client, &url, Path::new(source_path), "article image").await?
    } else if let Some(source_url) = asset
        .source_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        wechat_api_upload_remote_url(client, &url, source_url, "article image").await?
    } else {
        return Err(
            "WeChat article image asset is missing both sourcePath and sourceUrl.".to_string(),
        );
    };
    wechat_api_error(payload.errcode, payload.errmsg, "uploading article image")?;
    payload
        .url
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "WeChat article image upload did not return url.".to_string())
}

async fn upload_wechat_thumb_image(
    client: &Client,
    access_token: &str,
    source_path: &Path,
) -> Result<String, String> {
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={}&type=thumb",
        access_token
    );
    let payload: WechatAddMaterialResponse =
        wechat_api_upload_file(client, &url, source_path, "thumbnail image").await?;
    wechat_api_error(payload.errcode, payload.errmsg, "uploading thumbnail image")?;
    payload
        .media_id
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "WeChat thumbnail upload did not return media_id.".to_string())
}

async fn create_wechat_draft(
    client: &Client,
    access_token: &str,
    article: &WechatDraftArticleRequest,
) -> Result<String, String> {
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/draft/add?access_token={}",
        access_token
    );
    let payload = WechatDraftAddPayload {
        articles: vec![WechatDraftArticleRequest {
            title: article.title.clone(),
            author: article.author.clone(),
            digest: article.digest.clone(),
            content: article.content.clone(),
            content_source_url: article.content_source_url.clone(),
            thumb_media_id: article.thumb_media_id.clone(),
            show_cover_pic: article.show_cover_pic,
        }],
    };

    let response = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to create WeChat draft: {}", e))?;

    let payload = response
        .json::<WechatDraftAddResponse>()
        .await
        .map_err(|e| format!("Failed to decode WeChat draft/create response: {}", e))?;
    wechat_api_error(payload.errcode, payload.errmsg, "creating draft")?;
    payload
        .media_id
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "WeChat draft/create response did not include media_id.".to_string())
}

async fn update_wechat_draft(
    client: &Client,
    access_token: &str,
    media_id: &str,
    article: &WechatDraftArticleRequest,
) -> Result<(), String> {
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/draft/update?access_token={}",
        access_token
    );
    let payload = WechatDraftUpdatePayload {
        media_id: media_id.to_string(),
        index: 0,
        articles: WechatDraftArticleRequest {
            title: article.title.clone(),
            author: article.author.clone(),
            digest: article.digest.clone(),
            content: article.content.clone(),
            content_source_url: article.content_source_url.clone(),
            thumb_media_id: article.thumb_media_id.clone(),
            show_cover_pic: article.show_cover_pic,
        },
    };

    let response = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to update WeChat draft: {}", e))?;

    let payload = response
        .json::<WechatCommonResponse>()
        .await
        .map_err(|e| format!("Failed to decode WeChat draft/update response: {}", e))?;
    wechat_api_error(payload.errcode, payload.errmsg, "updating draft")
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
