using System.Drawing;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace BugViewer;

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
/// Matches the shape expected by webgpu-canvas.js initGridDemo/updateDisplayOptions.
/// </summary>
public class BugViewerOptions : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    /// <summary>Default configuration with sensible values for a basic grid.</summary>
    public static BugViewerOptions Default => new()
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

    private Color _clearColor;
    public Color ClearColor { get => _clearColor; set { _clearColor = value; OnPropertyChanged(); } }

    private Color _lineColor;
    public Color LineColor { get => _lineColor; set { _lineColor = value; OnPropertyChanged(); } }

    private Color _baseColor;
    public Color BaseColor { get => _baseColor; set { _baseColor = value; OnPropertyChanged(); } }

    private double _lineWidthX;
    private double _lineWidthY;

    /// <summary>Grid line width in X direction (0.0 to 1.0).</summary>
    public double LineWidthX
    {
        get => _lineWidthX;
        set { _lineWidthX = Math.Clamp(value, 0.0, 1.0); OnPropertyChanged(); }
    }

    /// <summary>Grid line width in Y direction (0.0 to 1.0).</summary>
    public double LineWidthY
    {
        get => _lineWidthY;
        set { _lineWidthY = Math.Clamp(value, 0.0, 1.0); OnPropertyChanged(); }
    }

    private int _sampleCount;
    public int SampleCount { get => _sampleCount; set { _sampleCount = value; OnPropertyChanged(); } }

    private ProjectionType _projectionType;
    /// <summary>Camera projection type (Perspective or Orthographic).</summary>
    public ProjectionType ProjectionType { get => _projectionType; set { _projectionType = value; OnPropertyChanged(); } }

    private double _fov;
    /// <summary>Field of view in radians (used for Perspective projection).</summary>
    public double Fov { get => _fov; set { _fov = value; OnPropertyChanged(); } }

    private double _orthoSize;
    /// <summary>Half-height of view in world units (used for Orthographic projection).</summary>
    public double OrthoSize { get => _orthoSize; set { _orthoSize = value; OnPropertyChanged(); } }

    private double _zNear;
    /// <summary>Near clipping plane distance.</summary>
    public double ZNear { get => _zNear; set { _zNear = value; OnPropertyChanged(); } }

    private double _zFar;
    /// <summary>Far clipping plane distance.</summary>
    public double ZFar { get => _zFar; set { _zFar = value; OnPropertyChanged(); } }

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