//! RFC 3986 percent-encoding helpers shared by the image-hosting and
//! blog-publishing modules (previously duplicated as
//! `percent_encode_query_component` / `percent_encode_component`).

/// Percent-encode a single component, keeping only the unreserved set
/// (`A-Z a-z 0-9 - _ . ~`) and escaping everything else as `%XX`.
pub fn percent_encode_component(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for &byte in value.as_bytes() {
        let ch = byte as char;
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '~') {
            encoded.push(ch);
        } else {
            encoded.push_str(&format!("%{:02X}", byte));
        }
    }
    encoded
}

/// Percent-encode each `/`-separated path segment, preserving the slashes.
pub fn percent_encode_path(path: &str) -> String {
    path.split('/')
        .map(percent_encode_component)
        .collect::<Vec<_>>()
        .join("/")
}
