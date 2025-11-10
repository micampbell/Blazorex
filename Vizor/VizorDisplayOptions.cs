using System.Drawing;

namespace Vizor;

/// <summary>
/// Projection type for camera rendering.
/// </summary>
public enum ProjectionType
{
    /// <summary>Perspective projection with vanishing points (realistic, default for games/visualization).</summary>
    Perspective,

    /// <summary>Orthographic projection with parallel lines (technical drawings, CAD, engineering).</summary>
    Orthographic
}

/// <summary>
/// Options passed from C# to JavaScript for WebGPU grid rendering.
/// Matches the shape expected by webgpu-canvas.js initGridDemo/updateGridOptions.
/// </summary>
public record VizorDisplayOptions
{
    /// <summary>Default configuration with sensible values for a basic grid.</summary>
    public static readonly VizorDisplayOptions Default = new()
    {
        ClearColor = Color.FromArgb(0, 233, 233, 255),
        LineColor = Color.FromArgb(215, 215, 215),
        BaseColor = Color.FromArgb(0, 0, 0, 0),
        LineWidthX = 0.1,
        LineWidthY = 0.1,
        SampleCount = 4,
        ProjectionType = ProjectionType.Perspective,
        Fov = Math.PI * 0.5,
        OrthoSize = 5.0,
        ZNear = 0.01,
        ZFar = 128
    };

    public required Color ClearColor { get; init; }
    public required Color LineColor { get; init; }
    public required Color BaseColor { get; init; }

    private double _lineWidthX;
    private double _lineWidthY;

    /// <summary>Grid line width in X direction (0.0 to 1.0).</summary>
    public required double LineWidthX
    {
        get => _lineWidthX;
        init => _lineWidthX = Math.Clamp(value, 0.0, 1.0);
    }

    /// <summary>Grid line width in Y direction (0.0 to 1.0).</summary>
    public required double LineWidthY
    {
        get => _lineWidthY;
        init => _lineWidthY = Math.Clamp(value, 0.0, 1.0);
    }

    public required int SampleCount { get; init; }

    /// <summary>Camera projection type (Perspective or Orthographic).</summary>
    public required ProjectionType ProjectionType { get; init; }

    /// <summary>Field of view in radians (used for Perspective projection).</summary>
    public required double Fov { get; init; }

    /// <summary>Half-height of view in world units (used for Orthographic projection).</summary>
    public required double OrthoSize { get; init; }

    /// <summary>Near clipping plane distance.</summary>
    public required double ZNear { get; init; }

    /// <summary>Far clipping plane distance.</summary>
    public required double ZFar { get; init; }

    /// <summary>
    /// Converts this options object to a JS-friendly format with colors normalized to 0-1 floats.
    /// </summary>
    public object ToJavascriptOptions() => new
    {
        clearColor = new { r = ClearColor.R / 255f, g = ClearColor.G / 255f, b = ClearColor.B / 255f, a = ClearColor.A / 255f },
        lineColor = new { r = LineColor.R / 255f, g = LineColor.G / 255f, b = LineColor.B / 255f, a = LineColor.A / 255f },
        baseColor = new { r = BaseColor.R / 255f, g = BaseColor.G / 255f, b = BaseColor.B / 255f, a = BaseColor.A / 255f },
        lineWidthX = LineWidthX,
        lineWidthY = LineWidthY,
        sampleCount = SampleCount,
        projectionType = (int)ProjectionType,
        fov = Fov,
        orthoSize = OrthoSize,
        zNear = ZNear,
        zFar = ZFar
    };
}