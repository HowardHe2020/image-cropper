# Frame 图片裁切工作室

基于 Vue 3、TypeScript、Vite 和 Element Plus 构建。在浏览器中打开本地照片，拖动或缩放构图，并选择导出为 1920 × 1080 横版或 1080 × 1920 竖版 JPG（质量 80%）。图片在本地处理，不会上传。

## 开发

```sh
npm install
npm run dev
```

## 构建

```sh
npm run build
```

支持鼠标拖动、滚轮缩放、缩放滑块和重置构图。导出文件名会根据所选尺寸生成，如 `crop-1920x1080.jpg` 或 `crop-1080x1920.jpg`。
