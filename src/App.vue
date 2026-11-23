<script setup lang="ts">
import {
  Check,
  Download,
  Minus,
  Plus,
  Picture as ImageIcon,
  RefreshLeft,
  UploadFilled,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const OUTPUT_FORMATS = {
  landscape: { width: 1920, height: 1080, ratio: '16:9', label: '宽屏 16:9' },
  portrait: { width: 1080, height: 1920, ratio: '9:16', label: '竖屏 9:16' },
} as const
const MAX_ZOOM = 5
const JPEG_QUALITY = 0.8

type OutputFormatKey = keyof typeof OUTPUT_FORMATS

interface CropFrame {
  x: number
  y: number
  width: number
  height: number
}

const fileInput = ref<HTMLInputElement | null>(null)
const workspace = ref<HTMLElement | null>(null)
const cropFrame = ref<HTMLElement | null>(null)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const sourceImage = ref<HTMLImageElement | null>(null)
const imageName = ref('')
const imageSize = ref('')
const outputFormatKey = ref<OutputFormatKey>('landscape')
const zoom = ref(1)
const imageLeft = ref(0)
const imageTop = ref(0)
const isDragging = ref(false)
const hasImage = computed(() => sourceImage.value !== null)
const formatKeys = Object.keys(OUTPUT_FORMATS) as OutputFormatKey[]
const outputFormat = computed(() => ({
  key: outputFormatKey.value,
  ...OUTPUT_FORMATS[outputFormatKey.value],
}))

let resizeObserver: ResizeObserver | undefined
let objectUrl = ''
let loadSequence = 0
let dragOrigin: { pointerX: number; pointerY: number; left: number; top: number } | null = null

function getFrame(): CropFrame | null {
  if (!workspace.value || !cropFrame.value) return null

  const stageRect = workspace.value.getBoundingClientRect()
  const frameRect = cropFrame.value.getBoundingClientRect()
  if (!stageRect.width || !stageRect.height) return null

  return {
    x: frameRect.left - stageRect.left,
    y: frameRect.top - stageRect.top,
    width: frameRect.width,
    height: frameRect.height,
  }
}

function getFitScale(frame = getFrame()): number {
  const image = sourceImage.value
  if (!frame || !image) return 1
  return Math.max(frame.width / image.naturalWidth, frame.height / image.naturalHeight)
}

function clampImagePosition(nextLeft: number, nextTop: number, scale: number): void {
  const frame = getFrame()
  const image = sourceImage.value
  if (!frame || !image) return

  const imageWidth = image.naturalWidth * scale
  const imageHeight = image.naturalHeight * scale
  imageLeft.value = Math.min(frame.x, Math.max(frame.x + frame.width - imageWidth, nextLeft))
  imageTop.value = Math.min(frame.y, Math.max(frame.y + frame.height - imageHeight, nextTop))
}

function centerImage(): void {
  const frame = getFrame()
  const image = sourceImage.value
  if (!frame || !image) return

  const scale = getFitScale(frame) * zoom.value
  clampImagePosition(
    frame.x + (frame.width - image.naturalWidth * scale) / 2,
    frame.y + (frame.height - image.naturalHeight * scale) / 2,
    scale,
  )
}

function drawPreview(): void {
  const canvas = previewCanvas.value
  const stage = workspace.value
  const frame = getFrame()
  const image = sourceImage.value
  if (!canvas || !stage || !frame) return

  const bounds = stage.getBoundingClientRect()
  const pixelRatio = window.devicePixelRatio || 1
  const canvasWidth = Math.round(bounds.width * pixelRatio)
  const canvasHeight = Math.round(bounds.height * pixelRatio)
  if (canvas.width !== canvasWidth) canvas.width = canvasWidth
  if (canvas.height !== canvasHeight) canvas.height = canvasHeight

  const context = canvas.getContext('2d')
  if (!context) {
    ElMessage.error('无法初始化图片预览，请刷新页面后重试')
    return
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, bounds.width, bounds.height)
  if (image) {
    const scale = getFitScale(frame) * zoom.value
    context.drawImage(
      image,
      imageLeft.value,
      imageTop.value,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    )
  }
}

watch([zoom, imageLeft, imageTop], drawPreview)

function openFilePicker(): void {
  fileInput.value?.click()
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function loadImage(file: File): void {
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择有效的图片文件')
    return
  }

  const sequence = ++loadSequence
  const nextUrl = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => {
    if (sequence !== loadSequence) {
      URL.revokeObjectURL(nextUrl)
      return
    }

    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = nextUrl
    sourceImage.value = image
    imageName.value = file.name
    imageSize.value = formatFileSize(file.size)
    zoom.value = 1
    nextTick(() => {
      centerImage()
      drawPreview()
    })
  }
  image.onerror = () => {
    URL.revokeObjectURL(nextUrl)
    if (sequence === loadSequence) ElMessage.error('图片读取失败，请尝试其他文件')
  }
  image.src = nextUrl
}

function handleFileSelection(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) loadImage(file)
}

function handleFileDrop(event: DragEvent): void {
  const file = event.dataTransfer?.files[0]
  if (file) loadImage(file)
}

function setZoom(nextZoom: number, anchor?: { x: number; y: number }): void {
  const frame = getFrame()
  const image = sourceImage.value
  const boundedZoom = Math.min(MAX_ZOOM, Math.max(1, nextZoom))
  if (!frame || !image || boundedZoom === zoom.value) {
    zoom.value = boundedZoom
    return
  }

  const point = anchor ?? { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }
  const previousScale = getFitScale(frame) * zoom.value
  const nextScale = getFitScale(frame) * boundedZoom
  const imageX = (point.x - imageLeft.value) / previousScale
  const imageY = (point.y - imageTop.value) / previousScale
  zoom.value = boundedZoom
  clampImagePosition(point.x - imageX * nextScale, point.y - imageY * nextScale, nextScale)
}

function handleZoomInput(value: number | number[]): void {
  if (typeof value === 'number') setZoom(value)
}

function handleWheel(event: WheelEvent): void {
  if (!sourceImage.value || !workspace.value) return
  const stageRect = workspace.value.getBoundingClientRect()
  const direction = event.deltaY < 0 ? 1 : -1
  setZoom(zoom.value + direction * 0.1, {
    x: event.clientX - stageRect.left,
    y: event.clientY - stageRect.top,
  })
}

function startDragging(event: PointerEvent): void {
  if (!sourceImage.value || event.button !== 0 || !workspace.value) return
  workspace.value.setPointerCapture(event.pointerId)
  dragOrigin = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    left: imageLeft.value,
    top: imageTop.value,
  }
  isDragging.value = true
}

function dragImage(event: PointerEvent): void {
  if (!dragOrigin || !sourceImage.value) return
  const scale = getFitScale() * zoom.value
  clampImagePosition(
    dragOrigin.left + event.clientX - dragOrigin.pointerX,
    dragOrigin.top + event.clientY - dragOrigin.pointerY,
    scale,
  )
}

function stopDragging(): void {
  dragOrigin = null
  isDragging.value = false
}

function resetImage(): void {
  zoom.value = 1
  centerImage()
}

async function saveCrop(): Promise<void> {
  const image = sourceImage.value
  const frame = getFrame()
  if (!image || !frame) return

  const format = outputFormat.value
  const scale = getFitScale(frame) * zoom.value
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = format.width
  outputCanvas.height = format.height
  const context = outputCanvas.getContext('2d')
  if (!context) {
    ElMessage.error('无法创建导出图片，请刷新页面后重试')
    return
  }

  const sourceX = (frame.x - imageLeft.value) / scale
  const sourceY = (frame.y - imageTop.value) / scale
  const sourceWidth = frame.width / scale
  const sourceHeight = frame.height / scale
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    format.width,
    format.height,
  )

  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      outputCanvas.toBlob((result) => {
        if (result) resolve(result)
        else reject(new Error('浏览器未能生成图片文件'))
      }, 'image/jpeg', JPEG_QUALITY)
    })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `crop-${format.width}x${format.height}.jpg`
    link.style.display = 'none'
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
    ElMessage.success('裁切图片已保存')
  } catch (error) {
    const message = error instanceof Error ? error.message : '请稍后重试'
    ElMessage.error(`图片导出失败：${message}`)
  }
}

onMounted(() => {
  if (workspace.value) {
    resizeObserver = new ResizeObserver(() => {
      if (sourceImage.value) centerImage()
      drawPreview()
    })
    resizeObserver.observe(workspace.value)
  }
  drawPreview()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  loadSequence += 1
  if (objectUrl) URL.revokeObjectURL(objectUrl)
})
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Frame 首页">
        <span class="brand-mark"><span></span><span></span><span></span><span></span></span>
        <span class="brand-name">frame<span class="brand-dot">.</span></span>
      </a>
      <div class="topbar-center">
        <span class="status-dot"></span>
        <span>本地处理</span>
        <span class="topbar-divider"></span>
        <span>图片不会上传到服务器</span>
      </div>
      <div class="topbar-version">IMAGE STUDIO <span>01</span></div>
    </header>

    <section class="page-heading">
      <div>
        <div class="eyebrow"><span>WORKSPACE</span><span class="eyebrow-line"></span><span>01 / 01</span></div>
        <h1>让每一帧，<span>恰到好处。</span></h1>
        <p>调整构图，裁出刚刚好的 {{ outputFormat.ratio }} 画面。</p>
      </div>
      <div class="heading-output">
        <span class="output-label">导出尺寸</span>
        <strong>{{ outputFormat.width }} <i>×</i> {{ outputFormat.height }}<span>px</span></strong>
      </div>
    </section>

    <section class="editor-layout">
      <div class="editor-main">
        <div class="workspace-wrap">
          <div
            ref="workspace"
            class="workspace"
            :class="{
              'is-dragging': isDragging,
              'is-empty': !hasImage,
              'is-portrait': outputFormat.key === 'portrait',
            }"
            @pointerdown="startDragging"
            @pointermove="dragImage"
            @pointerup="stopDragging"
            @pointercancel="stopDragging"
            @wheel.prevent="handleWheel"
            @dragover.prevent
            @drop.prevent="handleFileDrop"
          >
            <canvas ref="previewCanvas" class="preview-canvas"></canvas>
            <div class="workspace-vignette"></div>
            <div ref="cropFrame" class="crop-frame">
              <span class="frame-corner corner-tl"></span>
              <span class="frame-corner corner-tr"></span>
              <span class="frame-corner corner-bl"></span>
              <span class="frame-corner corner-br"></span>
              <span class="frame-crosshair crosshair-center"></span>
            </div>
            <div class="frame-dimension">
              <span class="dimension-dot"></span>
              {{ outputFormat.width }} <span>×</span> {{ outputFormat.height }}
            </div>

            <div v-if="!hasImage" class="empty-state">
              <div class="upload-icon-wrap"><el-icon><ImageIcon /></el-icon></div>
              <div class="empty-title">从一张照片开始</div>
              <div class="empty-description">拖入图片，或从设备中选择一张照片</div>
              <el-button class="upload-button" type="primary" @click="openFilePicker">
                <el-icon><UploadFilled /></el-icon>
                选择图片
              </el-button>
              <div class="file-hint">支持 JPG、PNG、WEBP</div>
            </div>

            <div v-else class="drag-hint">
              <span class="drag-hint-dot"></span>
              拖动图片调整构图
            </div>
          </div>
        </div>

        <div class="editor-controls" :class="{ 'controls-disabled': !hasImage }">
          <div class="zoom-control">
            <el-button class="icon-button" text :disabled="!hasImage || zoom <= 1" aria-label="缩小" @click="setZoom(zoom - 0.1)">
              <el-icon><Minus /></el-icon>
            </el-button>
            <el-slider
              :model-value="zoom"
              :min="1"
              :max="MAX_ZOOM"
              :step="0.01"
              :show-tooltip="false"
              :disabled="!hasImage"
              @input="handleZoomInput"
            />
            <el-button class="icon-button" text :disabled="!hasImage || zoom >= MAX_ZOOM" aria-label="放大" @click="setZoom(zoom + 0.1)">
              <el-icon><Plus /></el-icon>
            </el-button>
            <span class="zoom-value">{{ Math.round(zoom * 100) }}<small>%</small></span>
          </div>
          <el-button class="reset-button" text :disabled="!hasImage" @click="resetImage">
            <el-icon><RefreshLeft /></el-icon>
            重置
          </el-button>
          <span class="control-divider"></span>
          <span class="shortcut-hint"><kbd>滚轮</kbd> 缩放 <span class="hint-separator">·</span> 拖动移动</span>
        </div>
      </div>

      <aside class="settings-panel">
        <div class="panel-heading">
          <div>
            <div class="panel-overline">YOUR CANVAS</div>
            <h2>画布设置</h2>
          </div>
          <span class="panel-number">01</span>
        </div>

        <div class="settings-section">
          <div class="section-label">输出比例</div>
          <div class="ratio-options">
            <button
              v-for="format in formatKeys"
              :key="format"
              class="ratio-card"
              :class="{ 'is-selected': outputFormat.key === format }"
              type="button"
              :aria-pressed="outputFormat.key === format"
              @click="outputFormatKey = format"
            >
              <span class="ratio-preview" :class="{ 'is-portrait': format === 'portrait' }"><span></span></span>
              <span class="ratio-copy">
                <strong>{{ OUTPUT_FORMATS[format].label }}</strong>
                <small v-if="format === 'landscape'">Landscape · 适用于视频与桌面</small>
                <small v-else>Portrait · 适用于手机与竖版内容</small>
              </span>
              <el-icon v-if="outputFormat.key === format" class="ratio-check"><Check /></el-icon>
            </button>
          </div>
        </div>

        <div class="settings-section size-section">
          <div class="section-label">图片尺寸</div>
          <div class="size-fields">
            <div class="size-field"><span>宽度</span><strong>{{ outputFormat.width }} <small>px</small></strong></div>
            <span class="size-times">×</span>
            <div class="size-field"><span>高度</span><strong>{{ outputFormat.height }} <small>px</small></strong></div>
          </div>
        </div>

        <div class="settings-section source-section">
          <div class="section-label">当前图片</div>
          <div v-if="hasImage" class="source-card">
            <div class="source-thumbnail"><el-icon><ImageIcon /></el-icon></div>
            <div class="source-info"><strong :title="imageName">{{ imageName }}</strong><span>{{ imageSize }} · 原始画质</span></div>
            <button class="replace-button" type="button" aria-label="更换图片" @click="openFilePicker">更换</button>
          </div>
          <div v-else class="source-empty">选择图片后，在此查看文件信息</div>
        </div>

        <div class="panel-spacer"></div>
        <div class="privacy-note"><span class="privacy-icon">↗</span><span>所有处理都在浏览器本地完成<br />你的照片始终留在自己的设备上</span></div>

        <el-button class="save-button" type="primary" :disabled="!hasImage" @click="saveCrop">
          <el-icon><Download /></el-icon>
          确认并保存
          <span class="save-format">JPG</span>
        </el-button>
        <div class="save-note">JPEG 质量 80% · 无水印</div>
      </aside>
    </section>

    <footer class="page-footer">
      <span>FRAME <span class="footer-divider">/</span> IMAGE CROP STUDIO</span>
      <span>精确裁切，尽在一帧。</span>
    </footer>

    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      accept="image/*"
      @change="handleFileSelection"
    />
  </main>
</template>
