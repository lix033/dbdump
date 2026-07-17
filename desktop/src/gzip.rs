use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::copy;

/// Compresse le fichier produit et retire l'original. Renvoie le nouveau chemin.
/// Utilisé pour les outils qui ne savent pas compresser (mysqldump, sqlite3).
pub fn gzip_file(path: &str) -> Result<String, String> {
    let gz_path = format!("{path}.gz");
    let mut input = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let output = std::fs::File::create(&gz_path).map_err(|e| e.to_string())?;
    let mut encoder = GzEncoder::new(output, Compression::default());
    copy(&mut input, &mut encoder).map_err(|e| e.to_string())?;
    encoder.finish().map_err(|e| e.to_string())?;
    drop(input);
    std::fs::remove_file(path).map_err(|e| e.to_string())?;
    Ok(gz_path)
}
