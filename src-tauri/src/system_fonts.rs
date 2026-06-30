//! System font enumeration per platform.
//!
//! Extracted from `lib.rs`. The Tauri command wrapper stays in `lib.rs`.

use std::collections::BTreeSet;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::process::Command;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(target_os = "windows")]
fn configure_background_command(command: &mut Command) -> &mut Command {
    command.creation_flags(CREATE_NO_WINDOW)
}

/// Collect installed system font family names for the current platform.
pub fn collect_system_fonts() -> Result<Vec<String>, String> {
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
