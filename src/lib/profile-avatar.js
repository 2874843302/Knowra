const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareAvatar(file) {
  if (!imageTypes.has(file.type))
    throw new Error("请选择 JPG、PNG 或 WebP 图片。");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("图片不能超过 5 MB，请换一张较小的图片。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
      !image.naturalWidth ||
      image.naturalWidth * image.naturalHeight > 40_000_000
    )
      throw new Error("图片尺寸过大，请选择不超过 4000 万像素的图片。");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理图片，请换个浏览器重试。");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = "#faf8f5";
    context.fillRect(0, 0, 256, 256);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch (error) {
    if (error.name === "EncodingError")
      throw new Error("这张图片无法读取，请重新选择图片。");
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}
