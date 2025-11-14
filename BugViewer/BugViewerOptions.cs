using Microsoft.Extensions.Options;
using System.ComponentModel;
using System.Drawing;
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
    /// <summary>
    /// Event raised when a property value changes.
    /// </summary>
    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    /// <summary>Default configuration with sensible values for a basic grid.</summary>
    public static BugViewerOptions Default = new()
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
    public void ResetToDefault()
    {
        ClearColor = Default.ClearColor;
        LineColor = Default.LineColor;
        BaseColor = Default.BaseColor;
        LineWidthX = Default.LineWidthX;
        LineWidthY = Default.LineWidthY;
        SampleCount = Default.SampleCount;
        ProjectionType = Default.ProjectionType;
        Fov = Default.Fov;
        OrthoSize = Default.OrthoSize;
        ZNear = Default.ZNear;
        ZFar = Default.ZFar;
        MaxPolar = Default.MaxPolar;
        MinPolar = Default.MinPolar;
        MaxAzimuth = Default.MaxAzimuth;
        MinAzimuth = Default.MinAzimuth;
        ConstrainPolar = Default.ConstrainPolar;
        ConstrainAzimuth = Default.ConstrainAzimuth;
        MaxDistance = Default.MaxDistance;
        MinDistance = Default.MinDistance;
        ConstrainDistance = Default.ConstrainDistance;
        OrbitSensitivity = Default.OrbitSensitivity;
        ZoomSensitivity = Default.ZoomSensitivity;
        PanSensitivity = Default.PanSensitivity;
        PanSpeedMultiplier = Default.PanSpeedMultiplier;

    }

    private Color _clearColor;
    /// <summary>Background clear color for the rendering canvas.</summary>
    public Color ClearColor { get => _clearColor; set { _clearColor = value; OnPropertyChanged(); } }

    private Color _lineColor;
    /// <summary>Color of grid lines.</summary>
    public Color LineColor { get => _lineColor; set { _lineColor = value; OnPropertyChanged(); } }

    private Color _baseColor;
    /// <summary>Base/background color of the grid.</summary>
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
    /// <summary>Multi-Sample Anti-Aliasing (MSAA) sample count for smoother rendering.</summary>
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

    // Orbit constraints
    private double _maxPolar = Math.PI * 0.49;
    /// <summary>Maximum polar angle in radians (slightly less than 90° to avoid gimbal lock).</summary>
    public double MaxPolar { get => _maxPolar; set { _maxPolar = value; } }

    private double _minPolar = -Math.PI * 0.49;
    /// <summary>Minimum polar angle in radians.</summary>
    public double MinPolar { get => _minPolar; set { _minPolar = value; } }

    private double _maxAzimuth = Math.PI;
    /// <summary>Maximum azimuth angle in radians.</summary>
    public double MaxAzimuth { get => _maxAzimuth; set { _maxAzimuth = value; } }

    private double _minAzimuth = -Math.PI;
    /// <summary>Minimum azimuth angle in radians.</summary>
    public double MinAzimuth { get => _minAzimuth; set { _minAzimuth = value; } }

    private bool _constrainPolar = true;
    /// <summary>Whether to constrain the polar angle.</summary>
    public bool ConstrainPolar { get => _constrainPolar; set { _constrainPolar = value; } }

    private bool _constrainAzimuth = false;
    /// <summary>Whether to constrain the azimuth angle.</summary>
    public bool ConstrainAzimuth { get => _constrainAzimuth; set { _constrainAzimuth = value; } }

    // Distance constraints
    private double _maxDistance = 50.0;
    /// <summary>Maximum camera distance from the target.</summary>
    public double MaxDistance { get => _maxDistance; set { _maxDistance = value; } }

    private double _minDistance = 0.5;
    /// <summary>Minimum camera distance from the target.</summary>
    public double MinDistance { get => _minDistance; set { _minDistance = value; } }

    private bool _constrainDistance = true;
    /// <summary>Whether to constrain the camera distance.</summary>
    public bool ConstrainDistance { get => _constrainDistance; set { _constrainDistance = value; } }

    // Sensitivity settings
    private double _orbitSensitivity = 0.003;
    /// <summary>Sensitivity for orbit (rotation) controls.</summary>
    public double OrbitSensitivity { get => _orbitSensitivity; set { _orbitSensitivity = value; } }

    private double _zoomSensitivity = 0.001;
    /// <summary>Sensitivity for zoom controls (increased for better zoom response).</summary>
    public double ZoomSensitivity { get => _zoomSensitivity; set { _zoomSensitivity = value; } }

    private double _panSensitivity = 0.007;
    /// <summary>Sensitivity for pan controls.</summary>
    public double PanSensitivity { get => _panSensitivity; set { _panSensitivity = value; } }

    private double _panSpeedMultiplier = 3.0;
    /// <summary>Multiplier for pan speed when Shift is held.</summary>
    public double PanSpeedMultiplier { get => _panSpeedMultiplier; set { _panSpeedMultiplier = value; } }


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