from __future__ import annotations

import os
import shlex
import time
from pathlib import Path

MODEL_FILE_EXTENSIONS = {".gguf", ".bin", ".safetensors", ".pt", ".pth", ".onnx"}


def safe_model_browse_root(value: str, fallback: Path) -> Path:
    raw = str(value or "").strip()
    path = Path(raw).expanduser() if raw else fallback
    try:
        return path.resolve()
    except OSError:
        return fallback.resolve()


def model_file_payload(path: Path) -> dict:
    try:
        stat = path.stat()
        size = stat.st_size
        updated_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
    except OSError:
        size = 0
        updated_at = ""
    return {
        "name": path.name,
        "path": str(path),
        "size": size,
        "updated_at": updated_at,
        "extension": path.suffix.lower(),
    }


def list_model_files(root: Path, query: str = "", limit: int = 80) -> dict:
    query_norm = str(query or "").strip().lower()
    files = []
    directories = []
    if not root.exists() or not root.is_dir():
        return {"root": str(root), "parent": str(root.parent), "directories": [], "files": [], "exists": False}
    try:
        children = sorted(root.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
    except OSError:
        children = []
    for child in children:
        if child.name.startswith("."):
            continue
        if child.is_dir():
            directories.append({"name": child.name, "path": str(child)})
            continue
        if child.suffix.lower() not in MODEL_FILE_EXTENSIONS:
            continue
        if query_norm and query_norm not in child.name.lower() and query_norm not in str(child).lower():
            continue
        files.append(model_file_payload(child))
        if len(files) >= limit:
            break
    return {"root": str(root), "parent": str(root.parent), "directories": directories[:80], "files": files, "exists": True}


def extract_model_path_from_command(command: str) -> str:
    try:
        parts = shlex.split(str(command or ""), posix=os.name != "nt")
    except ValueError:
        return ""
    for index, part in enumerate(parts):
        if part in {"-m", "--model"} and index + 1 < len(parts):
            return parts[index + 1]
        if part.startswith("--model="):
            return part.split("=", 1)[1]
    return ""
