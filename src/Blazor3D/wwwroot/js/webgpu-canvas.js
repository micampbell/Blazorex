// WebGPU canvas module for Blazor WebAssembly
//
// Overview
//  - This file contains a small WebGPU engine (WebGpu_Canvas) and three exported
//    functions used by the Blazor component via JS interop.
//  - The engine draws the "Pristine Grid" shader onto a <canvas> with class/id
//    'webgpu-canvas'. Camera controls are handled with pointer and wheel input.
//
// Called from C# (WebGPUCanvas.razor)
//  - initGridDemo(dotnetRef, canvasEl, options)
//      • dotnetRef: DotNetObjectReference passed from C# for callbacks
//      • canvasEl: ElementReference to the Blazor-rendered canvas
//      • options: { clearColor, lineColor, baseColor, lineWidthX, lineWidthY, sampleCount, fov, zNear, zFar }
//      • Initializes WebGPU, builds pipeline/buffers, and starts the render loop
//  - updateGridOptions(options)
//      • Hot-updates grid colors/line widths and camera config.
//      • Updates GPU uniform buffer immediately when possible.
//  - disposeGridDemo()
//      • Stops periodic callbacks and clears references; called by IAsyncDisposable.
//
// Notes for maintainers
//  - The Blazor component owns UI and parameters; this module focuses on rendering.
//  - Canvas size is controlled by CSS/layout. We reconfigure GPU surfaces on resize
//    using ResizeObserverHelper (see that class for rationale).
//  - Do not force absolute positioning here; let Blazor layout decide.

// External deps via ESM CDNs
import { vec3, mat4 } from 'https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js';

// Inject styles (avoid forcing absolute/100% so Blazor sizing works)
const injectedStyle = document.createElement('style');
injectedStyle.innerText = `
  html, body { height: 100%; margin: 0; font-family: sans-serif; }
  body { height: 100%; background-color: #222222; }
  .webgpu-canvas { display: block; width: 100%; height: auto; margin: 0; touch-action: none; }
  .error { position: absolute; z-index: 2; inset: 9em 3em; margin: 0; padding: 0; color: #FF8888; }
`;
document.head.appendChild(injectedStyle);

const FRAME_BUFFER_SIZE = Float32Array.BYTES_PER_ELEMENT * 36;

export class WebGpu_Canvas {
  // Frame uniform packing
  //  - projection (16 floats), view (16 floats)
  //  - position/time omitted (not used by current shader)
  #frameArrayBuffer = new ArrayBuffer(FRAME_BUFFER_SIZE);
  #projectionMatrix = new Float32Array(this.#frameArrayBuffer, 0, 16);
  #viewMatrix = new Float32Array(this.#frameArrayBuffer, 16 * Float32Array.BYTES_PER_ELEMENT, 16);
  // Note: camera position and time are not currently used by the shader; omitted from updates for simplicity.

  #frameMs = new Array(20);
  #frameMsIndex = 0;

  colorFormat = navigator.gpu?.getPreferredCanvasFormat?.() || 'bgra8unorm';
  depthFormat = 'depth24plus';
  sampleCount = 4;
  clearColor = { r: 0, g: 0, b: 0, a: 1.0 };
  fov = Math.PI * 0.5; zNear = 0.01; zFar = 128;

  // Grid pipeline state (previously in GridDemo)
  vertexBuffer = null;
  indexBuffer = null;
  uniformBuffer = null;
  bindGroup = null;
  pipeline = null;

  // Uniform backing store and views
  //  - A single ArrayBuffer holds lineColor (vec4), baseColor (vec4), lineWidth (vec2)
  //  - Each Float32Array points into the shared buffer with proper offsets
  //  - We update these arrays then write the contiguous buffer to the GPU
  uniformArray = new ArrayBuffer(16 * Float32Array.BYTES_PER_ELEMENT);
  lineColor = new Float32Array(this.uniformArray, 0, 4);
  baseColor = new Float32Array(this.uniformArray, 16, 4);
  lineWidth = new Float32Array(this.uniformArray, 32, 2);

  // Configurable grid options
  gridOptions = { clearColor: { r: 0, g: 0, b: 0.2, a: 1 }, lineColor: { r: 1, g: 1, b: 1, a: 1 }, baseColor: { r: 0, g: 0, b: 0, a: 1 }, lineWidthX: 0.05, lineWidthY: 0.05 };

  constructor(element = null) {
    // Prefer canvas element provided by Blazor, fallback to query
    this.canvas = element || document.querySelector('.webgpu-canvas');
    if (!this.canvas) { this.canvas = document.createElement('canvas'); document.body.appendChild(this.canvas); }
    this.context = this.canvas.getContext('webgpu');
    this.camera = new OrbitCamera(this.canvas);

    // Listen for CSS/layout size changes and reconfigure GPU targets accordingly.
    // See ResizeObserverHelper below for the HiDPI rationale.
    this.resizeObserver = new ResizeObserverHelper(this.canvas, (width, height) => {
      if (width == 0 || height == 0) return;
      this.canvas.width = width; this.canvas.height = height; this.updateProjection();
      if (this.device) { const size = { width, height }; this.#allocateRenderTargets(size); this.onResize(this.device, size); }
    });

    const frameCallback = (t) => {
      requestAnimationFrame(frameCallback);
      const frameStart = performance.now();
      this.#viewMatrix.set(this.camera.viewMatrix);
      // Projection is updated on resize; view updated each frame above.
      this.device.queue.writeBuffer(this.frameUniformBuffer, 0, this.#frameArrayBuffer);
      this.onFrame(this.device, this.context, t);
      this.#frameMs[this.#frameMsIndex++ % this.#frameMs.length] = performance.now() - frameStart;
    };

    this.#initWebGPU().then(() => {
      this.resizeObserver.callback(this.canvas.width, this.canvas.height);
      requestAnimationFrame(frameCallback);
    }).catch((error) => { this.setError(error, 'initializing WebGPU'); throw error; });
  }

  setError(error, contextString) {
    let prevError = document.querySelector('.error');
    while (prevError) { this.canvas.parentElement.removeChild(prevError); prevError = document.querySelector('.error'); }
    if (error) {
      const errorElement = document.createElement('p');
      errorElement.classList.add('error');
      errorElement.innerHTML = `<p style='font-weight: bold'>An error occured${contextString ? ' while ' + contextString : ''}:</p><pre>${error?.message ?? error}</pre>`;
      this.canvas.parentElement.appendChild(errorElement);
    }
  }

  updateProjection() { mat4.perspectiveZO(this.#projectionMatrix, this.fov, this.canvas.width / this.canvas.height, this.zNear, this.zFar); }
  get frameMs() { let avg = 0; for (const v of this.#frameMs) { if (v === undefined) return 0; avg += v; } return avg / this.#frameMs.length; }

  async #initWebGPU() {
    const adapter = await navigator.gpu.requestAdapter();
    const requiredFeatures = [];
    const featureList = adapter.features;
    if (featureList.has('texture-compression-bc')) requiredFeatures.push('texture-compression-bc');
    if (featureList.has('texture-compression-etc2')) requiredFeatures.push('texture-compression-etc2');
    this.device = await adapter.requestDevice({ requiredFeatures });
    this.context.configure({ device: this.device, format: this.colorFormat, alphaMode: 'opaque', viewFormats: [`${this.colorFormat}-srgb`] });
    this.frameUniformBuffer = this.device.createBuffer({ size: FRAME_BUFFER_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.frameBindGroupLayout = this.device.createBindGroupLayout({ label: 'Frame BGL', entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }] });
    this.frameBindGroup = this.device.createBindGroup({ label: 'Frame BG', layout: this.frameBindGroupLayout, entries: [{ binding: 0, resource: { buffer: this.frameUniformBuffer } }] });
    await this.onInit(this.device);
  }

  #allocateRenderTargets(size) {
    if (this.msaaColorTexture) this.msaaColorTexture.destroy();
    if (this.sampleCount > 1) this.msaaColorTexture = this.device.createTexture({ size, sampleCount: this.sampleCount, format: `${this.colorFormat}-srgb`, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    if (this.depthTexture) this.depthTexture.destroy();
    this.depthTexture = this.device.createTexture({ size, sampleCount: this.sampleCount, format: this.depthFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.colorAttachment = { view: this.sampleCount > 1 ? this.msaaColorTexture.createView() : undefined, resolveTarget: undefined, clearValue: this.clearColor, loadOp: 'clear', storeOp: this.sampleCount > 1 ? 'discard' : 'store' };
    this.renderPassDescriptor = { colorAttachments: [this.colorAttachment], depthStencilAttachment: { view: this.depthTexture.createView(), depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'discard' } };
  }

  get defaultRenderPassDescriptor() {
    // The current texture view may change every frame; rebuild the color target reference here.
    const colorView = this.context.getCurrentTexture().createView({ format: `${this.colorFormat}-srgb` });
    if (this.sampleCount > 1) this.colorAttachment.resolveTarget = colorView; else this.colorAttachment.view = colorView;
    return this.renderPassDescriptor;
  }

  async onInit(device) {
    // Build grid pipeline, buffers, and uniforms
    const bindGroupLayout = device.createBindGroupLayout({ label: 'Pristine Grid', entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} }] });
    const module = device.createShaderModule({ label: 'Pristine Grid', code: GRID_SHADER });

    device.createRenderPipelineAsync({
      label: 'Pristine Grid',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameBindGroupLayout, bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vertexMain',
        buffers: [{ arrayStride: 20, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x2' }] }]
      },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format: `${this.colorFormat}-srgb` }] },
      depthStencil: { format: this.depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      multisample: { count: this.sampleCount ?? 1 }
    }).then((pipeline) => { this.pipeline = pipeline; });

    const vertexArray = new Float32Array([
      -20, -0.5, -20,   0,   0,
       20, -0.5, -20, 200,   0,
      -20, -0.5,  20,   0, 200,
       20, -0.5,  20, 200, 200,
    ]);
    // Statically define a ground quad (two triangles) with large UVs to show the grid pattern.
    this.vertexBuffer = device.createBuffer({ size: vertexArray.byteLength, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertexArray);
    this.vertexBuffer.unmap();

    const indexArray = new Uint32Array([0, 1, 2, 1, 2, 3]);
    this.indexBuffer = device.createBuffer({ size: indexArray.byteLength, usage: GPUBufferUsage.INDEX, mappedAtCreation: true });
    new Uint32Array(this.indexBuffer.getMappedRange()).set(indexArray);
    this.indexBuffer.unmap();

    this.uniformBuffer = device.createBuffer({ size: this.uniformArray.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.bindGroup = device.createBindGroup({ label: 'Pristine Grid', layout: bindGroupLayout, entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }] });

    const updateUniforms = () => {
      // Copy values from JS-side options into the typed views, then write entire buffer to GPU.
      this.clearColor = this.gridOptions.clearColor;
      this.lineColor.set([ this.gridOptions.lineColor.r, this.gridOptions.lineColor.g, this.gridOptions.lineColor.b, this.gridOptions.lineColor.a ]);
      this.baseColor.set([ this.gridOptions.baseColor.r, this.gridOptions.baseColor.g, this.gridOptions.baseColor.b, this.gridOptions.baseColor.a ]);
      this.lineWidth.set([ this.gridOptions.lineWidthX, this.gridOptions.lineWidthY ]);
      device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformArray);
    };
    updateUniforms();
    this._updateUniforms = updateUniforms;
  }
  onResize(device, size) { /* grid is resolution-independent */ }
  onFrame(device, context, timestamp) {
    // Typical WebGPU frame: begin pass, bind pipeline + resources, draw, end pass, submit.
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass(this.defaultRenderPassDescriptor);
    if (this.pipeline) {
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.frameBindGroup);
      pass.setBindGroup(1, this.bindGroup);
      pass.setVertexBuffer(0, this.vertexBuffer);
      pass.setIndexBuffer(this.indexBuffer, 'uint32');
      pass.drawIndexed(6);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}

class ResizeObserverHelper extends ResizeObserver {
  // Purpose:
  //  - Keep the GPU canvas in sync with CSS/layout size changes.
  //  - On HiDPI displays, ResizeObserver provides devicePixelContentBoxSize which
  //    reports the size in physical pixels. Using this avoids blurry rendering.
  //  - When size changes, we update canvas.width/height (drawing buffer) and
  //    reallocate GPU render targets (MSAA/depth).
  constructor(element, callback) {
    super((entries) => {
      for (let entry of entries) {
        if (entry.target !== element) continue;
        // Prefer device pixel size if available (Chrome/Edge)
        if (entry.devicePixelContentBoxSize) {
          const size = entry.devicePixelContentBoxSize[0];
          callback(size.inlineSize, size.blockSize);
        } else if (entry.contentBoxSize) {
          // Firefox exposes contentBoxSize. It may be an array or a single object.
          const s = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
          callback(s.inlineSize, s.blockSize);
        } else {
          // Fallback to contentRect (CSS pixels)
          callback(entry.contentRect.width, entry.contentRect.height);
        }
      }
    });
    // Store references (not strictly needed, but aids debugging/introspection)
    this.element = element; this.callback = callback; this.observe(element);
  }
}

export class OrbitCamera {
  // Simple orbit camera with pointer drag and wheel zoom.
  //  - x/y deltas change yaw/pitch in radians
  //  - wheel changes distance with optional constraints
  orbitX = 0; orbitY = 0; maxOrbitX = Math.PI * 0.5; minOrbitX = -Math.PI * 0.5; maxOrbitY = Math.PI; minOrbitY = -Math.PI; constrainXOrbit = true; constrainYOrbit = false;
  maxDistance = 10; minDistance = 1; distanceStep = 0.005; constrainDistance = true;
  #distance = vec3.fromValues(0, 0, 1); #target = vec3.create(); #viewMat = mat4.create(); #cameraMat = mat4.create(); #position = vec3.create(); #dirty = true;
  #element; #registerElement;
  constructor(element = null) {
    let moving = false; let lastX, lastY;
    const down = (e) => { if (e.isPrimary) moving = true; lastX = e.pageX; lastY = e.pageY; };
    const move = (e) => {
      let xDelta, yDelta;
      if (document.pointerLockEnabled) { xDelta = e.movementX; yDelta = e.movementY; this.orbit(xDelta * 0.025, yDelta * 0.025); }
      else if (moving) { xDelta = e.pageX - lastX; yDelta = e.pageY - lastY; lastX = e.pageX; lastY = e.pageY; this.orbit(xDelta * 0.025, yDelta * 0.025); }
    };
    const up = (e) => { if (e.isPrimary) moving = false; };
    const wheel = (e) => { this.distance = this.#distance[2] + (-e.wheelDeltaY * this.distanceStep); e.preventDefault(); };
    this.#registerElement = (value) => {
      if (this.#element && this.#element !== value) {
        this.#element.removeEventListener('pointerdown', down);
        this.#element.removeEventListener('pointermove', move);
        this.#element.removeEventListener('pointerup', up);
        this.#element.removeEventListener('mousewheel', wheel);
      }
      this.#element = value;
      if (this.#element) {
        this.#element.addEventListener('pointerdown', down);
        this.#element.addEventListener('pointermove', move);
        this.#element.addEventListener('pointerup', up);
        this.#element.addEventListener('mousewheel', wheel);
      }
    };
    this.#element = element; this.#registerElement(element);
  }
  set element(v) { this.#registerElement(v); } get element() { return this.#element; }
  orbit(xDelta, yDelta) {
    if (!xDelta && !yDelta) return;
    this.orbitY += xDelta;
    if (this.constrainYOrbit) this.orbitY = Math.min(Math.max(this.orbitY, this.minOrbitY), this.maxOrbitY);
    else { while (this.orbitY < -Math.PI) this.orbitY += Math.PI * 2; while (this.orbitY >= Math.PI) this.orbitY -= Math.PI * 2; }
    this.orbitX += yDelta;
    if (this.constrainXOrbit) this.orbitX = Math.min(Math.max(this.orbitX, this.minOrbitX), this.maxOrbitX);
    else { while (this.orbitX < -Math.PI) this.orbitX += Math.PI * 2; while (this.orbitX >= Math.PI) this.orbitX -= Math.PI * 2; }
    this.#dirty = true;
  }
  get target() { return [this.#target[0], this.#target[1], this.#target[2]]; }
  set target(v) { this.#target[0] = v[0]; this.#target[1] = v[1]; this.#target[2] = v[2]; this.#dirty = true; }
  get distance() { return this.#distance[2]; }
  set distance(value) { this.#distance[2] = value; if (this.constrainDistance) this.#distance[2] = Math.min(Math.max(this.#distance[2], this.minDistance), this.maxDistance); this.#dirty = true; }
  #updateMatrices() { if (this.#dirty) { const mv = this.#cameraMat; mat4.identity(mv); mat4.translate(mv, mv, this.#target); mat4.rotateY(mv, mv, -this.orbitY); mat4.rotateX(mv, mv, -this.orbitX); mat4.translate(mv, mv, this.#distance); mat4.invert(this.#viewMat, this.#cameraMat); this.#dirty = false; } }
  get position() { this.#updateMatrices(); vec3.set(this.#position, 0, 0, 0); vec3.transformMat4(this.#position, this.#position, this.#cameraMat); return this.#position; }
  get viewMatrix() { this.#updateMatrices(); return this.#viewMat; }
}

// WGSL grid shader
const GRID_SHADER = `
  // WGSL implementation of the "Pristine Grid" from https://bgolus.medium.com
  fn PristineGrid(uv: vec2f, lineWidth: vec2f) -> f32 {
      let uvDDXY = vec4f(dpdx(uv), dpdy(uv));
      let uvDeriv = vec2f(length(uvDDXY.xz), length(uvDDXY.yw));
      let invertLine: vec2<bool> = lineWidth > vec2f(0.5);
      let targetWidth: vec2f = select(lineWidth, 1 - lineWidth, invertLine);
      let drawWidth: vec2f = clamp(targetWidth, uvDeriv, vec2f(0.5));
      let lineAA: vec2f = uvDeriv * 1.5;
      var gridUV: vec2f = abs(fract(uv) * 2.0 - 1.0);
      gridUV = select(1 - gridUV, gridUV, invertLine);
      var grid2: vec2f = smoothstep(drawWidth + lineAA, drawWidth - lineAA, gridUV);
      grid2 *= saturate(targetWidth / drawWidth);
      grid2 = mix(grid2, targetWidth, saturate(uvDeriv * 2.0 - 1.0));
      grid2 = select(grid2, 1.0 - grid2, invertLine);
      return mix(grid2.x, 1.0, grid2.y);
  }
  struct VertexIn { @location(0) pos: vec4f, @location(1) uv: vec2f }
  struct VertexOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
  struct Camera { projection: mat4x4f, view: mat4x4f }
  @group(0) @binding(0) var<uniform> camera: Camera;
  struct GridArgs { lineColor: vec4f, baseColor: vec4f, lineWidth: vec2f }
  @group(1) @binding(0) var<uniform> gridArgs: GridArgs;
  @vertex fn vertexMain(in: VertexIn) -> VertexOut { var out: VertexOut; out.pos = camera.projection * camera.view * in.pos; out.uv = in.uv; return out; }
  @fragment fn fragmentMain(in: VertexOut) -> @location(0) vec4f { var grid = PristineGrid(in.uv, gridArgs.lineWidth); return mix(gridArgs.baseColor, gridArgs.lineColor, grid * gridArgs.lineColor.a); }
`;

// GridDemo merged into WebGpu_Canvas above

let demo = null;
let frameIntervalId = 0;
let dotNetRef = null;

export function initGridDemo(dotnet, canvasEl, options) {
  // Entry point called by Blazor after the component renders the <canvas>.
  dotNetRef = dotnet ?? null;
  // Use the canvas ElementReference passed from Blazor if available
  const canvas = canvasEl || document.querySelector('.webgpu-canvas');
  if (!canvas) throw new Error('webgpu-canvas element not found');
  demo = new WebGpu_Canvas(canvas);

  // Apply base options including render config
  if (options) {
    if (typeof options.sampleCount === 'number') demo.sampleCount = options.sampleCount;
    if (typeof options.fov === 'number') demo.fov = options.fov;
    if (typeof options.zNear === 'number') demo.zNear = options.zNear;
    if (typeof options.zFar === 'number') demo.zFar = options.zFar;
    Object.assign(demo.gridOptions, options);
    if (typeof demo._updateUniforms === 'function') demo._updateUniforms();
  }

  // Periodically push frame ms to .NET (throttled)
  if (dotNetRef) {
    try { dotNetRef.invokeMethodAsync('OnWebGpuReady'); } catch {}
    frameIntervalId = self.setInterval(() => {
      if (!demo) return;
      const ms = demo.frameMs || 0;
      try { dotNetRef.invokeMethodAsync('OnFrameMsUpdate', ms); } catch {}
    }, 1000);
  }
}

export function updateGridOptions(options) {
  // Called by Blazor when parameters change. Uniforms are updated immediately.
  if (!demo || !options) return;
  if (typeof options.sampleCount === 'number') demo.sampleCount = options.sampleCount; // may require rebuild to fully apply
  if (typeof options.fov === 'number') demo.fov = options.fov;
  if (typeof options.zNear === 'number') demo.zNear = options.zNear;
  if (typeof options.zFar === 'number') demo.zFar = options.zFar;
  Object.assign(demo.gridOptions, options);
  if (typeof demo._updateUniforms === 'function') demo._updateUniforms();
}

export function disposeGridDemo() {
  // Called by Blazor IAsyncDisposable to tear down timers and references.
  if (frameIntervalId) { clearInterval(frameIntervalId); frameIntervalId = 0; }
  demo = null;
  dotNetRef = null;
}
