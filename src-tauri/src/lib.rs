mod image_hosting;
mod publishing;
mod sample_notes;
mod secure_settings;
mod system_fonts;
mod url_encode;

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use sample_notes::{CopySampleNotesResult, SAMPLE_NOTES_FOLDER_NAME};
use secure_settings::{get_secure_settings, set_secure_secret};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

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
    tauri::async_runtime::spawn_blocking(system_fonts::collect_system_fonts)
        .await
        .map_err(|e| format!("Failed to join system font query task: {}", e))?
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

    sample_notes::sync_sample_notes(source, &target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

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
