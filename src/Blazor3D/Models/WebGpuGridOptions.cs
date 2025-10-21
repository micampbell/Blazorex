namespace Blazor3D.Models;

/// <summary>
/// Options passed from C# to JavaScript for WebGPU grid rendering.
/// Matches the shape expected by webgpu-canvas.js initGridDemo/updateGridOptions.
/// </summary>
public record WebGpuGridOptions
{
    public required ColorRgba ClearColor { get; init; }
    public required ColorRgba LineColor { get; init; }
    public required ColorRgba BaseColor { get; init; }
    public required double LineWidthX { get; init; }
    public required double LineWidthY { get; init; }
    public required int SampleCount { get; init; }
    public required double Fov { get; init; }
    public required double ZNear { get; init; }
    public required double ZFar { get; init; }
}

/// <summary>
/// RGBA color as 0.0-1.0 floats for WebGPU/JS interop.
/// </summary>
public record ColorRgba(double R, double G, double B, double A)
{
    public object FromSystemColor =>
        new { r = (float)R, g = (float)G, b = (float)B, a = (float)A };
}
