export const courseCoverChoices = [
  ["/reference/ai.png", "知识网络"],
  ["/reference/math.png", "几何直觉"],
  ["/reference/python.png", "探索阶梯"],
  ["/reference/cognitive.png", "认知与思考"],
  ["/images/earth.jpg", "地球与远方"],
  ["/images/library.jpg", "书海"],
];

export async function prepareCourseCover(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
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
      throw new Error("请选择不超过 4000 万像素的图片。");
    const ratio = Math.min(
      1,
      960 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理图片，请重试。");
    context.fillStyle = "#faf8f5";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.84);
  } catch (error) {
    if (error.name === "EncodingError")
      throw new Error("图片无法读取，请重新选择。");
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}
