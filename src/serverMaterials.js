import { workspaceHeaders } from "./persistence";

export async function parseMaterial(file) {
  if (file.size > 15 * 1024 * 1024) throw new Error("单个文件需小于 15 MB。");
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/materials", {
    method: "POST",
    headers: workspaceHeaders(),
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "资料上传失败，请重试。");
  return data;
}

export async function downloadOriginal(material) {
  const response = await fetch(`/api/materials/${material.id}/file`, {
    headers: workspaceHeaders(),
  });
  if (!response.ok) throw new Error("无法下载原文件，请检查服务连接。");
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = material.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
