mod image_hosting;
mod publishing;
mod secure_settings;

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use secure_settings::{get_secure_settings, set_secure_secret};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

const SAMPLE_NOTES_STATE_FILE: &str = ".markdown-press-sample-notes-state.json";
const SAMPLE_NOTES_FOLDER_NAME: &str = "示例笔记";
const LEGACY_SAMPLE_NOTES_RENAMES: [(&str, &str); 1] =
    [("02-Obsidian-内联语法.md", "02-Obsidian-内联语法示例.md")];
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(target_os = "windows")]
fn configure_background_command(command: &mut Command) -> &mut Command {
    command.creation_flags(CREATE_NO_WINDOW)
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

#[derive(Debug, Clone)]
struct AllowedPathEntry {
    path: PathBuf,
    recursive: bool,
}

#[derive(Debug, Default)]
struct SecurityState {
    allowed_paths: Mutex<Vec<AllowedPathEntry>>,
}

#[derive(Debug, Default)]
struct OpenedFilesState {
    paths: Mutex<Vec<String>>,
}

fn canonicalize_existing_path(path: &str) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|e| format!("Failed to resolve path {}: {}", path, e))
}

fn canonicalize_scope_path(path: &str) -> Result<PathBuf, String> {
    match fs::canonicalize(path) {
        Ok(canonical) => Ok(canonical),
        Err(_) => {
            let candidate = PathBuf::from(path);
            let parent = candidate.parent().ok_or_else(|| {
                format!("Failed to resolve path {}: missing parent directory", path)
            })?;
            let canonical_parent = fs::canonicalize(parent)
                .map_err(|e| format!("Failed to resolve path {}: {}", path, e))?;
            let file_name = candidate.file_name().ok_or_else(|| {
                format!(
                    "Failed to resolve path {}: missing final path segment",
                    path
                )
            })?;
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

fn is_markdown_file_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "md" | "markdown"))
        .unwrap_or(false)
}

fn normalize_opened_file_path(path: PathBuf) -> Option<String> {
    let canonical = fs::canonicalize(path).ok()?;
    if !canonical.is_file() || !is_markdown_file_path(&canonical) {
        return None;
    }
    Some(canonical.to_string_lossy().into_owned())
}

fn opened_file_paths_from_urls(urls: &[tauri::Url]) -> Vec<String> {
    urls.iter()
        .filter_map(|url| url.to_file_path().ok())
        .filter_map(normalize_opened_file_path)
        .collect()
}

fn opened_file_paths_from_args(args: &[String], cwd: &str) -> Vec<String> {
    let cwd = PathBuf::from(cwd);

    args.iter()
        .filter(|arg| !arg.starts_with('-'))
        .filter_map(|arg| {
            if let Ok(url) = tauri::Url::parse(arg) {
                return url.to_file_path().ok();
            }

            let candidate = PathBuf::from(arg);
            Some(if candidate.is_absolute() {
                candidate
            } else {
                cwd.join(candidate)
            })
        })
        .filter_map(normalize_opened_file_path)
        .collect()
}

fn queue_opened_file_paths(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }

    if let Ok(mut queued_paths) = app.state::<OpenedFilesState>().paths.lock() {
        for path in &paths {
            if !queued_paths.contains(path) {
                queued_paths.push(path.clone());
            }
        }
    }

    let _ = app.emit("opened-files", paths);
}

#[tauri::command]
fn open_file_in_new_window(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let Some(normalized) = normalize_opened_file_path(PathBuf::from(path)) else {
        return Err("Only existing Markdown files can be opened.".to_string());
    };

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Failed to read system time.".to_string())?
        .as_millis();
    let label = format!("file-{}", now_ms);

    let encoded = urlencoding::encode(&normalized);
    let url = tauri::WebviewUrl::App(format!("index.html?openFile={}", encoded).into());
    let window = tauri::WebviewWindowBuilder::new(&app, label, url)
        .title("Markdown Press")
        .build()
        .map_err(|e| format!("Failed to create window: {}", e))?;

    let _ = window.show();
    let _ = window.set_focus();

    Ok(())
}

#[tauri::command]
async fn upload_image_to_hosting(
    provider: String,
    config_json: String,
    image_base64: String,
    filename: String,
) -> Result<image_hosting::ImageUploadResponse, String> {
    let image_bytes = BASE64_STANDARD
        .decode(image_base64.trim())
        .map_err(|e| format!("Failed to decode image data: {}", e))?;
    image_hosting::upload_image(&provider, &config_json, &image_bytes, &filename).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let _ = app.get_webview_window("main").map(|window| {
                let _ = window.show();
                let _ = window.set_focus();
            });

            let paths = opened_file_paths_from_args(&args, &cwd);
            queue_opened_file_paths(app, paths);
        }));
    }

    builder
        .manage(SecurityState::default())
        .manage(OpenedFilesState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            ping,
            take_opened_files,
            open_file_in_new_window,
            get_secure_settings,
            set_secure_secret,
            list_system_fonts,
            register_allowed_path,
            delete_path_recursively,
            reveal_in_explorer,
            copy_sample_notes,
            publishing::publish_simple_blog,
            publishing::publish_wechat_draft,
            upload_image_to_hosting
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            {
                if let tauri::RunEvent::Opened { urls } = event {
                    let paths = opened_file_paths_from_urls(&urls);
                    queue_opened_file_paths(app, paths);
                }
            }
        });
}

#[tauri::command]
fn ping() -> Result<String, String> {
    Ok("pong".to_string())
}

#[tauri::command]
fn take_opened_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let opened_files_state = app.state::<OpenedFilesState>();
    let mut paths = opened_files_state
        .paths
        .lock()
        .map_err(|_| "Failed to acquire opened files lock.".to_string())?;

    Ok(paths.drain(..).collect())
}

#[tauri::command]
async fn list_system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| collect_system_fonts())
        .await
        .map_err(|e| format!("Failed to join system font query task: {}", e))?
}

fn collect_system_fonts() -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("system_profiler")
            .args(["SPFontsDataType", "-detailLevel", "mini", "-json"])
            .output()
            .map_err(|e| format!("Failed to query fonts from system_profiler: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "system_profiler failed with status {}",
                output.status
            ));
        }

        let payload: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Failed to parse system font list JSON: {}", e))?;
        let mut families = BTreeSet::new();

        if let Some(items) = payload
            .get("SPFontsDataType")
            .and_then(|value| value.as_array())
        {
            for item in items {
                if let Some(family) = item.get("family").and_then(|value| value.as_str()) {
                    let trimmed = family.trim();
                    if !trimmed.is_empty() {
                        families.insert(trimmed.to_string());
                    }
                    continue;
                }

                if let Some(name) = item.get("_name").and_then(|value| value.as_str()) {
                    let trimmed = name.trim();
                    if !trimmed.is_empty() {
                        families.insert(trimmed.to_string());
                    }
                }
            }
        }

        return Ok(families.into_iter().collect());
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("powershell");
        configure_background_command(&mut command);
        let output = command
            .args([
                "-NoProfile",
                "-Command",
                "Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts' | Select-Object -ExcludeProperty PS* | ConvertTo-Json -Compress",
            ])
            .output()
            .map_err(|e| format!("Failed to query fonts from PowerShell: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "PowerShell font query failed with status {}",
                output.status
            ));
        }

        let payload: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Failed to parse PowerShell font list JSON: {}", e))?;
        let mut families = BTreeSet::new();

        if let Some(map) = payload.as_object() {
            for key in map.keys() {
                let family = key
                    .split('(')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .trim_end_matches(" & ")
                    .trim();
                if !family.is_empty() {
                    families.insert(family.to_string());
                }
            }
        }

        return Ok(families.into_iter().collect());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let output = Command::new("fc-list")
            .args([":", "family"])
            .output()
            .map_err(|e| format!("Failed to query fonts from fc-list: {}", e))?;

        if !output.status.success() {
            return Err(format!("fc-list failed with status {}", output.status));
        }

        let stdout = String::from_utf8(output.stdout)
            .map_err(|e| format!("Failed to decode fc-list output: {}", e))?;
        let mut families = BTreeSet::new();

        for line in stdout.lines() {
            for family in line.split(',') {
                let trimmed = family.trim();
                if !trimmed.is_empty() {
                    families.insert(trimmed.to_string());
                }
            }
        }

        return Ok(families.into_iter().collect());
    }

    #[allow(unreachable_code)]
    Ok(Vec::new())
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

    if let Some(existing) = allowed_paths
        .iter_mut()
        .find(|entry| entry.path == canonical)
    {
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
            return Err(format!(
                "Finder failed to reveal path: {}",
                canonical.display()
            ));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("explorer")
            .arg(format!("/select,{}", canonical.display()))
            .status()
            .map_err(|e| format!("Failed to reveal path in Explorer: {}", e))?;
        if !status.success() {
            return Err(format!(
                "Explorer failed to reveal path: {}",
                canonical.display()
            ));
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

    #[test]
    fn opened_file_paths_from_args_resolves_relative_markdown_paths() {
        let temp_dir = create_test_directory("opened-file-args");
        let note_path = temp_dir.join("note.md");
        let text_path = temp_dir.join("note.txt");
        fs::write(&note_path, "# note\n").expect("write note");
        fs::write(&text_path, "plain text\n").expect("write text");

        let paths = opened_file_paths_from_args(
            &[
                "note.md".to_string(),
                "note.txt".to_string(),
                "--flag".to_string(),
            ],
            temp_dir.to_str().expect("temp dir path"),
        );

        assert_eq!(
            paths,
            vec![fs::canonicalize(&note_path)
                .expect("canonical note path")
                .to_string_lossy()
                .into_owned()]
        );

        cleanup_test_directory(&temp_dir);
    }

    #[test]
    fn opened_file_paths_from_urls_accepts_file_urls() {
        let temp_dir = create_test_directory("opened-file-url");
        let note_path = temp_dir.join("note.markdown");
        fs::write(&note_path, "# note\n").expect("write note");
        let url = tauri::Url::from_file_path(&note_path).expect("file url");

        let paths = opened_file_paths_from_urls(&[url]);

        assert_eq!(
            paths,
            vec![fs::canonicalize(&note_path)
                .expect("canonical note path")
                .to_string_lossy()
                .into_owned()]
        );

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
