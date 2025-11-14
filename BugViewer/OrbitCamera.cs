using System.Numerics;

namespace BugViewer;

/// <summary>
/// Simple ray structure for picking/selection operations.
/// </summary>
public struct Ray
{
    public Vector3 Anchor;
    public Vector3 Direction;

    public Ray(Vector3 origin, Vector3 direction)
    {
        Anchor = origin;
        Direction = direction;
    }
}

/// <summary>
/// Orbit camera for 3D scene navigation with mouse/touch controls.
/// Handles rotation (orbit), zoom (distance), and pan (target movement).
/// </summary>
public class OrbitCamera
{
    private readonly BugViewerOptions _options;

    internal OrbitCamera(Vector3 target, BugViewerOptions options)
    {
        _options = options;
        Target = target;
        AzimuthAngle = Math.PI / 4; // Default to 45° for better initial view
        polarAngle = Math.PI / 6; // Default to 30° for better initial view
    }
    #region Properites/Fields
    /// <summary>
    /// Vertical orbit angle in radians (pitch).
    /// </summary>
    public double PolarAngle
    {
        get => polarAngle;
        set
        {
            polarAngle = _options.ConstrainPolar ? Math.Clamp(value, _options.MinPolar, _options.MaxPolar) : value;
            updateCamera = true;
        }
    }
    private double polarAngle;

    /// <summary>
    /// Horizontal orbit angle in radians (yaw).
    /// </summary>
    public double AzimuthAngle
    {
        get => azimuthAngle;
        set
        {
            var newValue = value;
            if (_options.ConstrainAzimuth)
            {
                newValue = Math.Clamp(value, _options.MinAzimuth, _options.MaxAzimuth);
            }
            else
            {
                // Wrap to [-π, π]
                while (newValue < -Math.PI) newValue += Math.Tau;
                while (newValue >= Math.PI) newValue -= Math.Tau;
            }
            azimuthAngle = newValue;
            updateCamera = true;
        }
    }
    // Orbit angles in radians
    private double azimuthAngle;

    /// <summary>
    /// Distance from camera to target (zoom level).
    /// </summary>
    public double Distance
    {
        get => distance;
        set
        {
            distance = _options.ConstrainDistance ? Math.Clamp(value, _options.MinDistance, _options.MaxDistance) : value;
            updateCamera = true;
        }
    }

    // Camera distance from target
    private double distance = 10.0;

    /// <summary>
    /// Point in 3D space that the camera orbits around.
    /// </summary>
    internal Vector3 Target
    {
        get => target;
        private set
        {
            target = value;
            updateCamera = true;
        }
    }
    private Vector3 target = Vector3.Zero;

    #endregion

    #region Controlling the Orbit (with mouse or keys)
    /// <summary>
    /// Updates orbit angles based on pointer/mouse delta.
    /// </summary>
    /// <param name="azimuth">Horizontal movement in pixels</param>
    /// <param name="deltaY">Vertical movement in pixels</param>
    public void Orbit(double azimuth, double polar)
    {
        AzimuthAngle += azimuth * _options.OrbitSensitivity;
        PolarAngle += polar * _options.OrbitSensitivity;
    }

    /// <summary>
    /// Updates zoom level based on wheel delta.
    /// </summary>
    /// <param name="wheelDelta">Mouse wheel delta (typically in 100s)</param>
    public void Zoom(double wheelDelta)
    {
        // Use exponential zoom for more natural feel
        var zoomFactor = 1.0 + (wheelDelta * _options.ZoomSensitivity);
        Distance *= zoomFactor;
    }

    /// <summary>
    /// Pans the camera target in screen space.
    /// </summary>
    /// <param name="deltaX">Horizontal movement in pixels</param>
    /// <param name="deltaY">Vertical movement in pixels</param>
    /// <param name="shiftPressed">Whether Shift key is pressed for faster movement</param>
    public void PanWithMouse(double deltaX, double deltaY, bool shiftPressed = false)
    {
        // Calculate pan speed based on distance (closer = slower pan)
        var panSpeed = _options.PanSensitivity * Distance * (shiftPressed ? _options.PanSpeedMultiplier : 1.0);
        var camMatrix = CameraMatrix;
        var right = new Vector3(camMatrix.M11, camMatrix.M12, camMatrix.M13);
        var up = new Vector3(camMatrix.M21, camMatrix.M22, camMatrix.M23);

        // Pan in camera space
        Target += right * (float)(-deltaX * panSpeed);
        Target += up * (float)(deltaY * panSpeed);
        updateCamera = true;
    }

    /// <summary>
    /// Pans the camera using WASD-style directional input.
    /// </summary>
    /// <param name="forward">Forward/backward movement (-1 to 1, S/W keys)</param>
    /// <param name="right">Right/left movement (-1 to 1, A/D keys)</param>
    /// <param name="up">Up/down movement (-1 to 1, typically Q/E keys)</param>
    /// <param name="shiftPressed">Whether Shift key is pressed for faster movement</param>
    public void PanWithKeyboard(double forward, double right, double up, bool shiftPressed = false)
    {
        var panSpeed = _options.PanSensitivity * Distance * (shiftPressed ? _options.PanSpeedMultiplier : 1.0);
        var camMatrix = CameraMatrix;
        var rightVec = new Vector3(camMatrix.M11, camMatrix.M12, camMatrix.M13);
        var upVec = new Vector3(camMatrix.M21, camMatrix.M22, camMatrix.M23);
        var forwardVec = new Vector3(camMatrix.M31, camMatrix.M32, camMatrix.M33);

        // Move target in camera space
        Target += rightVec * (float)(right * panSpeed * 5.0); // Scale up for keyboard input
        Target += upVec * (float)(up * panSpeed * 5.0);
        Target += forwardVec * (float)(-forward * panSpeed * 5.0); // Negative for intuitive forward direction
        updateCamera = true;
    }
    #endregion

    #region Matrix Work
    private bool updateCamera = true;
    /// <summary>
    /// Gets the view matrix for rendering.
    /// </summary>
    public Matrix4x4 ViewMatrix
    {
        get
        {
            if (updateCamera) UpdateMatrices();
            return viewMatrix;
        }
    }
    private Matrix4x4 viewMatrix;

    /// <summary>
    /// Gets the Camera matrix for rendering.
    /// </summary>
    public Matrix4x4 CameraMatrix
    {
        get
        {
            if (updateCamera) UpdateMatrices();
            return cameraMatrix;
        }
    }
    private Matrix4x4 cameraMatrix;

    /// <summary>
    /// Gets the camera position in world space.
    /// </summary>
    public Vector3 Position
    {
        get
        {
            if (updateCamera) UpdateMatrices();
            return position;
        }
    }
    private Vector3 position;

    /// <summary>
    /// Returns the view matrix as a float array for JavaScript interop.
    /// </summary>
    public float[] ConvertMatrixToJavaScript()
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
        cameraMatrix
            = Matrix4x4.CreateTranslation(0, 0, (float)Distance)
            * Matrix4x4.CreateRotationX(-(float)PolarAngle)
            * Matrix4x4.CreateRotationY(-(float)AzimuthAngle)
            * Matrix4x4.CreateTranslation(Target);
        // View matrix is inverse of camera matrix
        Matrix4x4.Invert(cameraMatrix, out viewMatrix);
        position = new Vector3(cameraMatrix.M41, cameraMatrix.M42, cameraMatrix.M43);
        updateCamera = false;
    }

    /// <summary>
    /// Resets the camera to default position.
    /// </summary>
    public void Reset()
    {
        PolarAngle = 0;
        AzimuthAngle = 0;
        Distance = 10.0;
        Target = Vector3.Zero;
    }
    #endregion

    #region Selection Ray
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
        // Convert screen coordinates to normalized device coordinates (NDC)
        // NDC: X: -1 (left) to +1 (right), Y: -1 (bottom) to +1 (top)
        double ndcX = (2.0 * screenX / screenWidth) - 1.0;
        double ndcY = 1.0 - (2.0 * screenY / screenHeight); // Flip Y axis (screen top = 0, NDC top = +1)

        // Create NDC point at near and far planes
        Vector4 nearPointNDC = new Vector4((float)ndcX, (float)ndcY, -1.0f, 1.0f); // Near plane (Z = -1 in NDC)
        Vector4 farPointNDC = new Vector4((float)ndcX, (float)ndcY, 1.0f, 1.0f);  // Far plane (Z = +1 in NDC)

        // Get the view-projection matrix
        Matrix4x4 projectionMatrix = CreateProjectionMatrix(screenWidth, screenHeight);
        Matrix4x4 viewProjectionMatrix = Matrix4x4.Multiply(ViewMatrix, projectionMatrix);

        // Calculate inverse view-projection matrix
        if (!Matrix4x4.Invert(viewProjectionMatrix, out Matrix4x4 inverseViewProjection))
            // Fallback: use just inverse view matrix if projection inversion fails
            inverseViewProjection = CameraMatrix;

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

        if (_options.ProjectionType == ProjectionType.Orthographic)
        {
            return Matrix4x4.CreateOrthographic((float)_options.OrthoSize * 2 * aspectRatio, (float)_options.OrthoSize * 2, (float)_options.ZNear, (float)_options.ZFar);
        }
        else
        {
            return Matrix4x4.CreatePerspectiveFieldOfView((float)_options.Fov, aspectRatio, (float)_options.ZNear, (float)_options.ZFar);
        }
    }
    #endregion
}
