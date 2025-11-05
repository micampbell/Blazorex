using System.Numerics;

namespace Blazor3D.Models;

/// <summary>
/// Simple ray structure for picking/selection operations.
/// </summary>
public struct Ray
{
    public Vector3 Origin;
    public Vector3 Direction;

    public Ray(Vector3 origin, Vector3 direction)
    {
        Origin = origin;
        Direction = direction;
    }
}

/// <summary>
/// Orbit camera for 3D scene navigation with mouse/touch controls.
/// Handles rotation (orbit), zoom (distance), and pan (target movement).
/// </summary>
public class OrbitCamera
{
    // Orbit angles in radians
    private double _orbitX;
    private double _orbitY;

    // Camera distance from target
    private double _distance = 10.0;

    // Camera target position
    private Vector3 _target = Vector3.Zero;

    // Cached matrices
    private Matrix4x4 _viewMatrix = Matrix4x4.Identity;
    private Matrix4x4 _cameraMatrix = Matrix4x4.Identity;
    private bool updateCamera = true;

    /// <summary>
    /// Vertical orbit angle in radians (pitch).
    /// </summary>
    public double OrbitX
    {
        get => _orbitX;
        set
        {
            _orbitX = ConstrainXOrbit ? Math.Clamp(value, MinOrbitX, MaxOrbitX) : value;
            updateCamera = true;
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
            updateCamera = true;
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
            updateCamera = true;
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
            updateCamera = true;
        }
    }

    // Orbit constraints
    public double MaxOrbitX { get; set; } = Math.PI * 0.49; // Slightly less than 90° to avoid gimbal lock
    public double MinOrbitX { get; set; } = -Math.PI * 0.49;
    public double MaxOrbitY { get; set; } = Math.PI;
    public double MinOrbitY { get; set; } = -Math.PI;
    public bool ConstrainXOrbit { get; set; } = true;
    public bool ConstrainYOrbit { get; set; } = false;

    // Distance constraints
    public double MaxDistance { get; set; } = 50.0;
    public double MinDistance { get; set; } = 0.5;
    public bool ConstrainDistance { get; set; } = true;

    // Sensitivity settings
    public double OrbitSensitivity { get; set; } = 0.005;
    public double ZoomSensitivity { get; set; } = 0.01; // Increased for better zoom response
    public double PanSensitivity { get; set; } = 0.01;
    public double PanSpeedMultiplier { get; set; } = 2.0; // Multiplier when Shift is held

    /// <summary>
    /// Camera projection type (Perspective or Orthographic).
    /// </summary>
    public ProjectionType ProjectionType { get; set; } = ProjectionType.Perspective;

    /// <summary>
    /// Field of view in radians (used for Perspective projection).
    /// </summary>
    public double Fov { get; set; } = Math.PI * 0.5;

    /// <summary>
    /// Half-height of view in world units (used for Orthographic projection).
    /// </summary>
    public double OrthoSize { get; set; } = 5.0;

    /// <summary>
    /// Near clipping plane distance.
    /// </summary>
    public double ZNear { get; set; } = 0.01;

    /// <summary>
    /// Far clipping plane distance.
    /// </summary>
    public double ZFar { get; set; } = 128.0;

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
        // Use exponential zoom for more natural feel
        var zoomFactor = 1.0 + (wheelDelta * ZoomSensitivity);
        Distance *= zoomFactor;
    }

    /// <summary>
    /// Pans the camera target in screen space.
    /// </summary>
    /// <param name="deltaX">Horizontal movement in pixels</param>
    /// <param name="deltaY">Vertical movement in pixels</param>
    /// <param name="shiftPressed">Whether Shift key is pressed for faster movement</param>
    public void Pan(double deltaX, double deltaY, bool shiftPressed = false)
    {
        // Calculate pan speed based on distance (closer = slower pan)
        var panSpeed = PanSensitivity * Distance * (shiftPressed ? PanSpeedMultiplier : 1.0);

        // Get camera's right and up vectors
        UpdateMatrices();
        Matrix4x4.Invert(_viewMatrix, out var cameraMatrix);

        var right = new Vector3(cameraMatrix.M11, cameraMatrix.M12, cameraMatrix.M13);
        var up = new Vector3(cameraMatrix.M21, cameraMatrix.M22, cameraMatrix.M23);

        // Pan in camera space
        _target += right * (float)(-deltaX * panSpeed);
        _target += up * (float)(deltaY * panSpeed);
        updateCamera = true;
    }

    /// <summary>
    /// Pans the camera using WASD-style directional input.
    /// </summary>
    /// <param name="forward">Forward/backward movement (-1 to 1, S/W keys)</param>
    /// <param name="right">Right/left movement (-1 to 1, A/D keys)</param>
    /// <param name="up">Up/down movement (-1 to 1, typically Q/E keys)</param>
    /// <param name="shiftPressed">Whether Shift key is pressed for faster movement</param>
    public void PanDirectional(double forward, double right, double up, bool shiftPressed = false)
    {
        var panSpeed = PanSensitivity * Distance * (shiftPressed ? PanSpeedMultiplier : 1.0);

        // Get camera's directional vectors
        UpdateMatrices();
        Matrix4x4.Invert(_viewMatrix, out var cameraMatrix);

        var rightVec = new Vector3(cameraMatrix.M11, cameraMatrix.M12, cameraMatrix.M13);
        var upVec = new Vector3(cameraMatrix.M21, cameraMatrix.M22, cameraMatrix.M23);
        var forwardVec = new Vector3(cameraMatrix.M31, cameraMatrix.M32, cameraMatrix.M33);

        // Move target in camera space
        _target += rightVec * (float)(right * panSpeed * 5.0); // Scale up for keyboard input
        _target += upVec * (float)(up * panSpeed * 5.0);
        _target += forwardVec * (float)(-forward * panSpeed * 5.0); // Negative for intuitive forward direction
        updateCamera = true;
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
            return new Vector3(cameraMatrix.M41, cameraMatrix.M42, cameraMatrix.M43);
        }
    }

    /// <summary>
    /// Returns the view matrix as a float array for JavaScript interop.
    /// </summary>
    public float[] GetViewMatrixArray()
    {
        var m = ViewMatrix;
        return
            [ m.M11, m.M12, m.M13, m.M14,
              m.M21, m.M22, m.M23, m.M24,
              m.M31, m.M32, m.M33, m.M34,
              m.M41, m.M42, m.M43, m.M44 ];
    }

    private void UpdateMatrices()
    {
        if (!updateCamera) return;

        // Build camera matrix: translate to target, rotate, then move back by distance
        _cameraMatrix = Matrix4x4.Identity;
        _cameraMatrix = Matrix4x4.Multiply(_cameraMatrix, Matrix4x4.CreateTranslation(_target));
        _cameraMatrix = Matrix4x4.Multiply(_cameraMatrix, Matrix4x4.CreateRotationY(-(float)_orbitY));
        _cameraMatrix = Matrix4x4.Multiply(_cameraMatrix, Matrix4x4.CreateRotationX(-(float)_orbitX));
        _cameraMatrix = Matrix4x4.Multiply(_cameraMatrix, Matrix4x4.CreateTranslation(0, 0, (float)_distance));

        // View matrix is inverse of camera matrix
        Matrix4x4.Invert(_cameraMatrix, out _viewMatrix);
        updateCamera = false;
    }

    /// <summary>
    /// Resets the camera to default position.
    /// </summary>
    public void Reset()
    {
        _orbitX = 0;
        _orbitY = 0;
        _distance = 10.0;
        _target = Vector3.Zero;
        updateCamera = true;
    }

    /// <summary>
    /// Creates a ray from the camera through a screen position for picking/selection.
    /// </summary>
    /// <param name="screenX">Screen X coordinate relative to canvas (0 = left, canvasWidth = right)</param>
    /// <param name="screenY">Screen Y coordinate relative to canvas (0 = top, canvasHeight = bottom)</param>
    /// <param name="screenWidth">Canvas/screen width in pixels</param>
    /// <param name="screenHeight">Canvas/screen height in pixels</param>
    /// <returns>Ray with origin at camera position and direction through the screen point</returns>
    public Ray CreateRayFromScreenPoint(double screenX, double screenY, double screenWidth, double screenHeight)
    {
        UpdateMatrices();

        // Convert screen coordinates to normalized device coordinates (NDC)
        // NDC: X: -1 (left) to +1 (right), Y: -1 (bottom) to +1 (top)
        double ndcX = (2.0 * screenX / screenWidth) - 1.0;
        double ndcY = 1.0 - (2.0 * screenY / screenHeight); // Flip Y axis (screen top = 0, NDC top = +1)

        // Create NDC point at near and far planes
        Vector4 nearPointNDC = new Vector4((float)ndcX, (float)ndcY, -1.0f, 1.0f); // Near plane (Z = -1 in NDC)
        Vector4 farPointNDC = new Vector4((float)ndcX, (float)ndcY, 1.0f, 1.0f);  // Far plane (Z = +1 in NDC)

        // Get the view-projection matrix
        Matrix4x4 viewMatrix = ViewMatrix;
        Matrix4x4 projectionMatrix = CreateProjectionMatrix(screenWidth, screenHeight);
        Matrix4x4 viewProjectionMatrix = Matrix4x4.Multiply(viewMatrix, projectionMatrix);

        // Calculate inverse view-projection matrix
        if (!Matrix4x4.Invert(viewProjectionMatrix, out Matrix4x4 inverseViewProjection))
        {
            // Fallback: use just inverse view matrix if projection inversion fails
            Matrix4x4.Invert(viewMatrix, out inverseViewProjection);
        }

        // Unproject the points from NDC back to world space
        Vector4 nearPointWorld = Vector4.Transform(nearPointNDC, inverseViewProjection);
        Vector4 farPointWorld = Vector4.Transform(farPointNDC, inverseViewProjection);

        // Perspective divide (convert from homogeneous coordinates)
        nearPointWorld /= nearPointWorld.W;
        farPointWorld /= farPointWorld.W;

        // Create ray
        Vector3 origin = Position;
        Vector3 target = new Vector3(farPointWorld.X, farPointWorld.Y, farPointWorld.Z);
        Vector3 direction = Vector3.Normalize(target - origin);

        return new Ray(origin, direction);
    }

    /// <summary>
    /// Creates the projection matrix based on current camera settings and screen dimensions.
    /// </summary>
    private Matrix4x4 CreateProjectionMatrix(double screenWidth, double screenHeight)
    {
        float aspectRatio = (float)(screenWidth / screenHeight);

        if (ProjectionType == ProjectionType.Orthographic)
        {
            return Matrix4x4.CreateOrthographic((float)OrthoSize * 2 * aspectRatio, (float)OrthoSize * 2, (float)ZNear, (float)ZFar);
        }
        else
        {
            return Matrix4x4.CreatePerspectiveFieldOfView((float)Fov, aspectRatio, (float)ZNear, (float)ZFar);
        }
    }
}
