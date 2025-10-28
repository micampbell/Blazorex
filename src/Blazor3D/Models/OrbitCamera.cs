using System.Numerics;

namespace Blazor3D.Models;

/// <summary>
/// Orbit camera for 3D scene navigation with mouse/touch controls.
/// Handles rotation (orbit) and zoom (distance) interactions.
/// </summary>
public class OrbitCamera
{
    // Orbit angles in radians
    private double _orbitX;
    private double _orbitY;

    // Camera distance from target
    private double _distance = 3.0;

    // Camera target position
    private Vector3 _target = Vector3.Zero;

    // Cached matrices
    private Matrix4x4 _viewMatrix = Matrix4x4.Identity;
    private Matrix4x4 _cameraMatrix = Matrix4x4.Identity;
    private bool _dirty = true;

    /// <summary>
    /// Vertical orbit angle in radians (pitch).
    /// </summary>
    public double OrbitX
    {
        get => _orbitX;
        set
        {
            _orbitX = ConstrainXOrbit ? Math.Clamp(value, MinOrbitX, MaxOrbitX) : value;
            _dirty = true;
        }
    }

    /// <summary>
    /// Horizontal orbit angle in radians (yaw).
    /// </summary>
    public double OrbitY
    {
        get => _orbitY;
        set
        {
            var newValue = value;
            if (ConstrainYOrbit)
            {
                newValue = Math.Clamp(value, MinOrbitY, MaxOrbitY);
            }
            else
            {
                // Wrap to [-π, π]
                while (newValue < -Math.PI) newValue += Math.PI * 2;
                while (newValue >= Math.PI) newValue -= Math.PI * 2;
            }
            _orbitY = newValue;
            _dirty = true;
        }
    }

    /// <summary>
    /// Distance from camera to target (zoom level).
    /// </summary>
    public double Distance
    {
        get => _distance;
        set
        {
            _distance = ConstrainDistance ? Math.Clamp(value, MinDistance, MaxDistance) : value;
            _dirty = true;
        }
    }

    /// <summary>
    /// Point in 3D space that the camera orbits around.
    /// </summary>
    public Vector3 Target
    {
        get => _target;
        set
        {
            _target = value;
            _dirty = true;
        }
    }

    // Orbit constraints
    public double MaxOrbitX { get; set; } = Math.PI * 0.5;
    public double MinOrbitX { get; set; } = -Math.PI * 0.5;
    public double MaxOrbitY { get; set; } = Math.PI;
    public double MinOrbitY { get; set; } = -Math.PI;
    public bool ConstrainXOrbit { get; set; } = true;
    public bool ConstrainYOrbit { get; set; } = false;

    // Distance constraints
    public double MaxDistance { get; set; } = 10.0;
    public double MinDistance { get; set; } = 1.0;
    public bool ConstrainDistance { get; set; } = true;

    // Sensitivity settings
    public double OrbitSensitivity { get; set; } = 0.005;
    public double ZoomSensitivity { get; set; } = 0.001;

    /// <summary>
    /// Updates orbit angles based on pointer/mouse delta.
    /// </summary>
    /// <param name="deltaX">Horizontal movement in pixels</param>
    /// <param name="deltaY">Vertical movement in pixels</param>
    public void Orbit(double deltaX, double deltaY)
    {
        OrbitY += deltaX * OrbitSensitivity;
        OrbitX += deltaY * OrbitSensitivity;
    }

    /// <summary>
    /// Updates zoom level based on wheel delta.
    /// </summary>
    /// <param name="wheelDelta">Mouse wheel delta (typically in 100s)</param>
    public void Zoom(double wheelDelta)
    {
        Distance += -wheelDelta * ZoomSensitivity;
    }

    /// <summary>
    /// Gets the view matrix for rendering.
    /// </summary>
    public Matrix4x4 ViewMatrix
    {
        get
        {
            UpdateMatrices();
            return _viewMatrix;
        }
    }

    /// <summary>
    /// Gets the camera position in world space.
    /// </summary>
    public Vector3 Position
    {
        get
        {
            UpdateMatrices();
            Matrix4x4.Invert(_viewMatrix, out var cameraMatrix);
            return Vector3.Transform(Vector3.Zero, cameraMatrix);
        }
    }

    /// <summary>
    /// Returns the view matrix as a float array for JavaScript interop.
    /// </summary>
    public float[] GetViewMatrixArray()
    {
        var m = ViewMatrix;
        return new float[]
                {
        m.M11, m.M12, m.M13, m.M14,
   m.M21, m.M22, m.M23, m.M24,
    m.M31, m.M32, m.M33, m.M34,
     m.M41, m.M42, m.M43, m.M44
                };
    }

    private void UpdateMatrices()
    {
        if (!_dirty) return;

        // Build camera matrix: translate to target, rotate, then move back by distance
        _cameraMatrix = Matrix4x4.Identity;
        _cameraMatrix = Matrix4x4.Multiply(_cameraMatrix, Matrix4x4.CreateTranslation(_target));
        _cameraMatrix = Matrix4x4.Multiply(_cameraMatrix, Matrix4x4.CreateRotationY(-(float)_orbitY));
        _cameraMatrix = Matrix4x4.Multiply(_cameraMatrix, Matrix4x4.CreateRotationX(-(float)_orbitX));
        _cameraMatrix = Matrix4x4.Multiply(_cameraMatrix, Matrix4x4.CreateTranslation(0, 0, (float)_distance));

        // View matrix is inverse of camera matrix
        Matrix4x4.Invert(_cameraMatrix, out _viewMatrix);
        _dirty = false;
    }

    /// <summary>
    /// Resets the camera to default position.
    /// </summary>
    public void Reset()
    {
        _orbitX = 0;
        _orbitY = 0;
        _distance = 3.0;
        _target = Vector3.Zero;
        _dirty = true;
    }
}
