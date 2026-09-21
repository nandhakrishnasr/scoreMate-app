# Database conversion

The Android `cricket-scorer-db` file in this backup is SQLCipher-encrypted, so it cannot be read by Python's standard SQLite driver without the encryption key. Use the JSON export instead:

```powershell
python .\tools\convert_kdm_backup.py .\full_database_export.json .\gully-scorer-backup.json
```

Then open Gully Scorer and choose **History -> Import backup**, selecting the generated `gully-scorer-backup.json`.

The converter keeps completed matches only and writes the app's native backup format:

```json
{
  "active": null,
  "completed": []
}
```