// WebGPU Grid demo module for Blazor component
import { TinyWebGpuDemo } from './tiny-webgpu-demo.js';

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

  struct VertexIn {
    @location(0) pos: vec4f,
    @location(1) uv: vec2f,
  }

  struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
  }

  struct Camera {
    projection: mat4x4f,
    view: mat4x4f,
  }
  @group(0) @binding(0) var<uniform> camera: Camera;

  struct GridArgs {
    lineColor: vec4f,
    baseColor: vec4f,
    lineWidth: vec2f,
  }
  @group(1) @binding(0) var<uniform> gridArgs: GridArgs;

  @vertex
  fn vertexMain(in: VertexIn) -> VertexOut {
    var out: VertexOut;
    out.pos = camera.projection * camera.view * in.pos;
    out.uv = in.uv;
    return out;
  }

  @fragment
  fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
    var grid = PristineGrid(in.uv, gridArgs.lineWidth);
    return mix(gridArgs.baseColor, gridArgs.lineColor, grid * gridArgs.lineColor.a);
  }
`;

export class GridDemo extends TinyWebGpuDemo {
  vertexBuffer = null;
  indexBuffer = null;
  uniformBuffer = null;
  bindGroup = null;
  pipeline = null;

  uniformArray = new ArrayBuffer(16 * Float32Array.BYTES_PER_ELEMENT);
  lineColor = new Float32Array(this.uniformArray, 0, 4);
  baseColor = new Float32Array(this.uniformArray, 16, 4);
  lineWidth = new Float32Array(this.uniformArray, 32, 2);

  gridOptions = {
    clearColor: { r: 0, g: 0, b: 0.2, a: 1 },
    lineColor: { r: 1, g: 1, b: 1, a: 1 },
    baseColor: { r: 0, g: 0, b: 0, a: 1 },
    lineWidthX: 0.05,
    lineWidthY: 0.05,
  };

  onInit(device) {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'Pristine Grid',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {}
      }]
    });

    const module = device.createShaderModule({
      label: 'Pristine Grid',
      code: GRID_SHADER,
    });

    device.createRenderPipelineAsync({
      label: 'Pristine Grid',
      layout: device.createPipelineLayout({ bindGroupLayouts: [
        this.frameBindGroupLayout,
        bindGroupLayout,
      ]}),
      vertex: {
        module,
        entryPoint: 'vertexMain',
        buffers: [{
          arrayStride: 20,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x2' }],
        }],
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
      this.clearColor = this.gridOptions.clearColor;
      this.lineColor.set([ this.gridOptions.lineColor.r, this.gridOptions.lineColor.g, this.gridOptions.lineColor.b, this.gridOptions.lineColor.a ]);
      this.baseColor.set([ this.gridOptions.baseColor.r, this.gridOptions.baseColor.g, this.gridOptions.baseColor.b, this.gridOptions.baseColor.a ]);
      this.lineWidth.set([ this.gridOptions.lineWidthX, this.gridOptions.lineWidthY ]);
      device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformArray);
    };

    updateUniforms();
  }

  onFrame(device, context, timestamp) {
    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass(this.defaultRenderPassDescriptor);
    if (this.pipeline) {
      renderPass.setPipeline(this.pipeline);
      renderPass.setBindGroup(0, this.frameBindGroup);
      renderPass.setBindGroup(1, this.bindGroup);
      renderPass.setVertexBuffer(0, this.vertexBuffer);
      renderPass.setIndexBuffer(this.indexBuffer, 'uint32');
      renderPass.drawIndexed(6);
    }
    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
  }
}

let demo = null;

export function initGridDemo(options) {
  const canvas = document.querySelector('.webgpu-canvas');
  if (!canvas) throw new Error('webgpu-canvas element not found');
  demo = new GridDemo();
  if (options) {
    Object.assign(demo.gridOptions, options);
    // If uniforms already ready, apply
    if (typeof demo._updateUniforms === 'function') demo._updateUniforms();
  }
}

export function updateGridOptions(options) {
  if (demo && options) {
    Object.assign(demo.gridOptions, options);
    if (typeof demo._updateUniforms === 'function') demo._updateUniforms();
  }
}
