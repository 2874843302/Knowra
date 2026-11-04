from io import BytesIO
from pathlib import Path
from uuid import uuid4
from zipfile import BadZipFile, ZipFile

from defusedxml.ElementTree import fromstring
from fastapi import HTTPException
from pypdf import PdfReader

from app.services.database import now


ALLOWED = {"txt", "md", "csv", "pdf", "docx", "pptx"}
MAX_BYTES = 15 * 1024 * 1024


def extract_text(content, extension):
    if extension in {"txt", "md", "csv"}:
        try:
            return content.decode("utf-8-sig")
        except UnicodeDecodeError:
            return content.decode("gb18030")
    if extension == "pdf":
        reader = PdfReader(BytesIO(content))
        parts = [page.extract_text() or "" for page in reader.pages[:80]]
        if not any(p.strip() for p in parts):
            raise ValueError("这份 PDF 没有可提取的文字，请上传文字版 PDF。")
        return "\n\n".join(f"[第 {i + 1} 页]\n{p}" for i, p in enumerate(parts))
    with ZipFile(BytesIO(content)) as archive:
        if sum(item.file_size for item in archive.infolist()) > 60 * 1024 * 1024:
            raise ValueError("文档解压后过大，请拆分后上传。")
        if extension == "docx":
            root = fromstring(archive.read("word/document.xml"))
            namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
            return "\n".join("".join(n.text or "" for n in p.iter(namespace + "t")) for p in root.iter(namespace + "p"))
        slides = sorted((name for name in archive.namelist()
                         if name.startswith("ppt/slides/slide") and name.endswith(".xml")
                         and name[16:-4].isdigit()), key=lambda name: int(name[16:-4]))
        parts = []
        for i, name in enumerate(slides[:100]):
            root = fromstring(archive.read(name))
            texts = [node.text or "" for node in root.iter("{http://schemas.openxmlformats.org/drawingml/2006/main}t")]
            parts.append(f"[第 {i + 1} 张幻灯片]\n" + "\n".join(texts))
        return "\n\n".join(parts)


def save_material(db, workspace_id, filename, content):
    name = Path((filename or "资料").replace("\\", "/")).name[:240]
    extension = name.rsplit(".", 1)[-1].lower()
    if extension not in ALLOWED:
        raise HTTPException(415, "支持 PDF、PPTX、DOCX、TXT、MD 和 CSV 文件。")
    if not content or len(content) > MAX_BYTES:
        raise HTTPException(413, "文件不能为空，单个文件需小于 15 MB。")
    try:
        text = extract_text(content, extension).strip()
    except (ValueError, KeyError, BadZipFile, UnicodeError) as exc:
        raise HTTPException(422, str(exc) if isinstance(exc, ValueError) else "文档损坏或格式不正确。")
    except Exception:
        raise HTTPException(422, "无法解析这份文档，请检查格式或移除密码。")
    if not text or len(text) > 150000:
        raise HTTPException(422, "没有提取到文字或内容超过 15 万字符，请检查并拆分文件。")
    material_id = str(uuid4())
    date = now()
    directory = db.directory / "uploads" / workspace_id
    directory.mkdir(parents=True, exist_ok=True)
    file_path = directory / material_id
    file_path.write_bytes(content)
    try:
        with db.connect() as connection:
            connection.execute("INSERT INTO materials VALUES (%s, %s, %s, %s, %s, %s, %s)",
                               (material_id, workspace_id, name, len(content), text, date, extension))
    except Exception:
        file_path.unlink(missing_ok=True)
        raise
    return {"id": material_id, "name": name, "size": len(content), "text": text,
            "date": date, "extension": extension, "original": True}
