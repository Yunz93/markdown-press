use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, Mac};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const UPLOAD_CONNECT_TIMEOUT_SECS: u64 = 10;
const UPLOAD_REQUEST_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageUploadResponse {
    pub url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitHubProviderConfig {
    repo: String,
    branch: String,
    path: String,
    token: String,
    custom_domain: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct S3ProviderConfig {
    endpoint: String,
    region: String,
    bucket: String,
    path_prefix: String,
    access_key_id: String,
    secret_access_key: String,
    custom_domain: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AliyunOssProviderConfig {
    endpoint: String,
    bucket: String,
    path_prefix: String,
    access_key_id: String,
    access_key_secret: String,
    custom_domain: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QiniuProviderConfig {
    bucket: String,
    zone: String,
    access_key: String,
    secret_key: String,
    path_prefix: String,
    domain: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomProviderConfig {
    upload_url: String,
    method: String,
    headers: String,
    file_field_name: String,
    response_url_json_path: String,
}

pub async fn upload_image(
    provider: &str,
    config_json: &str,
    image_bytes: &[u8],
    filename: &str,
) -> Result<ImageUploadResponse, String> {
    match provider {
        "github" => upload_to_github(config_json, image_bytes, filename).await,
        "s3" => upload_to_s3(config_json, image_bytes, filename).await,
        "aliyun_oss" => upload_to_aliyun_oss(config_json, image_bytes, filename).await,
        "qiniu" => upload_to_qiniu(config_json, image_bytes, filename).await,
        "custom" => upload_to_custom(config_json, image_bytes, filename).await,
        _ => Err(format!("Unsupported image hosting provider: {}", provider)),
    }
}

fn create_upload_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(UPLOAD_CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(UPLOAD_REQUEST_TIMEOUT_SECS))
        .user_agent("markdown-press")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

fn content_type_for_filename(filename: &str) -> &'static str {
    let lower = filename.to_lowercase();
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else if lower.ends_with(".avif") {
        "image/avif"
    } else {
        "image/png"
    }
}

fn normalize_path_prefix(prefix: &str) -> String {
    let trimmed = prefix.trim().trim_matches('/');
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("{}/", trimmed)
    }
}

// ─── GitHub Provider ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GitHubCreateContentResponse {
    content: GitHubContentInfo,
}

#[derive(Debug, Deserialize)]
struct GitHubContentInfo {
    download_url: Option<String>,
    path: String,
}

async fn upload_to_github(
    config_json: &str,
    image_bytes: &[u8],
    filename: &str,
) -> Result<ImageUploadResponse, String> {
    let config: GitHubProviderConfig = serde_json::from_str(config_json)
        .map_err(|e| format!("Invalid GitHub config: {}", e))?;

    if config.repo.is_empty() || config.token.is_empty() {
        return Err("GitHub repo and token are required.".to_string());
    }

    let (owner, repo) = config.repo.split_once('/')
        .ok_or("GitHub repo must be in 'owner/repo' format.")?;

    let prefix = normalize_path_prefix(&config.path);
    let file_path = format!("{}{}", prefix, filename);
    let branch = if config.branch.is_empty() { "main" } else { &config.branch };

    let client = create_upload_client()?;
    let url = format!(
        "https://api.github.com/repos/{}/{}/contents/{}",
        owner, repo, percent_encode_path(&file_path)
    );

    let body = serde_json::json!({
        "message": format!("upload: {}", filename),
        "content": BASE64_STANDARD.encode(image_bytes),
        "branch": branch,
    });

    let response = client
        .put(&url)
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", config.token))
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("GitHub upload request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let hint = if status.as_u16() == 404 {
            let token_len = config.token.len();
            format!(
                " [repo={}/{}, branch={}, token={}...({} chars)]",
                owner, repo, branch,
                if token_len > 4 { &config.token[..4] } else { "?" },
                token_len
            )
        } else {
            String::new()
        };
        return Err(format!("GitHub API returned {}: {}{}", status, text, hint));
    }

    let result: GitHubCreateContentResponse = response.json().await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    let url = if !config.custom_domain.is_empty() {
        let domain = config.custom_domain.trim_end_matches('/');
        format!("{}/{}", domain, result.content.path)
    } else {
        result.content.download_url.unwrap_or_else(|| {
            format!(
                "https://raw.githubusercontent.com/{}/{}/{}/{}",
                owner, repo, branch, file_path
            )
        })
    };

    Ok(ImageUploadResponse { url })
}

// ─── S3 Compatible Provider ─────────────────────────────────────────────────

async fn upload_to_s3(
    config_json: &str,
    image_bytes: &[u8],
    filename: &str,
) -> Result<ImageUploadResponse, String> {
    let config: S3ProviderConfig = serde_json::from_str(config_json)
        .map_err(|e| format!("Invalid S3 config: {}", e))?;

    if config.endpoint.is_empty() || config.bucket.is_empty()
        || config.access_key_id.is_empty() || config.secret_access_key.is_empty()
    {
        return Err("S3 endpoint, bucket, accessKeyId, and secretAccessKey are required.".to_string());
    }

    let prefix = normalize_path_prefix(&config.path_prefix);
    let object_key = format!("{}{}", prefix, filename);
    let content_type = content_type_for_filename(filename);

    let endpoint = config.endpoint.trim_end_matches('/');
    let host = endpoint
        .strip_prefix("https://").or_else(|| endpoint.strip_prefix("http://"))
        .unwrap_or(endpoint);
    let base_url = if endpoint.starts_with("http") { endpoint.to_string() } else { format!("https://{}", endpoint) };
    let url = format!("{}/{}/{}", base_url, config.bucket, percent_encode_path(&object_key));
    let canonical_path = format!("/{}/{}", config.bucket, percent_encode_path(&object_key));

    let region = if config.region.is_empty() { "us-east-1" } else { &config.region };
    let now_secs = now_unix_secs();
    let amz_date = format_amz_datetime(now_secs);
    let date_stamp = &amz_date[..8];
    let content_hash = hex_sha256(image_bytes);

    let signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date";
    let canonical_headers = format!(
        "content-type:{}\nhost:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
        content_type, host, content_hash, amz_date
    );
    let canonical_request = format!(
        "PUT\n{}\n\n{}\n{}\n{}",
        canonical_path, canonical_headers, signed_headers, content_hash
    );

    let scope = format!("{}/{}/s3/aws4_request", date_stamp, region);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date, scope, hex_sha256(canonical_request.as_bytes())
    );

    let signing_key = s3_derive_signing_key(&config.secret_access_key, date_stamp, region);
    let signature = hex_encode(&hmac_sha256(&signing_key, string_to_sign.as_bytes()));

    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        config.access_key_id, scope, signed_headers, signature
    );

    let client = create_upload_client()?;
    let response = client
        .put(&url)
        .header("Authorization", &authorization)
        .header("x-amz-date", &amz_date)
        .header("x-amz-content-sha256", &content_hash)
        .header("Content-Type", content_type)
        .body(image_bytes.to_vec())
        .send()
        .await
        .map_err(|e| format!("S3 upload request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("S3 returned {}: {}", status, text));
    }

    let result_url = if !config.custom_domain.is_empty() {
        let domain = config.custom_domain.trim_end_matches('/');
        format!("{}/{}", domain, object_key)
    } else {
        url
    };

    Ok(ImageUploadResponse { url: result_url })
}

fn s3_derive_signing_key(secret: &str, date: &str, region: &str) -> Vec<u8> {
    let k_date = hmac_sha256(format!("AWS4{}", secret).as_bytes(), date.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, b"s3");
    hmac_sha256(&k_service, b"aws4_request")
}

// ─── Aliyun OSS Provider ────────────────────────────────────────────────────

async fn upload_to_aliyun_oss(
    config_json: &str,
    image_bytes: &[u8],
    filename: &str,
) -> Result<ImageUploadResponse, String> {
    let config: AliyunOssProviderConfig = serde_json::from_str(config_json)
        .map_err(|e| format!("Invalid Aliyun OSS config: {}", e))?;

    if config.endpoint.is_empty() || config.bucket.is_empty()
        || config.access_key_id.is_empty() || config.access_key_secret.is_empty()
    {
        return Err("Aliyun OSS endpoint, bucket, accessKeyId, and accessKeySecret are required.".to_string());
    }

    let prefix = normalize_path_prefix(&config.path_prefix);
    let object_key = format!("{}{}", prefix, filename);
    let content_type = content_type_for_filename(filename);

    let endpoint = config.endpoint.trim_end_matches('/');
    let host = format!("{}.{}", config.bucket, endpoint);
    let url = format!("https://{}/{}", host, percent_encode_path(&object_key));

    let now_secs = now_unix_secs();
    let date = format_http_date(now_secs);
    let canonicalized_resource = format!("/{}/{}", config.bucket, object_key);

    let string_to_sign = format!(
        "PUT\n\n{}\n{}\n{}",
        content_type, date, canonicalized_resource
    );
    let signature = BASE64_STANDARD.encode(hmac_sha1(
        config.access_key_secret.as_bytes(),
        string_to_sign.as_bytes(),
    ));

    let client = create_upload_client()?;
    let response = client
        .put(&url)
        .header("Authorization", format!("OSS {}:{}", config.access_key_id, signature))
        .header("Date", &date)
        .header("Content-Type", content_type)
        .body(image_bytes.to_vec())
        .send()
        .await
        .map_err(|e| format!("Aliyun OSS upload request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Aliyun OSS returned {}: {}", status, text));
    }

    let result_url = if !config.custom_domain.is_empty() {
        let domain = config.custom_domain.trim_end_matches('/');
        format!("{}/{}", domain, object_key)
    } else {
        url
    };

    Ok(ImageUploadResponse { url: result_url })
}

// ─── Qiniu Provider ─────────────────────────────────────────────────────────

async fn upload_to_qiniu(
    config_json: &str,
    image_bytes: &[u8],
    filename: &str,
) -> Result<ImageUploadResponse, String> {
    let config: QiniuProviderConfig = serde_json::from_str(config_json)
        .map_err(|e| format!("Invalid Qiniu config: {}", e))?;

    if config.bucket.is_empty() || config.access_key.is_empty()
        || config.secret_key.is_empty() || config.domain.is_empty()
    {
        return Err("Qiniu bucket, accessKey, secretKey, and domain are required.".to_string());
    }

    let prefix = normalize_path_prefix(&config.path_prefix);
    let object_key = format!("{}{}", prefix, filename);

    let deadline = now_unix_secs() + 3600;
    let policy = serde_json::json!({
        "scope": format!("{}:{}", config.bucket, object_key),
        "deadline": deadline,
    });
    let encoded_policy = URL_SAFE_NO_PAD.encode(policy.to_string().as_bytes());
    let sign = hmac_sha1(config.secret_key.as_bytes(), encoded_policy.as_bytes());
    let encoded_sign = URL_SAFE_NO_PAD.encode(&sign);
    let upload_token = format!("{}:{}:{}", config.access_key, encoded_sign, encoded_policy);

    let upload_host = qiniu_upload_host(&config.zone);
    let content_type = content_type_for_filename(filename);

    let file_part = reqwest::multipart::Part::bytes(image_bytes.to_vec())
        .file_name(filename.to_string())
        .mime_str(content_type)
        .map_err(|e| format!("Failed to create multipart file part: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .text("token", upload_token)
        .text("key", object_key.clone())
        .part("file", file_part);

    let client = create_upload_client()?;
    let response = client
        .post(upload_host)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Qiniu upload request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Qiniu returned {}: {}", status, text));
    }

    let domain = config.domain.trim_end_matches('/');
    let domain = if domain.starts_with("http") { domain.to_string() } else { format!("https://{}", domain) };
    let url = format!("{}/{}", domain, object_key);

    Ok(ImageUploadResponse { url })
}

fn qiniu_upload_host(zone: &str) -> &'static str {
    match zone {
        "z0" => "https://up-z0.qiniup.com",
        "z1" => "https://up-z1.qiniup.com",
        "z2" => "https://up-z2.qiniup.com",
        "na0" => "https://up-na0.qiniup.com",
        "as0" => "https://up-as0.qiniup.com",
        "cn-east-2" => "https://up-cn-east-2.qiniup.com",
        _ => "https://up-z0.qiniup.com",
    }
}

// ─── Custom Provider ─────────────────────────────────────────────────────────

async fn upload_to_custom(
    config_json: &str,
    image_bytes: &[u8],
    filename: &str,
) -> Result<ImageUploadResponse, String> {
    let config: CustomProviderConfig = serde_json::from_str(config_json)
        .map_err(|e| format!("Invalid custom provider config: {}", e))?;

    if config.upload_url.is_empty() {
        return Err("Custom provider upload URL is required.".to_string());
    }

    let headers: std::collections::HashMap<String, String> =
        serde_json::from_str(&config.headers).unwrap_or_default();

    let content_type = content_type_for_filename(filename);
    let field_name = if config.file_field_name.is_empty() { "file" } else { &config.file_field_name };

    let file_part = reqwest::multipart::Part::bytes(image_bytes.to_vec())
        .file_name(filename.to_string())
        .mime_str(content_type)
        .map_err(|e| format!("Failed to create multipart part: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .part(field_name.to_string(), file_part);

    let client = create_upload_client()?;
    let method = if config.method.eq_ignore_ascii_case("PUT") {
        reqwest::Method::PUT
    } else {
        reqwest::Method::POST
    };

    let mut request = client.request(method, &config.upload_url).multipart(form);

    for (key, value) in &headers {
        request = request.header(key.as_str(), value.as_str());
    }

    let response = request.send().await
        .map_err(|e| format!("Custom upload request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Custom provider returned {}: {}", status, text));
    }

    let body: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse custom provider response as JSON: {}", e))?;

    let json_path = if config.response_url_json_path.is_empty() {
        "data.url"
    } else {
        &config.response_url_json_path
    };
    let url = extract_json_path(&body, json_path)
        .ok_or_else(|| format!("Could not extract URL from response using path '{}'. Response: {}", json_path, body))?;

    Ok(ImageUploadResponse { url })
}

fn extract_json_path(value: &serde_json::Value, path: &str) -> Option<String> {
    let mut current = value;
    for segment in path.split('.') {
        let trimmed = segment.trim();
        if trimmed.is_empty() {
            continue;
        }
        current = current.get(trimmed)?;
    }
    current.as_str().map(String::from)
}

// ─── Crypto & Encoding Helpers ──────────────────────────────────────────────

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn hmac_sha1(key: &[u8], data: &[u8]) -> Vec<u8> {
    type HmacSha1 = Hmac<Sha1>;
    let mut mac = HmacSha1::new_from_slice(key).expect("HMAC accepts any key size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn hex_sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex_encode(&hasher.finalize())
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn percent_encode_path(path: &str) -> String {
    path.split('/')
        .map(|segment| {
            segment
                .as_bytes()
                .iter()
                .map(|&b| {
                    let c = b as char;
                    if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
                        (c as char).to_string()
                    } else {
                        format!("%{:02X}", b)
                    }
                })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("/")
}

// ─── Date/Time Helpers ──────────────────────────────────────────────────────

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn format_amz_datetime(secs: u64) -> String {
    let (y, m, d, hh, mm, ss) = unix_to_datetime(secs);
    format!("{:04}{:02}{:02}T{:02}{:02}{:02}Z", y, m, d, hh, mm, ss)
}

fn format_http_date(secs: u64) -> String {
    let (y, m, d, hh, mm, ss) = unix_to_datetime(secs);
    let wd = day_of_week(y, m, d);
    let wd_name = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][wd as usize];
    let m_name = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ][(m - 1) as usize];
    format!(
        "{}, {:02} {} {:04} {:02}:{:02}:{:02} GMT",
        wd_name, d, m_name, y, hh, mm, ss
    )
}

/// Howard Hinnant's civil_from_days algorithm.
fn unix_to_datetime(secs: u64) -> (i32, u32, u32, u32, u32, u32) {
    let z = (secs / 86400) as i64 + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    let time = (secs % 86400) as u32;
    (y as i32, m, d, time / 3600, (time % 3600) / 60, time % 60)
}

/// Tomohiko Sakamoto's day-of-week algorithm (0 = Sunday).
fn day_of_week(y: i32, m: u32, d: u32) -> u32 {
    let t = [0i32, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let y = if m < 3 { y - 1 } else { y };
    ((y + y / 4 - y / 100 + y / 400 + t[(m - 1) as usize] + d as i32).rem_euclid(7)) as u32
}
