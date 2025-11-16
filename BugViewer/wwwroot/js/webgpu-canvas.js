// Minimal WebGPU canvas module for Blazor WebAssembly
// All business logic is in C# - this file only handles WebGPU API calls

import { mat4 } from 'https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js';

// ============================================================================
// Constants & Shaders
// ============================================================================

const FRAME_BUFFER_SIZE = Float32Array.BYTES_PER_ELEMENT * 32; // projection + view matrices

// WGSL Shaders (moved to top for clarity)
const GRID_SHADER = `
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
  @fragment fn fragmentMain(in: VertexOut) -> @location(0) vec4f { var grid = PristineGrid(in.uv, gridArgs.lineWidth); return mix(gridArgs.baseColor, gridArgs.lineColor, grid); }
`;

const MESH_SHADER = `
  struct Camera { projection: mat4x4f, view: mat4x4f }
  @group(0) @binding(0) var<uniform> camera: Camera;
  struct MeshUniforms { color: vec4f }
  @group(1) @binding(0) var<uniform> meshUniforms: MeshUniforms;
  struct VertexIn { @location(0) pos: vec3f }
  struct VertexOut { @builtin(position) pos: vec4f, @location(0) worldPos: vec3f }
  @vertex fn vertexMain(in: VertexIn) -> VertexOut {
    var out: VertexOut;
    out.pos = camera.projection * camera.view * vec4f(in.pos, 1.0);
    out.worldPos = in.pos;
    return out;
  }
  @fragment fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
    let normal = normalize(cross(dpdx(in.worldPos), dpdy(in.worldPos)));
    let lightDir = normalize(vec3f(1.0, 1.0, 1.0));
    let diffuse = max(dot(normal, lightDir), 0.3);
    return vec4f(meshUniforms.color.rgb * diffuse, meshUniforms.color.a);
  }
`;

const MESH_SHADER_VERTEX_COLOR = `
  struct Camera { projection: mat4x4f, view: mat4x4f }
  @group(0) @binding(0) var<uniform> camera: Camera;
  struct VertexIn {
    @location(0) pos: vec3f,
    @location(1) color: vec4f
  }
  struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) worldPos: vec3f,
    @location(1) @interpolate(flat) color: vec4f
  }
  @vertex fn vertexMain(in: VertexIn) -> VertexOut {
    var out: VertexOut;
    out.pos = camera.projection * camera.view * vec4f(in.pos, 1.0);
    out.worldPos = in.pos;
    out.color = in.color;
    return out;
  }
  @fragment fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
    let normal = normalize(cross(dpdx(in.worldPos), dpdy(in.worldPos)));
    let lightDir = normalize(vec3f(1.0, 1.0, 1.0));
    let diffuse = max(dot(normal, lightDir), 0.3);
    return vec4f(in.color.rgb * diffuse, in.color.a);
  }
`;

const BILLBOARD_LINE_SHADER = `
  struct Camera { projection: mat4x4f, view: mat4x4f }
  @group(0) @binding(0) var<uniform> camera: Camera;
  struct VertexIn {
    @location(0) pos: vec3f,
    @location(1) color: vec4f,
    @location(2) thickness: f32,
    @location(3) uv: vec2f,
    @location(4) endPos: vec3f,
    @location(5) fade: f32
  }
  struct VertexOut {
    @builtin(position) clipPos: vec4f,
    @location(0) color: vec4f,
    @location(1) uvY: f32,
    @location(2) fade: f32
  }
  @vertex fn vertexMain(in: VertexIn) -> VertexOut {
    var out: VertexOut;
    let viewStart = camera.view * vec4f(in.pos, 1.0);
    let viewEnd = camera.view * vec4f(in.endPos, 1.0);
    let rawDir = viewEnd.xy - viewStart.xy;
    let dist = max(length(rawDir), 1e-6);
    let viewDir = rawDir / dist;
    let perp = vec2f(-viewDir.y, viewDir.x);
    let axial = clamp(in.uv.x, 0.0, 1.0);
    let capOffset = in.uv.x - axial;
    let interpPos = mix(viewStart, viewEnd, vec4f(axial, axial, axial, axial));
    let offsetPerp = perp * (in.thickness * in.uv.y);
    let offsetTan = viewDir * (in.thickness * capOffset);
    let finalXY = interpPos.xy + offsetPerp + offsetTan;
    let finalPos = vec4f(finalXY, interpPos.z, interpPos.w);
    out.clipPos = camera.projection * finalPos;
    out.color = in.color;
    out.uvY = in.uv.y;
    out.fade = in.fade;
    return out;
  }
  @fragment fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
    var alpha = in.color.a;
    if (in.fade > 0.0) {
      let dist = abs(in.uvY);
      let t = clamp(1.0 - dist / (0.5 * in.fade), 0.0, 1.0);
      alpha = alpha * t;
    }
    return vec4f(in.color.rgb, alpha);
  }
`;

const BILLBOARD_SHADER = `
  struct Camera { projection: mat4x4f, view: mat4x4f }
  @group(0) @binding(0) var<uniform> camera: Camera;
  @group(1) @binding(0) var sampler0: sampler;
  @group(1) @binding(1) var texture0: texture_2d<f32>;
  struct VertexIn { @location(0) pos: vec3f, @location(1) uv: vec2f }
  struct VertexOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
  @vertex fn vertexMain(in: VertexIn) -> VertexOut {
    var out: VertexOut;
    let size = 1.0;
    let offset = vec3f((in.uv.x - 0.5) * 2.0 * size, (in.uv.y - 0.5) * 2.0 * size, 0.0);
    let right = vec3f(camera.view[0][0], camera.view[1][0], camera.view[2][0]);
    let up = vec3f(camera.view[0][1], camera.view[1][1], camera.view[2][1]);
    let world_pos = in.pos + right * offset.x + up * offset.y;
    out.pos = camera.projection * camera.view * vec4f(world_pos, 1.0);
    out.uv = in.uv;
    return out;
  }
  @fragment fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
    let color = textureSample(texture0, sampler0, in.uv);
    if (color.a < 0.1) { discard; }
    return color;
  }
`;

// ============================================================================
// Global State (WebGPU resources that can't be in C#)
// ============================================================================

let canvas = null;
let context = null;
let device = null;
let dotNetRef = null;

// Frame timing
const frameMs = new Array(20);
let frameMsIndex = 0;

// Matrices
const frameArrayBuffer = new ArrayBuffer(FRAME_BUFFER_SIZE);
const projectionMatrix = new Float32Array(frameArrayBuffer, 0, 16);
const viewMatrix = new Float32Array(frameArrayBuffer, 16 * Float32Array.BYTES_PER_ELEMENT, 16);

// GPU resources
let frameUniformBuffer = null;
let frameBindGroupLayout = null;
let frameBindGroup = null;

// Render targets
let msaaColorTexture = null;
let depthTexture = null;
let colorAttachment = null;
let renderPassDescriptor = null;

// Grid resources
let gridPipeline = null;
let gridVertexBuffer = null;
let gridIndexBuffer = null;
let gridUniformBuffer = null;
let gridBindGroup = null;
const gridUniformArray = new ArrayBuffer(16 * Float32Array.BYTES_PER_ELEMENT);
const gridLineColor = new Float32Array(gridUniformArray, 0, 4);
const gridBaseColor = new Float32Array(gridUniformArray, 16, 4);
const gridLineWidth = new Float32Array(gridUniformArray, 32, 2);

// Render settings (updated from C#)
let colorFormat = 'bgra8unorm';
let depthFormat = 'depth24plus';
let sampleCount = 4;
let clearColor = { r: 0, g: 0, b: 0, a: 1.0 };
let projectionType = 'perspective';
let fov = Math.PI * 0.5;
let orthoSize = 5.0;
let zNear = 0.01;
let zFar = 128;

// Scene objects (maintained in sync with C#)
const meshes = [];
const lines = [];
const textBillboards = [];

// ============================================================================
// Initialization
// ============================================================================

export async function initGPU_Canvas(dotnet, canvasEl, options, initialViewMatrix) {
    dotNetRef = dotnet;
    canvas = canvasEl;
    context = canvas.getContext('webgpu');

    colorFormat = navigator.gpu?.getPreferredCanvasFormat?.() || 'bgra8unorm';

    // Set initial view matrix from parameter
    viewMatrix.set(initialViewMatrix);

    // Apply options
    applyOptions(options);

    // Set up resize observer
    setupResizeObserver();

    // Initialize WebGPU
    try {
        await initWebGPU();

        // Initialize render targets BEFORE starting render loop
        if (canvas.width > 0 && canvas.height > 0) {
            allocateRenderTargets(canvas.width, canvas.height);
        }

        startRenderLoop();
        startFrameTimer();
        dotNetRef.invokeMethodAsync('OnWebGpuReady');
    } catch (error) {
        dotNetRef.invokeMethodAsync('OnWebGpuError', error.message);
        throw error;
    }
}

async function initWebGPU() {
    const adapter = await navigator.gpu.requestAdapter();
    const requiredFeatures = [];
    if (adapter.features.has('texture-compression-bc')) requiredFeatures.push('texture-compression-bc');
    if (adapter.features.has('texture-compression-etc2')) requiredFeatures.push('texture-compression-etc2');

    device = await adapter.requestDevice({ requiredFeatures });
    context.configure({
        device,
        format: colorFormat,
        alphaMode: 'opaque',
        viewFormats: [`${colorFormat}-srgb`]
    });

    // Create frame uniform buffer
    frameUniformBuffer = device.createBuffer({
        size: FRAME_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    frameBindGroupLayout = device.createBindGroupLayout({
        label: 'Frame BGL',
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: {}
        }]
    });

    frameBindGroup = device.createBindGroup({
        label: 'Frame BG',
        layout: frameBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: frameUniformBuffer } }]
    });

    await initGrid();
}

async function initGrid() {
    // Create grid pipeline
    const bindGroupLayout = device.createBindGroupLayout({
        label: 'Grid BGL',
        entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} }]
    });

    const module = device.createShaderModule({ label: 'Grid Shader', code: GRID_SHADER });

    gridPipeline = await device.createRenderPipelineAsync({
        label: 'Grid Pipeline',
        layout: device.createPipelineLayout({ bindGroupLayouts: [frameBindGroupLayout, bindGroupLayout] }),
        vertex: {
            module,
            entryPoint: 'vertexMain',
            buffers: [{
                arrayStride: 20,
                attributes: [
                    { shaderLocation: 0, offset: 0, format: 'float32x3' },
                    { shaderLocation: 1, offset: 12, format: 'float32x2' }
                ]
            }]
        },
        fragment: {
            module,
            entryPoint: 'fragmentMain',
            targets: [{
                format: `${colorFormat}-srgb`,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                }
            }]
        },
        depthStencil: {
            format: depthFormat,
            depthWriteEnabled: true,
            depthCompare: 'less-equal'
        },
        multisample: { count: sampleCount }
    });

    // Create grid geometry
    const vertexArray = new Float32Array([
        -20, -0.5, -20, 0, 0,
        20, -0.5, -20, 200, 0,
        -20, -0.5, 20, 0, 200,
        20, -0.5, 20, 200, 200,
    ]);

    gridVertexBuffer = device.createBuffer({
        size: vertexArray.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true
    });
    new Float32Array(gridVertexBuffer.getMappedRange()).set(vertexArray);
    gridVertexBuffer.unmap();

    const indexArray = new Uint32Array([0, 1, 2, 1, 2, 3]);
    gridIndexBuffer = device.createBuffer({
        size: indexArray.byteLength,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true
    });
    new Uint32Array(gridIndexBuffer.getMappedRange()).set(indexArray);
    gridIndexBuffer.unmap();

    // Create grid uniform buffer
    gridUniformBuffer = device.createBuffer({
        size: gridUniformArray.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    gridBindGroup = device.createBindGroup({
        label: 'Grid BG',
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: gridUniformBuffer } }]
    });
}

// ============================================================================
// Rendering
// ============================================================================

function startRenderLoop() {
    function frameCallback() {
        requestAnimationFrame(frameCallback);
        const frameStart = performance.now();

        device.queue.writeBuffer(frameUniformBuffer, 0, frameArrayBuffer);
        renderFrame();

        frameMs[frameMsIndex++ % frameMs.length] = performance.now() - frameStart;
    }

    requestAnimationFrame(frameCallback);
}

function renderFrame() {
    const renderPass = getRenderPassDescriptor();
    if (!renderPass) return; // Skip frame if render targets aren't ready

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass(renderPass);

    // Draw opaque meshes
    for (const mesh of meshes.filter(m => !m.isTransparent)) {
        if (!mesh.pipeline || !mesh.vertexBuffer || !mesh.indexBuffer) continue;

        pass.setPipeline(mesh.pipeline);
        pass.setBindGroup(0, frameBindGroup);

        if (mesh.singleColor && mesh.bindGroup) {
            pass.setBindGroup(1, mesh.bindGroup);
        }

        pass.setVertexBuffer(0, mesh.vertexBuffer);
        if (!mesh.singleColor && mesh.colorBuffer) {
            pass.setVertexBuffer(1, mesh.colorBuffer);
        }

        pass.setIndexBuffer(mesh.indexBuffer, 'uint16');
        pass.drawIndexed(mesh.indexCount);
    }

    // Draw grid
    if (gridPipeline) {
        pass.setPipeline(gridPipeline);
        pass.setBindGroup(0, frameBindGroup);
        pass.setBindGroup(1, gridBindGroup);
        pass.setVertexBuffer(0, gridVertexBuffer);
        pass.setIndexBuffer(gridIndexBuffer, 'uint32');
        pass.drawIndexed(6);
    }

    // Draw transparent meshes
    for (const mesh of meshes.filter(m => m.isTransparent)) {
        if (!mesh.pipeline || !mesh.vertexBuffer || !mesh.indexBuffer) continue;

        pass.setPipeline(mesh.pipeline);
        pass.setBindGroup(0, frameBindGroup);

        if (mesh.singleColor && mesh.bindGroup) {
            pass.setBindGroup(1, mesh.bindGroup);
        }

        pass.setVertexBuffer(0, mesh.vertexBuffer);
        if (!mesh.singleColor && mesh.colorBuffer) {
            pass.setVertexBuffer(1, mesh.colorBuffer);
        }

        pass.setIndexBuffer(mesh.indexBuffer, 'uint16');
        pass.drawIndexed(mesh.indexCount);
    }

    // Draw lines
    for (const line of lines) {
        if (!line.pipeline || !line.posBuffer || !line.indexBuffer) continue;

        pass.setPipeline(line.pipeline);
        pass.setBindGroup(0, frameBindGroup);
        pass.setVertexBuffer(0, line.posBuffer);
        pass.setVertexBuffer(1, line.colorBuffer);
        pass.setVertexBuffer(2, line.thicknessBuffer);
        pass.setVertexBuffer(3, line.uvBuffer);
        pass.setVertexBuffer(4, line.endPosBuffer);
        pass.setVertexBuffer(5, line.fadeBuffer);
        pass.setIndexBuffer(line.indexBuffer, 'uint16');
        pass.drawIndexed(line.indexCount);
    }

    // Draw text billboards
    for (const billboard of textBillboards) {
        if (!billboard.pipeline || !billboard.vertexBuffer || !billboard.indexBuffer) continue;

        pass.setPipeline(billboard.pipeline);
        pass.setBindGroup(0, frameBindGroup);
        pass.setBindGroup(1, billboard.bindGroup);
        pass.setVertexBuffer(0, billboard.vertexBuffer);
        pass.setIndexBuffer(billboard.indexBuffer, 'uint16');
        pass.drawIndexed(billboard.indexCount);
    }

    pass.end();
    device.queue.submit([encoder.finish()]);
}

function getRenderPassDescriptor() {
    // Ensure render targets are allocated
    if (!colorAttachment || !renderPassDescriptor) {
        if (canvas.width > 0 && canvas.height > 0) {
            allocateRenderTargets(canvas.width, canvas.height);
        } else {
            // Return null to skip this frame if canvas isn't ready
            return null;
        }
    }

    const colorView = context.getCurrentTexture().createView({ format: `${colorFormat}-srgb` });
    if (sampleCount > 1) {
        colorAttachment.resolveTarget = colorView;
    } else {
        colorAttachment.view = colorView;
    }
    return renderPassDescriptor;
}

// ============================================================================
// Resize Handling
// ============================================================================

function setupResizeObserver() {
    const observer = new ResizeObserver((entries) => {
        for (let entry of entries) {
            if (entry.target !== canvas) continue;

            let width, height;
            if (entry.devicePixelContentBoxSize) {
                const size = entry.devicePixelContentBoxSize[0];
                width = size.inlineSize;
                height = size.blockSize;
            } else if (entry.contentBoxSize) {
                const s = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
                width = s.inlineSize;
                height = s.blockSize;
            } else {
                width = entry.contentRect.width;
                height = entry.contentRect.height;
            }

            if (width === 0 || height === 0) return;

            canvas.width = width;
            canvas.height = height;
            updateProjection();

            if (device) {
                allocateRenderTargets(width, height);
            }
        }
    });

    observer.observe(canvas);
}

function allocateRenderTargets(width, height) {
    const size = { width, height };

    if (msaaColorTexture) msaaColorTexture.destroy();
    if (sampleCount > 1) {
        msaaColorTexture = device.createTexture({
            size,
            sampleCount,
            format: `${colorFormat}-srgb`,
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
    }

    if (depthTexture) depthTexture.destroy();
    depthTexture = device.createTexture({
        size,
        sampleCount,
        format: depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    colorAttachment = {
        view: sampleCount > 1 ? msaaColorTexture.createView() : undefined,
        resolveTarget: undefined,
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: sampleCount > 1 ? 'discard' : 'store'
    };

    renderPassDescriptor = {
        colorAttachments: [colorAttachment],
        depthStencilAttachment: {
            view: depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'discard'
        }
    };
}

function updateProjection() {
    const aspect = canvas.width / canvas.height;

    if (projectionType === 'orthographic') {
        mat4.ortho(
            projectionMatrix,
            -orthoSize * aspect,
            orthoSize * aspect,
            -orthoSize,
            orthoSize,
            zNear,
            zFar
        );
    } else {
        mat4.perspectiveZO(
            projectionMatrix,
            fov,
            aspect,
            zNear,
            zFar
        );
    }
}

// ============================================================================
// Updates from C#
// ============================================================================

export function writeViewMatrix(matrixArray) {
    viewMatrix.set(matrixArray);
}

export function updateDisplayOptions(options) {
    applyOptions(options);
    updateProjection();
}

function applyOptions(options) {
    if (typeof options.sampleCount === 'number') sampleCount = options.sampleCount;
    if (typeof options.projectionType === 'number') {
        projectionType = options.projectionType === 0 ? 'perspective' : 'orthographic';
    }
    if (typeof options.fov === 'number') fov = options.fov;
    if (typeof options.orthoSize === 'number') orthoSize = options.orthoSize;
    if (typeof options.zNear === 'number') zNear = options.zNear;
    if (typeof options.zFar === 'number') zFar = options.zFar;

    // Update grid uniforms
    if (options.lineColor) gridLineColor.set(options.lineColor);
    if (options.baseColor) gridBaseColor.set(options.baseColor);
    if (typeof options.lineWidthX === 'number' && typeof options.lineWidthY === 'number') {
        gridLineWidth.set([options.lineWidthX, options.lineWidthY]);
    }

    if (device && gridUniformBuffer) {
        device.queue.writeBuffer(gridUniformBuffer, 0, gridUniformArray);
    }

    // Update clear color
    if (options.clearColor) {
        clearColor = options.clearColor;
        if (colorAttachment) colorAttachment.clearValue = clearColor;
    }
}

// ============================================================================
// Scene Management (Mesh, Lines, Billboards)
// ============================================================================

export async function addMesh(meshData) {
    const { id, vertices, indices, colors, singleColor } = meshData;

    const vertexBuffer = createBuffer(vertices, GPUBufferUsage.VERTEX);
    const indexBuffer = createBuffer(indices, GPUBufferUsage.INDEX, Uint16Array);

    let colorBuffer = null;
    let bindGroup = null;
    let isTransparent = false;
    let shaderCode = null;

    if (singleColor) {
        shaderCode = MESH_SHADER;
        isTransparent = colors.length >= 4 && colors[3] < 1.0;

        colorBuffer = createBuffer(colors, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

        const bindGroupLayout = device.createBindGroupLayout({
            label: `Mesh ${id} BGL`,
            entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} }]
        });

        bindGroup = device.createBindGroup({
            label: `Mesh ${id} BG`,
            layout: bindGroupLayout,
            entries: [{ binding: 0, resource: { buffer: colorBuffer } }]
        });
    } else {
        shaderCode = MESH_SHADER_VERTEX_COLOR;
        colorBuffer = createBuffer(colors, GPUBufferUsage.VERTEX);
    }

    const shaderModule = device.createShaderModule({ code: shaderCode });

    const vertexBufferLayout = [
        { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }
    ];

    if (!singleColor) {
        vertexBufferLayout.push({
            arrayStride: 16,
            attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }]
        });
    }

    const pipelineLayout = singleColor
        ? device.createPipelineLayout({ bindGroupLayouts: [frameBindGroupLayout, bindGroupLayout.layout] })
        : device.createPipelineLayout({ bindGroupLayouts: [frameBindGroupLayout] });

    const pipeline = await device.createRenderPipelineAsync({
        label: `Mesh ${id} Pipeline`,
        layout: pipelineLayout,
        vertex: { module: shaderModule, entryPoint: 'vertexMain', buffers: vertexBufferLayout },
        fragment: {
            module: shaderModule,
            entryPoint: 'fragmentMain',
            targets: [{
                format: `${colorFormat}-srgb`,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                }
            }]
        },
        depthStencil: {
            format: depthFormat,
            depthWriteEnabled: !isTransparent,
            depthCompare: 'less-equal'
        },
        multisample: { count: sampleCount },
        primitive: { topology: 'triangle-list', cullMode: 'back' }
    });

    meshes.push({
        id,
        vertexBuffer,
        colorBuffer,
        indexBuffer,
        bindGroup,
        singleColor,
        isTransparent,
        indexCount: indices.length,
        pipeline
    });
}

export function removeMesh(meshId) {
    const index = meshes.findIndex(m => m.id === meshId);
    if (index >= 0) {
        const mesh = meshes[index];
        mesh.vertexBuffer?.destroy();
        mesh.colorBuffer?.destroy();
        mesh.indexBuffer?.destroy();
        meshes.splice(index, 1);
    }
}

export function clearAllMeshes() {
    for (const mesh of meshes) {
        mesh.vertexBuffer?.destroy();
        mesh.colorBuffer?.destroy();
        mesh.indexBuffer?.destroy();
    }
    meshes.length = 0;
}

export async function addLines(lineData) {
    const { id, vertices, thickness, colors, fades } = lineData;

    // Geometry buffers are created from pre-computed data from C#
    const posBuffer = createBuffer(vertices, GPUBufferUsage.VERTEX);
    const colorBuffer = createBuffer(colors, GPUBufferUsage.VERTEX);
    const thicknessBuffer = createBuffer(thickness, GPUBufferUsage.VERTEX);
    const uvBuffer = createBuffer(lineData.uvs, GPUBufferUsage.VERTEX);
    const endPosBuffer = createBuffer(lineData.endPositions, GPUBufferUsage.VERTEX);
    const fadeBuffer = createBuffer(fades, GPUBufferUsage.VERTEX);
    const indexBuffer = createBuffer(lineData.indices, GPUBufferUsage.INDEX, Uint16Array);

    const shaderModule = device.createShaderModule({ label: `Line ${id} Shader`, code: BILLBOARD_LINE_SHADER });

    const vertexBufferLayout = [
        { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
        { arrayStride: 16, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }] },
        { arrayStride: 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32' }] },
        { arrayStride: 8, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x2' }] },
        { arrayStride: 12, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x3' }] },
        { arrayStride: 4, attributes: [{ shaderLocation: 5, offset: 0, format: 'float32' }] }
    ];

    const pipeline = await device.createRenderPipelineAsync({
        label: `Line ${id} Pipeline`,
        layout: device.createPipelineLayout({ bindGroupLayouts: [frameBindGroupLayout] }),
        vertex: { module: shaderModule, entryPoint: 'vertexMain', buffers: vertexBufferLayout },
        fragment: {
            module: shaderModule,
            entryPoint: 'fragmentMain',
            targets: [{
                format: `${colorFormat}-srgb`,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                }
            }]
        },
        depthStencil: {
            format: depthFormat,
            depthWriteEnabled: true,
            depthCompare: 'less-equal'
        },
        multisample: { count: sampleCount },
        primitive: { topology: 'triangle-list', cullMode: 'none' }
    });

    lines.push({
        id,
        posBuffer,
        colorBuffer,
        thicknessBuffer,
        uvBuffer,
        endPosBuffer,
        fadeBuffer,
        indexBuffer,
        indexCount: lineData.indices.length,
        pipeline
    });
}

export function removeLines(lineId) {
    const index = lines.findIndex(l => l.id === lineId);
    if (index >= 0) {
        const line = lines[index];
        line.posBuffer?.destroy();
        line.colorBuffer?.destroy();
        line.thicknessBuffer?.destroy();
        line.uvBuffer?.destroy();
        line.endPosBuffer?.destroy();
        line.fadeBuffer?.destroy();
        line.indexBuffer?.destroy();
        lines.splice(index, 1);
    }
}

export function clearAllLines() {
    for (const line of lines) {
        line.posBuffer?.destroy();
        line.colorBuffer?.destroy();
        line.thicknessBuffer?.destroy();
        line.uvBuffer?.destroy();
        line.endPosBuffer?.destroy();
        line.fadeBuffer?.destroy();
        line.indexBuffer?.destroy();
    }
    lines.length = 0;
}

export async function addTextBillboard(billboardData) {
    const { id, text, position, backgroundColor, textColor } = billboardData;

    // Remove existing billboard with same ID
    removeTextBillboard(id);

    // Create a canvas to render the text
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 24px sans-serif';
    const textMetrics = ctx.measureText(text);
    canvas.width = Math.ceil(textMetrics.width) + 20;
    canvas.height = 30;

    // Background
    ctx.fillStyle = `rgba(${Math.floor(backgroundColor[0] * 255)}, ${Math.floor(backgroundColor[1] * 255)}, ${Math.floor(backgroundColor[2] * 255)}, ${backgroundColor[3]})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Text
    ctx.fillStyle = `rgba(${Math.floor(textColor[0] * 255)}, ${Math.floor(textColor[1] * 255)}, ${Math.floor(textColor[2] * 255)}, ${textColor[3]})`;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    // Create ImageBitmap for reliable texture copying
    const bitmap = await createImageBitmap(canvas);

    const texture = device.createTexture({
        size: [canvas.width, canvas.height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    device.queue.copyExternalImageToTexture(
        { source: bitmap, flipY: true },
        { texture, premultipliedAlpha: false },
        [canvas.width, canvas.height]
    );

    bitmap.close();

    // Create billboard geometry
    const vertices = new Float32Array([
        position[0], position[1], position[2], 0, 1,
        position[0], position[1], position[2], 1, 1,
        position[0], position[1], position[2], 0, 0,
        position[0], position[1], position[2], 1, 0,
    ]);

    const vertexBuffer = createBuffer(vertices, GPUBufferUsage.VERTEX);
    const indexBuffer = createBuffer(new Uint16Array([0, 1, 2, 1, 3, 2]), GPUBufferUsage.INDEX, Uint16Array);

    const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge'
    });

    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} }
        ]
    });

    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: texture.createView() }
        ]
    });

    const shaderModule = device.createShaderModule({ code: BILLBOARD_SHADER });

    const pipeline = await device.createRenderPipelineAsync({
        layout: device.createPipelineLayout({ bindGroupLayouts: [frameBindGroupLayout, bindGroupLayout] }),
        vertex: {
            module: shaderModule,
            entryPoint: 'vertexMain',
            buffers: [{
                arrayStride: 20,
                attributes: [
                    { shaderLocation: 0, offset: 0, format: 'float32x3' },
                    { shaderLocation: 1, offset: 12, format: 'float32x2' }
                ]
            }]
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'fragmentMain',
            targets: [{
                format: `${colorFormat}-srgb`,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                }
            }]
        },
        depthStencil: {
            format: depthFormat,
            depthWriteEnabled: true,
            depthCompare: 'less-equal'
        },
        multisample: { count: sampleCount }
    });

    textBillboards.push({
        id,
        vertexBuffer,
        indexBuffer,
        bindGroup,
        texture,
        sampler,
        indexCount: 6,
        pipeline
    });
}

// ============================================================================
// Frame Timing Callback
// ============================================================================

let frameIntervalId = 0;

function startFrameTimer() {
    frameIntervalId = setInterval(() => {
        let avg = 0;
        for (const v of frameMs) {
            if (v === undefined) return;
            avg += v;
        }
        const ms = avg / frameMs.length;
        dotNetRef?.invokeMethodAsync('OnFrameMsUpdate', ms);
    }, 1000);
}

// ============================================================================
// Utility Functions
// ============================================================================

function createBuffer(data, usage, ArrayType = Float32Array) {
    const typedArray = data instanceof ArrayType ? data : new ArrayType(data);
    const buffer = device.createBuffer({
        size: typedArray.byteLength,
        usage,
        mappedAtCreation: true
    });
    new ArrayType(buffer.getMappedRange()).set(typedArray);
    buffer.unmap();
    return buffer;
}

export function getBoundingClientRect(element) {
    const rect = element.getBoundingClientRect();
    return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
    };
}

// ============================================================================
// Cleanup
// ============================================================================

export function disposeWebGPU_Canvas() {
    if (frameIntervalId) {
        clearInterval(frameIntervalId);
        frameIntervalId = 0;
    }

    // Clean up all GPU resources
    clearAllMeshes();
    clearAllLines();
    clearAllTextBillboards();

    gridVertexBuffer?.destroy();
    gridIndexBuffer?.destroy();
    gridUniformBuffer?.destroy();
    frameUniformBuffer?.destroy();
    msaaColorTexture?.destroy();
    depthTexture?.destroy();

    device = null;
    dotNetRef = null;
}

export function removeTextBillboard(billboardId) {
    const index = textBillboards.findIndex(b => b.id === billboardId);
    if (index >= 0) {
        const billboard = textBillboards[index];
        billboard.vertexBuffer?.destroy();
        billboard.indexBuffer?.destroy();
        billboard.texture?.destroy();
        textBillboards.splice(index, 1);
    }
}

export function clearAllTextBillboards() {
    for (const billboard of textBillboards) {
        billboard.vertexBuffer?.destroy();
        billboard.indexBuffer?.destroy();
        billboard.texture?.destroy();
    }
    textBillboards.length = 0;
}