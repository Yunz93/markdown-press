#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![copy_sample_notes])
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

/// Copy sample notes from resources to the target directory
#[tauri::command]
async fn copy_sample_notes(
  app_handle: tauri::AppHandle,
  target_dir: String,
) -> Result<(), String> {
  use std::fs;
  use std::path::Path;
  use tauri::Manager;

  // Get the resource directory
  let resource_dir = app_handle
    .path()
    .resolve("resources/sample-notes", tauri::path::BaseDirectory::Resource)
    .map_err(|e| format!("Failed to resolve sample notes resource directory: {}", e))?;

  let source = Path::new(&resource_dir);
  let target = Path::new(&target_dir);

  if !source.exists() {
    return Err("Sample notes source directory not found".to_string());
  }

  // Ensure target directory exists
  if !target.exists() {
    fs::create_dir_all(target).map_err(|e| format!("Failed to create target directory: {}", e))?;
  }

  // Recursively copy files
  copy_dir_recursive(source, target)?;

  Ok(())
}

/// Recursively copy directory contents
fn copy_dir_recursive(source: &std::path::Path, target: &std::path::Path) -> Result<(), String> {
  use std::fs;

  if !target.exists() {
    fs::create_dir_all(target).map_err(|e| format!("Failed to create directory: {}", e))?;
  }

  for entry in fs::read_dir(source).map_err(|e| format!("Failed to read directory: {}", e))? {
    let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
    let source_path = entry.path();
    let file_name = entry.file_name();
    let target_path = target.join(&file_name);

    if source_path.is_dir() {
      copy_dir_recursive(&source_path, &target_path)?;
    } else {
      fs::copy(&source_path, &target_path)
        .map_err(|e| format!("Failed to copy file: {}", e))?;
    }
  }

  Ok(())
}
