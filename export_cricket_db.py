#!/usr/bin/env python3
"""
Cricket Scorer DB -> full_database_export.json converter

Decrypts the com.kdm.scorer app's SQLCipher-encrypted local database
(usually found on-device at /data/data/com.kdm.scorer/databases/cricket-scorer-db)
and dumps every user-data table into a single JSON file, in the same
shape as the app's own "full database export".

USAGE
-----
    python3 export_cricket_db.py <path-to-cricket-scorer-db> <owner-key> [output.json]

    <owner-key>   The Firebase UID of the account the app is signed in as.
                  This is the value the app itself uses as the SQLCipher
                  passphrase (found in the app's cached Firebase Auth
                  shared_prefs file on the device you extracted the db from).
    [output.json] Optional, defaults to full_database_export.json in the
                  current directory.

REQUIREMENTS
------------
Needs a SQLCipher-capable SQLite driver. Easiest path:

    pip install sqlcipher3-binary      # prebuilt wheels: Linux (and some macOS)

If no wheel exists for your OS (this currently has no Windows wheels),
install the SQLCipher CLI instead and this script will shell out to it:
  - Windows : install "DB Browser for SQLite (SQLCipher edition)" or grab a
              sqlcipher.exe build, and make sure `sqlcipher` is on your PATH.
  - macOS   : brew install sqlcipher
  - Linux   : apt-get install sqlcipher   (or your distro's equivalent)
"""
import base64
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile

# Tables that hold the app's own bookkeeping rather than your data —
# excluded to match the app's own "full export" shape.
EXCLUDED_TABLES = {"Migrations", "room_master_table", "sqlite_sequence", "android_metadata"}


def _row_to_json_safe(row):
    """Convert a sqlite3.Row to a plain dict, base64-encoding any BLOBs."""
    out = {}
    for key in row.keys():
        val = row[key]
        if isinstance(val, (bytes, bytearray)):
            val = base64.b64encode(bytes(val)).decode("ascii")
        out[key] = val
    return out


def _list_tables(cur):
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return [r[0] for r in cur.fetchall() if r[0] not in EXCLUDED_TABLES and not r[0].startswith("sqlite_")]


def export_via_pysqlcipher(db_path, key, out_path):
    try:
        from sqlcipher3 import dbapi2 as sqlcipher
    except ImportError:
        return False

    con = sqlcipher.connect(db_path)
    con.row_factory = sqlcipher.Row
    cur = con.cursor()
    cur.execute(f"PRAGMA key = '{key}'")
    # Android apps built against various SQLCipher versions store the
    # header/HMAC layout differently. Try compatibility modes until one
    # actually unlocks the file.
    unlocked = False
    for compat in (4, 3, 2, 1):
        try:
            cur.execute(f"PRAGMA cipher_compatibility = {compat}")
            cur.execute("SELECT count(*) FROM sqlite_master")
            unlocked = True
            break
        except Exception:
            continue
    if not unlocked:
        con.close()
        raise RuntimeError("Could not unlock database with the given key at any known SQLCipher compatibility level.")

    data = {}
    for table in _list_tables(cur):
        cur.execute(f'SELECT * FROM "{table}"')
        data[table] = [_row_to_json_safe(r) for r in cur.fetchall()]
    con.close()

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return True


def export_via_cli(db_path, key, out_path):
    if shutil.which("sqlcipher") is None:
        raise RuntimeError(
            "Neither the 'sqlcipher3' python package nor the 'sqlcipher' CLI "
            "tool is available. Install one of them (see the top of this file) "
            "and try again."
        )

    with tempfile.TemporaryDirectory() as tmp:
        plain_db = os.path.join(tmp, "plain.db")
        last_err = None
        for compat in (4, 3, 2, 1):
            script = f"""
PRAGMA key = '{key}';
PRAGMA cipher_compatibility = {compat};
ATTACH DATABASE '{plain_db}' AS plaintext KEY '';
SELECT sqlcipher_export('plaintext');
DETACH DATABASE plaintext;
"""
            if os.path.exists(plain_db):
                os.remove(plain_db)
            result = subprocess.run(
                ["sqlcipher", db_path],
                input=script,
                capture_output=True,
                text=True,
            )
            if os.path.exists(plain_db) and os.path.getsize(plain_db) > 0:
                last_err = None
                break
            last_err = result.stderr or result.stdout
        if last_err is not None or not os.path.exists(plain_db):
            raise RuntimeError(f"Failed to unlock database with the given key.\n{last_err}")

        con = sqlite3.connect(plain_db)
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        data = {}
        for table in _list_tables(cur):
            cur.execute(f'SELECT * FROM "{table}"')
            data[table] = [_row_to_json_safe(r) for r in cur.fetchall()]
        con.close()

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return True


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    db_path = sys.argv[1]
    key = sys.argv[2]
    out_path = sys.argv[3] if len(sys.argv) > 3 else "full_database_export.json"

    if not os.path.isfile(db_path):
        print(f"Database file not found: {db_path}")
        sys.exit(1)

    # SQLCipher/SQLite need a writable directory alongside the db file
    # (for locking/journal files), so always work off a local temp copy.
    work_dir = tempfile.mkdtemp(prefix="cricket_db_")
    local_db = os.path.join(work_dir, "cricket-scorer-db")
    shutil.copyfile(db_path, local_db)
    db_path = local_db

    try:
        if export_via_pysqlcipher(db_path, key, out_path):
            pass
        else:
            export_via_cli(db_path, key, out_path)
    except Exception as e:
        print(f"Export failed: {e}")
        sys.exit(1)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"Wrote {out_path} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
