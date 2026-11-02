# 图片来源

以下照片作为本地课程封面使用，来源为 Unsplash：

- computing.jpg: https://unsplash.com/photos/tilt-shift-photography-of-green-computer-motherboard-bN5XdU-bap4 ，Chris Ried。
- library.jpg: https://unsplash.com/photos/people-explore-a-massive-book-filled-library-q4oD3fcKkJo ，Tobias Reich。
- earth.jpg: https://images.unsplash.com/photo-1451187580459-43490279c0fa 。
- math.jpg: https://images.unsplash.com/photo-1635070041078-e363dbe005cb 。

图标使用 lucide-react。矩阵实验是本项目实现的 SVG 交互图，计算使用 mathjs。

2026-10-26 参考站还原使用的课程插画、导航图标、票券背景和字体位于
`public/reference/`，来源映射见 `public/reference/sources.json` 和
`scripts/reference-assets.mjs`；页面结构与验收记录见 `DESIGN_REFERENCE.md`。
原有照片继续用作自建课程的封面回退。

MiSans 已包含 400、600、700 三档字重的 565 个本地 WOFF2 子集。
使用 `node scripts/sync-reference-fonts.mjs` 校验文件签名并补齐缺失资源。

2026-10-27 首页的学习手绘线索由本项目直接绘制，源码位于
`src/components/learning-sketch.jsx`。问号、连接线和几何图形使用 SVG 路径，
旁注复用本地板书字体；不依赖额外图片、远程字体或图像服务。

课程共创中的资料汇聚、单元连线和铅笔书写动态图形同样为项目原创 SVG，
源码位于 `src/components/generation-activity.jsx`。仅在真实请求进行中播放，
无需下载第三方动画、图片或字体。
