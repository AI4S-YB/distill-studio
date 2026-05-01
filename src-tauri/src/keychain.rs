#[tauri::command]
pub(crate) fn store_platform_password(
    platform_url: String,
    username: String,
    password: String,
) -> Result<(), String> {
    let entry = keyring::Entry::new("distill-studio", &format!("{}/{}", platform_url, username))
        .map_err(|e| format!("keyring error: {}", e))?;
    entry
        .set_password(&password)
        .map_err(|e| format!("keyring error: {}", e))
}

#[tauri::command]
pub(crate) fn load_platform_password(
    platform_url: String,
    username: String,
) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new("distill-studio", &format!("{}/{}", platform_url, username))
        .map_err(|e| format!("keyring error: {}", e))?;
    match entry.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring error: {}", e)),
    }
}
