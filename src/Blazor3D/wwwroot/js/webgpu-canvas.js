// WebGPU canvas module for Blazor WebAssembly
//
// Overview
//  - This file contains a small WebGPU engine (WebGpu_Canvas) and exported
//  functions used by the Blazor component via JS interop.
//  - The engine draws the "Pristine Grid" shader onto a <canvas> with class/id
//    'webgpu-canvas'. Camera controls are handled in C#.
//  - The Blazor component owns UI and parameters; this module focuses on rendering.
//
// Called from C# (WebGPUCanvas.razor)
//  - initGPU_Canvas(dotnetRef, canvasEl, options, viewMatrix)
//  • dotnetRef: DotNetObjectReference passed from C# for callbacks
//      • canvasEl: ElementReference to the Blazor-rendered canvas
//      • options: { clearColor, lineColor, baseColor, lineWidthX, lineWidthY, sampleCount, fov, zNear, zFar }
//      • viewMatrix: Initial view matrix as float array from C#
//      • Initializes WebGPU, builds pipeline/buffers, and starts the render loop
//  - updateGridOptions(options)
//      • Hot-updates grid colors/line widths and camera config.
//      • Updates GPU uniform buffer immediately when possible.
//  - updateViewMatrix(matrixArray)
//      • Updates the view matrix from C# on camera changes.
//  - disposeWebGPU_Canvas()
//      • Stops periodic callbacks and clears references; called by IAsyncDisposable.
//
// Notes for maintainers
//- The Blazor component owns UI and parameters; this module focuses on rendering.
//  - Canvas size is controlled by CSS/layout. We reconfigure GPU surfaces on resize
//    using ResizeObserverHelper (see that class for rationale).
//  - Do not force absolute positioning here; let Blazor layout decide.

// External deps via ESM CDNs
import { mat4 } from 'https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js';

// Inject styles (avoid forcing absolute/100% so Blazor sizing works)
const injectedStyle = document.createElement('style');
injectedStyle.innerText = `
  html, body { height: 100%; margin: 0; font-family: sans-serif; }
  body { height: 100%; background-color: #222222; }
  .webgpu-canvas { display: block; width: 100%; height: auto; margin: 0; touch-action: none; }
  .error { position: absolute, z-index: 2; inset: 9em 3em; margin: 0; padding: 0; color: #FF8888; }
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
    projectionType = 'perspective'; // 'perspective' or 'orthographic'
    fov = Math.PI * 0.5;
    orthoSize = 5.0; // Half-height of orthographic view
    zNear = 0.01;
    zFar = 128;

    // Grid pipeline state
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
    // Removed hardcoded defaults; rely on WebGpuGridOptions.Default passed from C#
    gridOptions = {};

    // Dynamic meshes array (cubes, etc.)
    meshes = [];
    // Dynamic lines array (arrows, paths, etc.)
    lines = [];
    // Dynamic text billboards array
    textBillboards = [];
    constructor(element = null, initialViewMatrix = null) {
        // Prefer canvas element provided by Blazor, fallback to query
        this.canvas = element || document.querySelector('.webgpu-canvas');
        if (!this.canvas) { this.canvas = document.createElement('canvas'); document.body.appendChild(this.canvas); }
        this.context = this.canvas.getContext('webgpu');

        // Set initial view matrix if provided
        if (initialViewMatrix) {
            this.#viewMatrix.set(initialViewMatrix);
        }

        // Listen for CSS/layout size changes and reconfigure GPU targets accordingly.
        // See ResizeObserverHelper below for the HiDPI rationale.
        this.resizeObserver = new ResizeObserverHelper(this.canvas, (width, height) => {
            if (width == 0 || height == 0) return;
            this.canvas.width = width; this.canvas.height = height; this.updateProjection();
            if (this.device) { const size = { width, height }; this.#allocateRenderTargets(size); this.onResize(this.device, size); }
        });

        // Render loop: Updates view (set from C#), writes uniforms, and calls onFrame
        const frameCallback = (t) => {
            requestAnimationFrame(frameCallback);
            const frameStart = performance.now();
            // View matrix is updated from C# via updateViewMatrix
            // Projection is updated on resize
            this.device.queue.writeBuffer(this.frameUniformBuffer, 0, this.#frameArrayBuffer);
            this.onFrame(this.device, this.context, t);
            this.#frameMs[this.#frameMsIndex++ % this.#frameMs.length] = performance.now() - frameStart;
        };

        // Initialize WebGPU and start rendering
        this.#initWebGPU().then(() => {
            this.resizeObserver.callback(this.canvas.width, this.canvas.height);
            requestAnimationFrame(frameCallback);
            // Notify C# that WebGPU is ready
            if (dotNetRef) {
                try { dotNetRef.invokeMethodAsync('OnWebGpuReady'); } catch { }
            }
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

    updateProjection() {
        const aspect = this.canvas.width / this.canvas.height;

        if (this.projectionType === 'orthographic') {
            // Orthographic projection: no perspective distortion
            // Objects stay same size regardless of distance
            mat4.ortho(
                this.#projectionMatrix,
                -this.orthoSize * aspect, // left
                this.orthoSize * aspect, // right
                -this.orthoSize,     // bottom
                this.orthoSize,          // top
                this.zNear,
                this.zFar
            );
        } else {
            // Perspective projection: realistic vanishing points
            mat4.perspectiveZO(
                this.#projectionMatrix,
                this.fov,
                aspect,
                this.zNear,
                this.zFar
            );
        }
    }
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
            // x   y   z     u  v
            -20, -0.5, -20, 0, 0,
            20, -0.5, -20, 200, 0,
            -20, -0.5, 20, 0, 200,
            20, -0.5, 20, 200, 200,
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
            this.lineColor.set([this.gridOptions.lineColor.r, this.gridOptions.lineColor.g, this.gridOptions.lineColor.b, this.gridOptions.lineColor.a]);
            this.baseColor.set([this.gridOptions.baseColor.r, this.gridOptions.baseColor.g, this.gridOptions.baseColor.b, this.gridOptions.baseColor.a]);
            this.lineWidth.set([this.gridOptions.lineWidthX, this.gridOptions.lineWidthY]);
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

        // Draw the grid
        if (this.pipeline) {
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, this.frameBindGroup);
            pass.setBindGroup(1, this.bindGroup);
            pass.setVertexBuffer(0, this.vertexBuffer);
            pass.setIndexBuffer(this.indexBuffer, 'uint32');
            pass.drawIndexed(6);
        }

        // Draw all dynamic meshes
        for (const mesh of this.meshes) {
            if (mesh.pipeline && mesh.vertexBuffer && mesh.indexBuffer) {
                pass.setPipeline(mesh.pipeline);
                pass.setBindGroup(0, this.frameBindGroup);

                // Set bind group 1 only for uniform color mode
                if (mesh.singleColor && mesh.bindGroup) {
                    pass.setBindGroup(1, mesh.bindGroup);
                }

                pass.setVertexBuffer(0, mesh.vertexBuffer);

                // Set color buffer if using any vertex colors (per-vertex or per-triangle)
                if (!mesh.singleColor && mesh.colorBuffer) {
                    pass.setVertexBuffer(1, mesh.colorBuffer);
                }

                pass.setIndexBuffer(mesh.indexBuffer, 'uint16');
                pass.drawIndexed(mesh.indexCount);
            }
        }

        // Draw all dynamic lines
        for (const line of this.lines) {
            if (line.pipeline && line.posBuffer && line.indexBuffer) {
                pass.setPipeline(line.pipeline);
                pass.setBindGroup(0, this.frameBindGroup);

                pass.setVertexBuffer(0, line.posBuffer);
                pass.setVertexBuffer(1, line.colorBuffer);
                pass.setVertexBuffer(2, line.thicknessBuffer);
                pass.setVertexBuffer(3, line.uvBuffer);
                pass.setVertexBuffer(4, line.endPosBuffer);

                pass.setIndexBuffer(line.indexBuffer, 'uint16');
                pass.drawIndexed(line.indexCount);
            }
        }

        // Draw all text billboards
        for (const billboard of this.textBillboards) {
            if (billboard.pipeline && billboard.vertexBuffer && billboard.indexBuffer) {
                pass.setPipeline(billboard.pipeline);
                pass.setBindGroup(0, this.frameBindGroup);
                pass.setBindGroup(1, billboard.bindGroup);
                pass.setVertexBuffer(0, billboard.vertexBuffer);
                pass.setIndexBuffer(billboard.indexBuffer, 'uint16');
                pass.drawIndexed(billboard.indexCount);
            }
        }

        pass.end();
        device.queue.submit([encoder.finish()]);
    }

    addLines(lineData) {
        if (!this.device) {
            console.error('WebGPU device not initialized');
            return;
        }

        const { id, vertices, thickness, colors } = lineData;

        console.log(`[addLines] Adding lines "${id}":`);
        console.log(`  - Vertices: ${vertices.length / 3} (${vertices.length} floats)`);
        console.log(`  - Line segments: ${vertices.length / 3 - 1}`);
        console.log(`  - Thickness values: ${thickness.length}`);
        console.log(`  - Colors: ${colors ? colors.length : 0}`);

        const numVertices = vertices.length / 3;
        const numSegments = numVertices - 1;

        if (numVertices < 2) {
            console.error(`[addLines] "${id}" needs at least 2 vertices`);
            return;
        }

        // Generate quad geometry for each line segment with billboard data
        const quadPositions = [];
        const quadColors = [];
        const quadThickness = [];
        const quadUVs = [];
        const quadEndPositions = [];
        const indices = [];

        for (let i = 0; i < numSegments; i++) {
            const v0 = [vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]];
            const v1 = [vertices[(i + 1) * 3], vertices[(i + 1) * 3 + 1], vertices[(i + 1) * 3 + 2]];
            const t = thickness[i] || 0.1;
            const colorIdx = i * 4;
            const color = colors && colorIdx + 3 < colors.length
                ? [colors[colorIdx], colors[colorIdx + 1], colors[colorIdx + 2], colors[colorIdx + 3]]
                : [1, 1, 1, 1];

            const baseIdx = quadPositions.length / 3;

            // Vertex 0: start, left
            quadPositions.push(...v0);
            quadColors.push(...color);
            quadThickness.push(t);
            quadUVs.push(0, -0.5);
            quadEndPositions.push(...v1);

            // Vertex 1: start, right
            quadPositions.push(...v0);
            quadColors.push(...color);
            quadThickness.push(t);
            quadUVs.push(0, 0.5);
            quadEndPositions.push(...v1);

            // Vertex 2: end, left
            quadPositions.push(...v0);
            quadColors.push(...color);
            quadThickness.push(t);
            quadUVs.push(1, -0.5);
            quadEndPositions.push(...v1);

            // Vertex 3: end, right
            quadPositions.push(...v0);
            quadColors.push(...color);
            quadThickness.push(t);
            quadUVs.push(1, 0.5);
            quadEndPositions.push(...v1);

            indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx + 1, baseIdx + 3, baseIdx + 2);
        }

        if (quadPositions.length === 0) {
            console.error(`[addLines] "${id}" has no valid segments`);
            return;
        }

        console.log(`[addLines] Generated ${quadPositions.length / 3} quad vertices, ${indices.length / 3} triangles`);

        const posBuffer = this.device.createBuffer({
            size: quadPositions.length * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true
        });
        new Float32Array(posBuffer.getMappedRange()).set(quadPositions);
        posBuffer.unmap();

        const colorBuffer = this.device.createBuffer({
            size: quadColors.length * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true
        });
        new Float32Array(colorBuffer.getMappedRange()).set(quadColors);
        colorBuffer.unmap();

        const thicknessBuffer = this.device.createBuffer({
            size: quadThickness.length * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true
        });
        new Float32Array(thicknessBuffer.getMappedRange()).set(quadThickness);
        thicknessBuffer.unmap();

        const uvBuffer = this.device.createBuffer({
            size: quadUVs.length * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true
        });
        new Float32Array(uvBuffer.getMappedRange()).set(quadUVs);
        uvBuffer.unmap();

        const endPosBuffer = this.device.createBuffer({
            size: quadEndPositions.length * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true
        });
        new Float32Array(endPosBuffer.getMappedRange()).set(quadEndPositions);
        endPosBuffer.unmap();

        const indexBuffer = this.device.createBuffer({
            size: indices.length * Uint16Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.INDEX,
            mappedAtCreation: true
        });
        new Uint16Array(indexBuffer.getMappedRange()).set(indices);
        indexBuffer.unmap();

        const shaderModule = this.device.createShaderModule({
            label: `Line ${id} Shader`,
            code: BILLBOARD_LINE_SHADER
        });

        const vertexBufferLayout = [
            { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }, // pos
            { arrayStride: 16, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }] }, // color
            { arrayStride: 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32' }] },   // thickness
            { arrayStride: 8, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x2' }] },  // uv
            { arrayStride: 12, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x3' }] }  // endPos
        ];

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.frameBindGroupLayout]
        });

        this.device.createRenderPipelineAsync({
            label: `Line ${id} Pipeline`,
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: 'vertexMain',
                buffers: vertexBufferLayout
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragmentMain',
                targets: [{
                    format: `${this.colorFormat}-srgb`,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                    }
                }]
            },
            depthStencil: {
                format: this.depthFormat,
                depthWriteEnabled: true,
                depthCompare: 'less-equal'
            },
            multisample: { count: this.sampleCount ?? 1 },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none'
            }
        }).then((pipeline) => {
            console.log(`[addLines] Pipeline created successfully for "${id}"`);
            const line = this.lines.find(l => l.id === id);
            if (line) {
                line.pipeline = pipeline;
                console.log(`[addLines] Pipeline assigned to line "${id}"`);
            } else {
                console.error(`[addLines] Line "${id}" not found after pipeline creation!`);
            }
        }).catch((error) => {
            console.error(`[addLines] Pipeline creation FAILED for "${id}":`, error);
        });

        this.lines.push({
            id,
            posBuffer,
            colorBuffer,
            thicknessBuffer,
            uvBuffer,
            endPosBuffer,
            indexBuffer,
            indexCount: indices.length,
            pipeline: null
        });
    }

    addTextBillboard(billboardData) {
        // Wrap in async IIFE to use createImageBitmap
        (async () => {
            if (!this.device) {
                console.error('WebGPU device not initialized');
                return;
            }

            const { id, text, position, backgroundColor, textColor } = billboardData;

            console.log(`[addTextBillboard] Adding billboard "${id}": "${text}" at (${position.join(', ')})`);
            console.log(`  - Background color: rgba(${Math.floor(backgroundColor[0] * 255)}, ${Math.floor(backgroundColor[1] * 255)}, ${Math.floor(backgroundColor[2] * 255)}, ${backgroundColor[3]})`);
            console.log(`  - Text color: rgba(${Math.floor(textColor[0] * 255)}, ${Math.floor(textColor[1] * 255)}, ${Math.floor(textColor[2] * 255)}, ${textColor[3]})`);

            // Check if billboard with this ID already exists and remove it
            const existingIndex = this.textBillboards.findIndex(b => b.id === id);
            if (existingIndex >= 0) {
                console.log(`  - Removing existing billboard with ID "${id}"`);
                this.removeTextBillboard(id);
            }

            // Create a canvas to render the text
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.font = 'bold 24px sans-serif';
            const textMetrics = ctx.measureText(text);
            canvas.width = Math.ceil(textMetrics.width) + 20; // Add some padding
            canvas.height = 30; // Fixed height for simplicity

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

            const texture = this.device.createTexture({
                size: [canvas.width, canvas.height],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
            });

            this.device.queue.copyExternalImageToTexture(
                { source: bitmap, flipY: true },
                { texture, premultipliedAlpha: false },
                [canvas.width, canvas.height]
            );

            bitmap.close();

            console.log(`  - Texture created successfully`);

            // Create quad geometry for the billboard (all vertices at center, offsets computed in shader)
            const vertices = new Float32Array([
                // x, y, z, u, v
                position[0], position[1], position[2], 0, 1,  // bottom-left
                position[0], position[1], position[2], 1, 1,  // bottom-right
                position[0], position[1], position[2], 0, 0,  // top-left
                position[0], position[1], position[2], 1, 0,  // top-right
            ]);

            const vertexBuffer = this.device.createBuffer({
                size: vertices.byteLength,
                usage: GPUBufferUsage.VERTEX,
                mappedAtCreation: true
            });
            new Float32Array(vertexBuffer.getMappedRange()).set(vertices);
            vertexBuffer.unmap();

            const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
            const indexBuffer = this.device.createBuffer({
                size: indices.byteLength,
                usage: GPUBufferUsage.INDEX,
                mappedAtCreation: true
            });
            new Uint16Array(indexBuffer.getMappedRange()).set(indices);
            indexBuffer.unmap();

            // Create sampler and bind group
            const sampler = this.device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge'
            });

            const bindGroupLayout = this.device.createBindGroupLayout({
                entries: [
                    { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} }
                ]
            });

            const bindGroup = this.device.createBindGroup({
                layout: bindGroupLayout,
                entries: [
                    { binding: 0, resource: sampler },
                    { binding: 1, resource: texture.createView() }
                ]
            });

            // Create billboard object FIRST, before async pipeline creation
            const billboardObj = {
                id,
                vertexBuffer,
                indexBuffer,
                bindGroup,
                texture,
                sampler,
                indexCount: indices.length,
                pipeline: null
            };

            // Store billboard immediately (before pipeline is ready)
            this.textBillboards.push(billboardObj);
            console.log(`  - Billboard added to array. Total billboards: ${this.textBillboards.length}`);

            // Create shader and pipeline
            const shaderModule = this.device.createShaderModule({ code: BILLBOARD_SHADER });
            const pipelineLayout = this.device.createPipelineLayout({
                bindGroupLayouts: [this.frameBindGroupLayout, bindGroupLayout]
            });

            this.device.createRenderPipelineAsync({
                layout: pipelineLayout,
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
                    targets: [{ format: `${this.colorFormat}-srgb` }]
                },
                depthStencil: {
                    format: this.depthFormat,
                    depthWriteEnabled: true,
                    depthCompare: 'less-equal'
                },
                multisample: { count: this.sampleCount ?? 1 }
            }).then((pipeline) => {
                console.log(`[addTextBillboard] Pipeline created successfully for "${id}"`);
                // Assign pipeline directly to the billboard object we already added
                billboardObj.pipeline = pipeline;
                console.log(`[addTextBillboard] Pipeline assigned to billboard "${id}"`);
            }).catch((error) => {
                console.error(`[addTextBillboard] Pipeline creation FAILED for "${id}":`, error);
            });
        })();
    }

    removeTextBillboard(billboardId) {
        const index = this.textBillboards.findIndex(b => b.id === billboardId);
        if (index >= 0) {
            const billboard = this.textBillboards[index];
            if (billboard.vertexBuffer) billboard.vertexBuffer.destroy();
            if (billboard.indexBuffer) billboard.indexBuffer.destroy();
            if (billboard.texture) billboard.texture.destroy();
            this.textBillboards.splice(index, 1);
        }
    }

    clearAllTextBillboards() {
        for (const billboard of this.textBillboards) {
            if (billboard.vertexBuffer) billboard.vertexBuffer.destroy();
            if (billboard.indexBuffer) billboard.indexBuffer.destroy();
            if (billboard.texture) billboard.texture.destroy();
        }
        this.textBillboards = [];
    }


    // Add a mesh to the scene
    addMesh(meshData) {
        if (!this.device) {
            console.error('WebGPU device not initialized');
            return;
        }

        const { id, vertices, indices, colors, singleColor } = meshData;

        console.log(`[addMesh] Adding mesh "${id}":`);
        console.log(`  - Vertices: ${vertices.length / 3} (${vertices.length} floats)`);
        console.log(`  - Indices: ${indices.length} (${indices.length / 3} triangles)`);


        // Create vertex buffer (positions only)
        const vertexBuffer = this.device.createBuffer({
            size: vertices.length * Float32Array.BYTES_PER_ELEMENT,  // Calculate size directly
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true
        });
        // vertexBuffer.getMappedRange(): Since the buffer was created with ArrayBuffer(raw memory view)
        // that the CPU can write to. It's like a "window" into the GPU buffer's memory. Then,  the
        // new Float32Array(vertexBuffer.getMappedRange()) creates a Float32Array view over that raw memory.
        // It doesn't copy data yet—it just provides a typed interface (floats) to the buffer's bytes.
        // Finally, the ".set(vertexArray)" copies the contents of vertexArray into the buffer's memory. 
        // It's efficient—no intermediate allocations, just a direct memory copy.
        new Float32Array(vertexBuffer.getMappedRange()).set(vertices);
        vertexBuffer.unmap(); // This method releases the CPU's access to the GPU buffer's memory.
        // When you create a buffer with mappedAtCreation: true, the buffer is initially mapped (CPU
        // can read / write to it). After copying data(via.set() on the previous line), we need to call
        // unmap() it, making the buffer GPU - exclusive again.

        // Create index buffer ... This folows the same logic above for the vertex buffer.
        const indexBuffer = this.device.createBuffer({
            size: indices.length * Uint16Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.INDEX,
            mappedAtCreation: true
        });
        new Uint16Array(indexBuffer.getMappedRange()).set(indices);
        indexBuffer.unmap();

        let shaderCode = null;
        let bindGroup = null;
        let colorBuffer = null;
        if (singleColor) {
            // Uniform color throughout 
            console.log(`  - Color Mode is UNIFORM`);
            shaderCode = MESH_SHADER;

            colorBuffer = this.device.createBuffer({
                size: 4 * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                mappedAtCreation: true
            });
            new Float32Array(colorBuffer.getMappedRange()).set([colors[0], colors[1], colors[2], colors[3]]);
            colorBuffer.unmap();

            const bindGroupLayout = this.device.createBindGroupLayout({
                label: `Mesh ${id} BGL`,
                entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} }]
            });
            bindGroup = this.device.createBindGroup({
                label: `Mesh ${id} BG`,
                layout: bindGroupLayout,
                entries: [{ binding: 0, resource: { buffer: colorBuffer } }]
            });
        } else {
            // Colors are per-vertex, so faces are gradients
            console.log(`  - Color Mode is PER-VERTEX`);
            shaderCode = MESH_SHADER_VERTEX_COLOR;

            colorBuffer = this.device.createBuffer({
                size: colors.length * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.VERTEX,
                mappedAtCreation: true
            });
            new Float32Array(colorBuffer.getMappedRange()).set(colors);
            colorBuffer.unmap();
        }

        // Create shader module (now for both modes)
        const shaderModule = this.device.createShaderModule({ code: shaderCode });

        // Define vertex buffer layout (conditionally for both modes)
        const vertexBufferLayout = [
            {
                arrayStride: 12, // 3 floats (x, y, z)
                attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }]
            }
        ];

        if (!singleColor) {  // Add color attribute only for per-vertex mode
            vertexBufferLayout.push({
                arrayStride: 16, // 4 floats (r, g, b, a)
                attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }]
            });
        }

        // Create pipeline
        const pipelineLayout = singleColor
            ? this.device.createPipelineLayout({ bindGroupLayouts: [this.frameBindGroupLayout, bindGroup.layout] })
            : this.device.createPipelineLayout({ bindGroupLayouts: [this.frameBindGroupLayout] });

        this.device.createRenderPipelineAsync({
            label: `Mesh ${id} Pipeline`,
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,  // Now always defined
                entryPoint: 'vertexMain',
                buffers: vertexBufferLayout  // Now always defined
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragmentMain',
                targets: [{ format: `${this.colorFormat}-srgb` }]
            },
            depthStencil: {
                format: this.depthFormat,
                depthWriteEnabled: true,
                depthCompare: 'less-equal'
            },
            multisample: { count: this.sampleCount ?? 1 },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back'
            }
        }).then((pipeline) => {
            console.log(`[addMesh] Pipeline created successfully for "${id}"`);
            const mesh = this.meshes.find(m => m.id === id);
            if (mesh) {
                mesh.pipeline = pipeline;
                console.log(`[addMesh] Pipeline assigned to mesh "${id}"`);
            } else {
                console.error(`[addMesh] Mesh "${id}" not found after pipeline creation!`);
            }
        }).catch((error) => {
            console.error(`[addMesh] Pipeline creation FAILED for "${id}":`, error);
        });

        // Store mesh
        this.meshes.push({
            id,
            vertexBuffer,
            colorBuffer,
            indexBuffer,
            bindGroup,
            singleColor,
            indexCount: indices.length,
            pipeline: null
        });
    }

    removeMesh(meshId) {
        const index = this.meshes.findIndex(m => m.id === meshId);
        if (index >= 0) {
            const mesh = this.meshes[index];
            if (mesh.vertexBuffer) mesh.vertexBuffer.destroy();
            if (mesh.colorBuffer) mesh.colorBuffer.destroy();
            if (mesh.indexBuffer) mesh.indexBuffer.destroy();
            this.meshes.splice(index, 1);
        }
    }

    clearAllMeshes() {
        for (const mesh of this.meshes) {
            if (mesh.vertexBuffer) mesh.vertexBuffer.destroy();
            if (mesh.colorBuffer) mesh.colorBuffer.destroy();
            if (mesh.indexBuffer) mesh.indexBuffer.destroy();
        }
        this.meshes = [];
    }

    removeLines(lineId) {
        const index = this.lines.findIndex(l => l.id === lineId);
        if (index >= 0) {
            const line = this.lines[index];
            if (line.posBuffer) line.posBuffer.destroy();
            if (line.colorBuffer) line.colorBuffer.destroy();
            if (line.thicknessBuffer) line.thicknessBuffer.destroy();
            if (line.uvBuffer) line.uvBuffer.destroy();
            if (line.endPosBuffer) line.endPosBuffer.destroy();
            if (line.indexBuffer) line.indexBuffer.destroy();
            this.lines.splice(index, 1);
        }
    }

    clearAllLines() {
        for (const line of this.lines) {
            if (line.posBuffer) line.posBuffer.destroy();
            if (line.colorBuffer) line.colorBuffer.destroy();
            if (line.thicknessBuffer) line.thicknessBuffer.destroy();
            if (line.uvBuffer) line.uvBuffer.destroy();
            if (line.endPosBuffer) line.endPosBuffer.destroy();
            if (line.indexBuffer) line.indexBuffer.destroy();
        }
        this.lines = [];
    }

    // Update the view matrix from a float array
    // called from OnPointerMove in WebGPUCanvas.razor.cs
    // line 108 & OnWheel, line129
    updateViewMatrix(matrixArray) {
        this.#viewMatrix.set(matrixArray);
        // Update the uniform buffer with the new view matrix
        this.device.queue.writeBuffer(this.frameUniformBuffer, 0, this.#frameArrayBuffer);
    }
}

class ResizeObserverHelper extends ResizeObserver {
    // Purpose:
    //  - Keep the GPU canvas in sync with CSS/layout size changes.
    //  - On HiDPI displays, ResizeObserverHelper provides devicePixelContentBoxSize which
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

// WGSL shader for solid-colored meshes (cubes, etc.)
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
    // Simple lighting: use world position for fake normals
    let normal = normalize(cross(dpdx(in.worldPos), dpdy(in.worldPos)));
    let lightDir = normalize(vec3f(1.0, 1.0, 1.0));
    let diffuse = max(dot(normal, lightDir), 0.3); // Minimum ambient
    return vec4f(meshUniforms.color.rgb * diffuse, meshUniforms.color.a);
  }
`;

// WGSL shader for meshes with per-face flat colors 
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
    @location(1) @interpolate(flat) color: vec4f  // FLAT = no interpolation = solid color per triangle
  }
  
  @vertex fn vertexMain(in: VertexIn) -> VertexOut {
    var out: VertexOut;
    out.pos = camera.projection * camera.view * vec4f(in.pos, 1.0);
    out.worldPos = in.pos;
    out.color = in.color;
    return out;
  }
  
  @fragment fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
    // Simple lighting: use screen-space derivatives for per-face normals
    let normal = normalize(cross(dpdx(in.worldPos), dpdy(in.worldPos)));
    let lightDir = normalize(vec3f(1.0, 1.0, 1.0));
    let diffuse = max(dot(normal, lightDir), 0.3); // Minimum ambient
    
    // Return solid color per triangle (no gradient due to flat interpolation)
    return vec4f(in.color.rgb * diffuse, in.color.a);
  }
`;

// WGSL shader for per-triangle flat colors (one color per triangle)
const MESH_SHADER_TRIANGLE_COLOR = `
  struct Camera { projection: mat4x4f, view: mat4x4f }
  @group(0) @binding(0) var<uniform> camera: Camera;
  
  struct VertexIn {
    @location(0) pos: vec3f,
  @location(1) color: vec4f
  }
  
  struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) worldPos: vec3f,
    @location(1) @interpolate(flat) color: vec4f  // FLAT = solid color per triangle
  }
  
  @vertex fn vertexMain(in: VertexIn) -> VertexOut {
    var out: VertexOut;
    out.pos = camera.projection * camera.view * vec4f(in.pos, 1.0);
    out.worldPos = in.pos;
    out.color = in.color;
    return out;
  }
  
  @fragment fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
    // Simple lighting
    let normal = normalize(cross(dpdx(in.worldPos), dpdy(in.worldPos)));
    let lightDir = normalize(vec3f(1.0, 1.0, 1.0));
    let diffuse = max(dot(normal, lightDir), 0.3);
    
    // Return solid color per triangle
    return vec4f(in.color.rgb * diffuse, in.color.a);
  }
`;

// WGSL shader for rendering lines/paths with variable thickness and color
const BILLBOARD_LINE_SHADER = `
  struct Camera { projection: mat4x4f, view: mat4x4f }
  @group(0) @binding(0) var<uniform> camera: Camera;

  struct VertexIn {
    @location(0) pos: vec3f,
    @location(1) color: vec4f,
    @location(2) thickness: f32,
    @location(3) uv: vec2f,
    @location(4) endPos: vec3f
  }

  struct VertexOut {
    @builtin(position) clipPos: vec4f,
    @location(0) color: vec4f
  }

  @vertex fn vertexMain(in: VertexIn) -> VertexOut {
    var out: VertexOut;
    
    // Transform start and end points of the segment to view space
    let viewStart = camera.view * vec4f(in.pos, 1.0);
    let viewEnd = camera.view * vec4f(in.endPos, 1.0);

    // Determine the current vertex position along the line in view space
    let currentPos = mix(viewStart, viewEnd, vec4f(in.uv.x, in.uv.x, in.uv.x, in.uv.x));

    // Get the 2D direction of the line on the screen (in view space)
    let viewDir = normalize(viewEnd.xy - viewStart.xy);
    
    // Calculate the 2D perpendicular direction
    let perp = vec2f(-viewDir.y, viewDir.x);
    
    // Calculate the offset in view space
    let offset = perp * in.thickness * in.uv.y;
    
    // Apply the 2D offset to the vertex's xy position in view space
    let finalPos = vec4f(currentPos.xy + offset, currentPos.z, currentPos.w);
    
    // Project the final view-space position to clip space
    out.clipPos = camera.projection * finalPos;
    out.color = in.color;
    return out;
  }

  @fragment fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
    return in.color;
  }
`;

// WGSL shader for rendering text billboards
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
    if (color.a < 0.1) {
        discard;
    }
    return color;
  }
`;

let plotSpace = null;
let frameIntervalId = 0;
let dotNetRef = null;

// called from Blazor to initialize things on this end
// line 159 SendOptionsToJavaScriptAsync 
export function initGPU_Canvas(dotnet, canvasEl, options, viewMatrix) {
    // Entry point called by Blazor after the component renders the <canvas>.
    dotNetRef = dotnet ?? null;
    // Use the canvas ElementReference passed from Blazor if available
    const canvas = canvasEl || document.querySelector('.webgpu-canvas');
    if (!canvas) throw new Error('webgpu-canvas element not found');
    plotSpace = new WebGpu_Canvas(canvas, viewMatrix);

    // Apply base options including render config
    if (options) {
        if (typeof options.sampleCount === 'number') plotSpace.sampleCount = options.sampleCount;

        // Projection type (convert C# enum value to lowercase string)
        if (typeof options.projectionType === 'number') {
            plotSpace.projectionType = options.projectionType === 0 ? 'perspective' : 'orthographic';
        }

        if (typeof options.fov === 'number') plotSpace.fov = options.fov;
        if (typeof options.orthoSize === 'number') plotSpace.orthoSize = options.orthoSize;
        if (typeof options.zNear === 'number') plotSpace.zNear = options.zNear;
        if (typeof options.zFar === 'number') plotSpace.zFar = options.zFar;

        Object.assign(plotSpace.gridOptions, options);
        if (typeof plotSpace._updateUniforms === 'function') plotSpace._updateUniforms();
    }

    // Periodically push frame ms to .NET (throttled)
    if (dotNetRef) {
        frameIntervalId = self.setInterval(() => {
            if (!plotSpace) return;
            const ms = plotSpace.frameMs || 0;
            try { dotNetRef.invokeMethodAsync('OnFrameMsUpdate', ms); } catch { }
        }, 1000);
    }
}

// Get bounding client rect for an element
export function getBoundingClientRect(element) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
    };
}

// Exported function: Updates the view matrix from C#
// Called when camera changes in WebGPUCanvas.razor
export function updateViewMatrix(matrixArray) {
    if (plotSpace) plotSpace.updateViewMatrix(matrixArray);
}

// Called by Blazor (SendOptionsToJavaScriptAsync) line 163
// of WebGPUCanvas.razor.cs
export function updateGridOptions(options) {
    // Called by Blazor when parameters change. Uniforms are updated immediately.
    if (!plotSpace || !options) return;

    // Track if camera projection needs updating
    let projectionNeedsUpdate = false;

    if (typeof options.sampleCount === 'number') plotSpace.sampleCount = options.sampleCount; // may require rebuild to fully apply

    // Projection type (convert C# enum: 0=Perspective, 1=Orthographic)
    if (typeof options.projectionType === 'number') {
        const newType = options.projectionType === 0 ? 'perspective' : 'orthographic';
        if (plotSpace.projectionType !== newType) {
            plotSpace.projectionType = newType;
            projectionNeedsUpdate = true;
        }
    }

    if (typeof options.fov === 'number') {
        plotSpace.fov = options.fov;
        projectionNeedsUpdate = true;
    }

    if (typeof options.orthoSize === 'number') {
        plotSpace.orthoSize = options.orthoSize;
        projectionNeedsUpdate = true;
    }

    if (typeof options.zNear === 'number') {
        plotSpace.zNear = options.zNear;
        projectionNeedsUpdate = true;
    }

    if (typeof options.zFar === 'number') {
        plotSpace.zFar = options.zFar;
        projectionNeedsUpdate = true;
    }

    // Update projection matrix if any camera parameters changed
    if (projectionNeedsUpdate) {
        plotSpace.updateProjection();
    }

    // Update grid options (colors, line widths)
    Object.assign(plotSpace.gridOptions, options);

    // Update GPU uniforms if the function is available
    if (typeof plotSpace._updateUniforms === 'function') {
        plotSpace._updateUniforms();
    }

    // Update render pass clear color if clearColor changed
    if (options.clearColor) {
        plotSpace.clearColor = options.clearColor;
        // Reallocate render targets to apply new clear color
        if (plotSpace.device && plotSpace.canvas) {
            const size = { width: plotSpace.canvas.width, height: plotSpace.canvas.height };
            plotSpace.colorAttachment.clearValue = plotSpace.clearColor;
        }
    }
}

// called from Blazor to clean up resources
// line 197 DisposeAsync in WebGPUCanvas.razor.cs
export function disposeWebGPU_Canvas() {
    if (frameIntervalId) { clearInterval(frameIntervalId); frameIntervalId = 0; }
    plotSpace = null;
    dotNetRef = null;
}

// Export mesh management functions
// called from Blazor to add/remove meshes dynamically
// line 61 of WebGpuCanvas.razor in AddMessAsyn
export function addMesh(meshData) {
    if (plotSpace) plotSpace.addMesh(meshData);
}

// called from Blazor to add/remove meshes dynamically
// line 70 of WebGpuCanvas.razor in RemoveMeshAsync
export function removeMesh(meshId) {
    if (plotSpace) plotSpace.removeMesh(meshId);
}

// called from Blazor to add/remove meshes dynamically
// line 79 of WebGpuCanvas.razor in ClearAllMeshesAsync
export function clearAllMeshes() {
    if (plotSpace) plotSpace.clearAllMeshes();
}

// called from Blazor to add/remove lines dynamically
export function addLines(lineData) {
    if (plotSpace) plotSpace.addLines(lineData);
}

// called from Blazor to add/remove lines dynamically
export function removeLines(lineId) {
    if (plotSpace) plotSpace.removeLines(lineId);
}

// called from Blazor to add/remove lines dynamically
export function clearAllLines() {
    if (plotSpace) plotSpace.clearAllLines();
}

// called from Blazor to add/remove text billboards dynamically
export function addTextBillboard(billboardData) {
    if (plotSpace) plotSpace.addTextBillboard(billboardData);
}

// called from Blazor to add/remove text billboards dynamically
export function removeTextBillboard(billboardId) {
    if (plotSpace) plotSpace.removeTextBillboard(billboardId);
}

// called from Blazor to add/remove text billboards dynamically
export function clearAllTextBillboards() {
    if (plotSpace) plotSpace.clearAllTextBillboards();
}
