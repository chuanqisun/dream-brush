export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingInputAdapter {
  eventTarget: "canvas" | "window";
  preventDefault?: boolean;
  shouldStart?: (event: PointerEvent) => boolean;
  mapClientPoint: (clientPoint: DrawingPoint, canvas: HTMLCanvasElement) => DrawingPoint | null;
}

export class DrawingCanvas extends EventTarget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isDrawing: boolean;
  private hasDrawn: boolean;
  private dispatched: boolean;
  private drawingTimer: ReturnType<typeof setTimeout> | null = null;
  private lastX: number = 0;
  private lastY: number = 0;
  private lastW: number = 18;
  private lastDX: number = 0;
  private lastDY: number = 0;
  private lastV: number = 0;

  private readonly MAX_W = 14;
  private readonly MIN_W = 1.0;
  private readonly SPEED_LIMIT = 35;
  private readonly LERP_SPEED = 0.4;
  private readonly MAX_STROKE_INTERVAL = 1200;

  private inputAdapter: DrawingInputAdapter | null = null;
  private interactionLocked = false;
  private usingWindowInput = false;

  private boundStartDrawing = (e: PointerEvent) => this.startDrawing(e);
  private boundDraw = (e: PointerEvent) => this.draw(e);
  private boundPointerup = () => this.handlePointerup();
  private boundFinish = () => this.handleFinishDrawing();
  private boundPreventDefault = (e: Event) => e.preventDefault();

  constructor(canvasId: string) {
    super();

    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
    this.isDrawing = false;
    this.hasDrawn = false;
    this.dispatched = false;
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.strokeStyle = "#000";
    this.attachCanvasListeners();
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  setInputAdapter(adapter: DrawingInputAdapter | null): void {
    this.inputAdapter = adapter;
    this.syncInputListeners();
  }

  setInteractionLocked(locked: boolean): void {
    if (this.interactionLocked === locked) {
      return;
    }

    this.interactionLocked = locked;
    if (locked) {
      this.cancelStroke();
    }
  }

  readImage() {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  readBase64DataUrl(transparency?: boolean): string {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext("2d")!;
    if (!transparency) {
      tempCtx.fillStyle = "white";
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
    tempCtx.drawImage(this.canvas, 0, 0);
    return tempCanvas.toDataURL();
  }

  writeImage(data: ImageData): void {
    this.ctx.putImageData(data, 0, 0);
  }

  private clearDrawingTimer(): void {
    if (this.drawingTimer) {
      clearTimeout(this.drawingTimer);
      this.drawingTimer = null;
    }
  }

  private resetTimer(): void {
    this.clearDrawingTimer();
    this.drawingTimer = setTimeout(() => this.handleFinishDrawing(), this.MAX_STROKE_INTERVAL);
  }

  private attachCanvasListeners(): void {
    this.canvas.addEventListener("pointerdown", this.boundStartDrawing);
    this.canvas.addEventListener("pointermove", this.boundDraw);
    this.canvas.addEventListener("pointerup", this.boundPointerup);
    this.canvas.addEventListener("mouseout", this.boundFinish);
  }

  private detachCanvasListeners(): void {
    this.canvas.removeEventListener("pointerdown", this.boundStartDrawing);
    this.canvas.removeEventListener("pointermove", this.boundDraw);
    this.canvas.removeEventListener("pointerup", this.boundPointerup);
    this.canvas.removeEventListener("mouseout", this.boundFinish);
  }

  private attachWindowListeners(): void {
    window.addEventListener("pointerdown", this.boundStartDrawing);
    window.addEventListener("pointermove", this.boundDraw);
    window.addEventListener("pointerup", this.boundPointerup);
    window.addEventListener("touchmove", this.boundPreventDefault, { passive: false } as EventListenerOptions);
    window.addEventListener("dragstart", this.boundPreventDefault);
    window.addEventListener("selectstart", this.boundPreventDefault);
    window.addEventListener("contextmenu", this.boundPreventDefault);
    document.body.style.touchAction = "none";
    document.body.style.userSelect = "none";
    (document.body.style as any).webkitUserSelect = "none";
  }

  private detachWindowListeners(): void {
    window.removeEventListener("pointerdown", this.boundStartDrawing);
    window.removeEventListener("pointermove", this.boundDraw);
    window.removeEventListener("pointerup", this.boundPointerup);
    window.removeEventListener("touchmove", this.boundPreventDefault);
    window.removeEventListener("dragstart", this.boundPreventDefault);
    window.removeEventListener("selectstart", this.boundPreventDefault);
    window.removeEventListener("contextmenu", this.boundPreventDefault);
    document.body.style.touchAction = "";
    document.body.style.userSelect = "";
    (document.body.style as any).webkitUserSelect = "";
  }

  private syncInputListeners(): void {
    const shouldUseWindowInput = this.inputAdapter?.eventTarget === "window";
    if (this.usingWindowInput === shouldUseWindowInput) {
      return;
    }

    this.usingWindowInput = shouldUseWindowInput;
    if (shouldUseWindowInput) {
      this.detachCanvasListeners();
      this.attachWindowListeners();
      return;
    }

    this.detachWindowListeners();
    this.attachCanvasListeners();
  }

  private getCanvasPoint(clientX: number, clientY: number): DrawingPoint | null {
    if (this.inputAdapter) {
      return this.inputAdapter.mapClientPoint({ x: clientX, y: clientY }, this.canvas);
    }

    const rect = this.canvas.getBoundingClientRect();
    const style = window.getComputedStyle(this.canvas);
    const borderLeft = parseFloat(style.borderLeftWidth);
    const borderTop = parseFloat(style.borderTopWidth);
    const scaleX = this.canvas.width / (rect.width - borderLeft - parseFloat(style.borderRightWidth));
    const scaleY = this.canvas.height / (rect.height - borderTop - parseFloat(style.borderBottomWidth));
    let x = (clientX - rect.left - borderLeft) * scaleX;
    if (document.body.classList.contains("flip-x")) {
      x = this.canvas.width - x;
    }

    return {
      x,
      y: (clientY - rect.top - borderTop) * scaleY,
    };
  }

  private cancelStroke(): void {
    this.isDrawing = false;
    this.clearDrawingTimer();
  }

  private startDrawing(e: PointerEvent): void {
    if (this.interactionLocked) return;
    if (e.button !== 0) return;
    if (this.inputAdapter?.shouldStart && !this.inputAdapter.shouldStart(e)) return;
    if (this.inputAdapter?.preventDefault) e.preventDefault();

    const pos = this.getCanvasPoint(e.clientX, e.clientY);
    if (!pos) {
      return;
    }

    this.isDrawing = true;
    this.hasDrawn = false;
    this.dispatched = false;
    this.resetTimer();
    this.lastX = pos.x;
    this.lastY = pos.y;
    this.lastW = this.MAX_W;
    this.lastDX = 0;
    this.lastDY = 0;
    this.lastV = 0;
  }

  private draw(e: PointerEvent): void {
    if (this.interactionLocked) return;
    if (!this.isDrawing) return;
    this.resetTimer();
    const pos = this.getCanvasPoint(e.clientX, e.clientY);
    if (!pos) {
      return;
    }

    const dx = pos.x - this.lastX;
    const dy = pos.y - this.lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const targetW = Math.max(this.MIN_W, this.MAX_W - (dist / this.SPEED_LIMIT) * (this.MAX_W - this.MIN_W));
    const steps = Math.max(1, Math.ceil(dist / 2));

    let currentX = this.lastX;
    let currentY = this.lastY;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const nextX = this.lastX + dx * t;
      const nextY = this.lastY + dy * t;
      const nextW = this.lastW + (targetW - this.lastW) * (i / steps) * this.LERP_SPEED;

      this.ctx.beginPath();
      this.ctx.lineWidth = nextW;
      this.ctx.moveTo(currentX, currentY);
      this.ctx.lineTo(nextX, nextY);
      this.ctx.stroke();

      currentX = nextX;
      currentY = nextY;
    }

    this.lastDX = dx;
    this.lastDY = dy;
    this.lastV = dist;
    this.lastX = pos.x;
    this.lastY = pos.y;
    this.lastW = this.lastW + (targetW - this.lastW) * this.LERP_SPEED;
    this.hasDrawn = true;
  }

  private handlePointerup(): void {
    if (!this.isDrawing) return;

    if (this.lastV > 5) {
      let flickX = this.lastX;
      let flickY = this.lastY;
      let flickW = this.lastW;

      const vx = this.lastDX / this.lastV;
      const vy = this.lastDY / this.lastV;
      let speed = this.lastV * 0.2;

      for (let i = 0; i < 15; i++) {
        const nextX = flickX + vx * speed;
        const nextY = flickY + vy * speed;
        const nextW = flickW * 0.8;

        this.ctx.beginPath();
        this.ctx.lineWidth = nextW;
        this.ctx.moveTo(flickX, flickY);
        this.ctx.lineTo(nextX, nextY);
        this.ctx.stroke();

        flickX = nextX;
        flickY = nextY;
        flickW = nextW;
        speed *= 0.8;
        if (flickW < 0.2) break;
      }
    }

    this.isDrawing = false;
    this.hasDrawn = true;
  }

  private handleFinishDrawing(): void {
    this.clearDrawingTimer();
    if (this.hasDrawn && !this.dispatched) {
      this.dispatchEvent(new CustomEvent("drawingstop"));
      this.dispatched = true;
    }
  }

  getBoundingBox(): { x: number; y: number; width: number; height: number } | null {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    let minX = this.canvas.width;
    let minY = this.canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < this.canvas.height; y++) {
      for (let x = 0; x < this.canvas.width; x++) {
        const index = (y * this.canvas.width + x) * 4;
        const alpha = data[index + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX === -1) return null;
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasDrawn = false;
    this.dispatched = false;
    this.clearDrawingTimer();
  }
}
