using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace BugViewer;

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
        ClearColor = "rgb(233,233,255)",
        LineColor = "rgb(215, 215, 215)",
        LineTransparency = 0.8f,
        BaseColor = "rgb(0, 0, 0)",
        BaseTransparency = 0f,
        LineWidthX = 0.1,
        LineWidthY = 0.1,
        SampleCount = 4,
        IsProjectionCamera = true,
        Fov = 20,
        OrthoSize = 5.0,
        ZNear = 0.01,
        ZFar = 500,
        GridSize = 100.0,
        GridSpacing = 5.0,
        ConstrainPolar = true,
        MaxPolar = Math.PI * 0.49,
        MinPolar = -Math.PI * 0.49,
        ConstrainAzimuth = false,
        MaxAzimuth = 0,
        MinAzimuth = 0,
        MaxDistance = 999.0,
        MinDistance = 0.5,
        ConstrainDistance = true,
        OrbitSensitivity = 0.003,
        ZoomSensitivity = 0.003,
        PanSensitivity = 0.007,
        PanSpeedMultiplier = 3.0
    };
    public void ResetToDefault()
    {
        ClearColor = Default.ClearColor;
        LineColor = Default.LineColor;
        LineTransparency = Default.LineTransparency;
        BaseColor = Default.BaseColor;
        BaseTransparency = Default.BaseTransparency;
        LineWidthX = Default.LineWidthX;
        LineWidthY = Default.LineWidthY;
        SampleCount = Default.SampleCount;
        IsProjectionCamera = Default.IsProjectionCamera;
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
        GridSize = Default.GridSize;
        GridSpacing = Default.GridSpacing;
    }

    private string _clearColor;
    /// <summary>Background clear color for the rendering canvas.</summary>
    public string ClearColor
    {
        get => _clearColor;
        set
        {
            if (_clearColor != value)
            {
                _clearColor = value;
                OnPropertyChanged();
            }
        }
    }

    private double _lineTransparency = 1.0;
    public double LineTransparency
    {
        get => _lineTransparency;
        set
        {
            if (ChangeOccurrred(_lineTransparency, value))
            {
                _lineTransparency = value;
                OnPropertyChanged();
            }
        }
    }
    private string _lineColor;
    /// <summary>Color of grid lines.</summary>
    public string LineColor
    {
        get => _lineColor;
        set
        {
            if (_lineColor != value)
            {
                _lineColor = value;
                OnPropertyChanged();
            }
        }
    }


    private double _baseTransparency = 1.0;
    public double BaseTransparency
    {
        get => _baseTransparency;
        set
        {
            if (ChangeOccurrred(_baseTransparency, value))
            {
                _baseTransparency = value;
                OnPropertyChanged();
            }
        }
    }

    private string _baseColor;
    /// <summary>Base/background color of the grid.</summary>
    public string BaseColor
    {
        get => _baseColor;
        set
        {
            if (_baseColor != value)
            {
                _baseColor = value;
                OnPropertyChanged();
            }
        }
    }

    private double _lineWidthX;
    private double _lineWidthY;

    /// <summary>Grid line width in X direction (0.0 to 1.0).</summary>
    public double LineWidthX
    {
        get => _lineWidthX;
        set
        {
            var clamp = Math.Clamp(value, 0.0, 1.0);
            if (ChangeOccurrred(_lineWidthX, clamp))
            {
                _lineWidthX = clamp;
                OnPropertyChanged();
            }
        }
    }

    /// <summary>Grid line width in Y direction (0.0 to 1.0).</summary>
    public double LineWidthY
    {
        get => _lineWidthY;
        set
        {
            var clamp = Math.Clamp(value, 0.0, 1.0);
            if (ChangeOccurrred(_lineWidthY, clamp))
            {
                _lineWidthY = clamp;
                OnPropertyChanged();
            }
        }
    }


    private double _gridSize;
    private double _gridSpacing;

    /// <summary>Grid size of the square.</summary>
    public double GridSize
    {
        get => _gridSize;
        set
        {
            if (ChangeOccurrred(_gridSize, value))
            {
                _gridSize = value;
                OnPropertyChanged();
            }
        }
    }

    /// <summary>Grid spacing.</summary>
    public double GridSpacing
    {
        get => _gridSpacing;
        set
        {
            if (ChangeOccurrred(_gridSpacing, value))
            {
                _gridSpacing = value;
                OnPropertyChanged();
            }
        }
    }

    private int _sampleCount;
    /// <summary>Multi-Sample Anti-Aliasing (MSAA) sample count for smoother rendering.</summary>
    public int SampleCount
    {
        get => _sampleCount; set
        {
            if (_sampleCount != value)
            {
                _sampleCount = value;
                OnPropertyChanged();
            }
        }
    }

    private bool _isProjectionCamera;
    /// <summary>Camera projection type (Perspective or Orthographic).</summary>
    public bool IsProjectionCamera
    {
        get => _isProjectionCamera;
        set
        {
            if (_isProjectionCamera != value)
            {
                _isProjectionCamera = value;
                OnPropertyChanged();
            }
        }
    }

    private double _fov;
    /// <summary>Field of view in radians (used for Perspective projection).</summary>
    public double Fov
    {
        get => _fov;
        set
        {
            if (ChangeOccurrred(_fov, value))
            {
                _fov = value;
                OnPropertyChanged();
            }
        }
    }

    private double _orthoSize;
    /// <summary>Half-height of view in world units (used for Orthographic projection).</summary>
    public double OrthoSize
    {
        get => _orthoSize;
        set
        {
            if (ChangeOccurrred(value, _orthoSize))
            {
                _orthoSize = value;
                OnPropertyChanged();
            }
        }
    }

    private double _zNear;
    /// <summary>Near clipping plane distance.</summary>
    public double ZNear
    {
        get => _zNear;
        set
        {
            if (ChangeOccurrred(_zNear, value))
            {
                _zNear = value;
                OnPropertyChanged();
            }
        }
    }
    private double _zFar;
    /// <summary>Far clipping plane distance.</summary>
    public double ZFar
    {
        get => _zFar;
        set
        {
            if (ChangeOccurrred(_zFar, value))
            {
                _zFar = value;
                OnPropertyChanged();
            }
        }
    }

    // Orbit constraints
    private double _maxPolar;
    /// <summary>Maximum polar angle in radians (slightly less than 90° to avoid gimbal lock).</summary>
    public double MaxPolar
    {
        get => _maxPolar;
        set
        {
            if (ChangeOccurrred(_maxPolar, value))
            {
                _maxPolar = value;
                OnPropertyChanged();
            }
        }
    }

    private double _minPolar;
    /// <summary>Minimum polar angle in radians.</summary>
    public double MinPolar
    {
        get => _minPolar;
        set
        {
            if (ChangeOccurrred(_minPolar, value))
            {
                _minPolar = value;
                OnPropertyChanged();
            }
        }
    }

    private double _maxAzimuth;
    /// <summary>Maximum azimuth angle in radians.</summary>
    public double MaxAzimuth
    {
        get => _maxAzimuth;
        set
        {
            if (ChangeOccurrred(_maxAzimuth, value))
            {
                _maxAzimuth = value;
                OnPropertyChanged();
            }
        }
    }

    private double _minAzimuth;
    /// <summary>Minimum azimuth angle in radians.</summary>
    public double MinAzimuth
    {
        get => _minAzimuth;
        set
        {
            if (ChangeOccurrred(_minAzimuth, value))
            {
                _minAzimuth = value;
                OnPropertyChanged();
            }
        }
    }
    private bool _zIsUp;
    public bool ZIsUp
    {
        get => _zIsUp;
        set
        {
            if (_zIsUp != value)
            {
                _zIsUp = value;
                OnPropertyChanged();
            }
        }
    }


    private bool _constrainPolar;
    /// <summary>Whether to constrain the polar angle.</summary>
    public bool ConstrainPolar { get => _constrainPolar; set { _constrainPolar = value; OnPropertyChanged(); } }

    private bool _constrainAzimuth;
    /// <summary>Whether to constrain the azimuth angle.</summary>
    public bool ConstrainAzimuth { get => _constrainAzimuth; set { _constrainAzimuth = value; OnPropertyChanged(); } }

    // Distance constraints
    private double _maxDistance;
    /// <summary>Maximum camera distance from the target.</summary>
    public double MaxDistance
    {
        get => _maxDistance;
        set
        {
            if (ChangeOccurrred(_maxDistance, value))
            {
                _maxDistance = value;
                OnPropertyChanged();
            }
        }
    }

    private double _minDistance;
    /// <summary>Minimum camera distance from the target.</summary>
    public double MinDistance
    {
        get => _minDistance;
        set
        {
            if (ChangeOccurrred(_minDistance, value))
            {
                _minDistance = value;
                OnPropertyChanged();
            }
        }
    }

    private bool _constrainDistance;
    /// <summary>Whether to constrain the camera distance.</summary>
    public bool ConstrainDistance { get => _constrainDistance; set { _constrainDistance = value; OnPropertyChanged(); } }

    // Sensitivity settings
    private double _orbitSensitivity;
    /// <summary>Sensitivity for orbit (rotation) controls.</summary>
    public double OrbitSensitivity
    {
        get => _orbitSensitivity;
        set
        {
            if (ChangeOccurrred(_orbitSensitivity, value))
            {
                _orbitSensitivity = value;
                OnPropertyChanged();
            }
        }
    }

    private double _zoomSensitivity;
    /// <summary>Sensitivity for zoom controls (increased for better zoom response).</summary>
    public double ZoomSensitivity
    {
        get => _zoomSensitivity;
        set
        {
            if (ChangeOccurrred(_zoomSensitivity, value))
            {
                _zoomSensitivity = value;
                OnPropertyChanged();
            }
        }
    }

    private double _panSensitivity;
    /// <summary>Sensitivity for pan controls.</summary>
    public double PanSensitivity
    {
        get => _panSensitivity;
        set
        {
            if (ChangeOccurrred(_panSensitivity, value))
            {
                _panSensitivity = value;
                OnPropertyChanged();
            }
        }
    }

    private double _panSpeedMultiplier;
    /// <summary>Multiplier for pan speed when Shift is held.</summary>
    public double PanSpeedMultiplier
    {
        get => _panSpeedMultiplier;
        set
        {
            if (ChangeOccurrred(_panSpeedMultiplier, value))
            {
                _panSpeedMultiplier = value;
                OnPropertyChanged();
            }
        }
    }

    private bool ChangeOccurrred(double v1, double v2)
    {
        return Math.Abs(v1 - v2) > 1e-3;
    }
    /// <summary>
    /// Converts this options object to a JS-friendly format with colors normalized to 0-1 floats.
    /// </summary>
    public object ToJavascriptOptions() => new
    {
        clearColor = BugViewer.ColorToJavaScript(ClearColor, 1).ToArray(),
        lineColor = BugViewer.ColorToJavaScript(LineColor, LineTransparency).ToArray(),
        baseColor = BugViewer.ColorToJavaScript(BaseColor, BaseTransparency).ToArray(),
        lineWidthX = (float)LineWidthX,
        lineWidthY = (float)LineWidthY,
        sampleCount = SampleCount,
        gridSize = (float)GridSize,
        gridSpacing = (float)GridSpacing
    };
}