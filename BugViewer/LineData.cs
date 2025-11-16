using System.Drawing;
using System.Numerics;

namespace BugViewer;

/// <summary>
/// Represents 3D lines with variable thickness and color for WebGPU rendering.
/// </summary>
public record LineData : CStoWebGPUDataObject
{
    /// <summary>Vertex positions (x, y, z triplets).</summary>
    public required IEnumerable<Vector3> Vertices { get; init; }

    public required IEnumerable<double> Thicknesses { get; init; }

    /// <summary>
    /// A number from 0.0 to 1.0 representing the fade factor for each path.
    /// When 0.0, the path is fully opaque and no gradient is applied. Values between 0 and 1.0,
    /// mean that the the path fades from the centerline to transparency at this fraction of the 
    /// half-thickness.
    /// </summary>
    public required IEnumerable<double> FadeFactors { get; init; }

    /// <summary>
    /// Creates a wire tetrahedron for testing.
    /// </summary>
    public static LineData CreateWireTet(string id, float minX, float minY, float minZ, float maxX, float maxY, float maxZ)
    {
        var vertices = new Vector3[]
        {
            new Vector3(minX, minY, minZ),  // 0
            new Vector3(maxX, minY, minZ),  // 1
            new Vector3(0.5f*(minX+maxX), maxY, minZ),  // 2
            new Vector3(minX, minY, minZ),  // 0
            new Vector3(0.5f*(minX+maxX), 0.5f*(minY+maxY), 0.5f*(minZ+maxZ)),  // 3
            new Vector3(maxX, minY, minZ),  // 1
        };
        
        var thicks = new double[] { 0.5, 0.31, 0.25, 0.39, 0.65 };

        var colors = new Color[]
        {
            Color.FromArgb(255, 0, 0),    // Bright Red
            Color.FromArgb(0, 255, 0),    // Bright Green
            Color.FromArgb(0, 0, 255),    // Bright Blue
            Color.FromArgb(255, 255, 0),  // Bright Yellow
            Color.FromArgb(255, 0, 255),  // Bright Magenta
        };

        return new LineData
        {
            Id = id,
            Vertices = vertices,
            Thicknesses = thicks,
            Colors = colors,
            FadeFactors = [0.2, 0.4, 1.0, 0.67, 0.7],
        };
    }
    
    internal override object CreateJavascriptData()
    {
        // Generate stadium geometry in C# instead of JavaScript
        var (positions, colors, thickness, uvs, endPositions, fades, indices) = 
            LineGeometryGenerator.GenerateStadiumGeometry(
                Vertices, 
                Thicknesses, 
                Colors.Cast<Color>(), 
                FadeFactors);

        return new
        {
            id = Id,
            vertices = positions,
            colors = colors,
            thickness = thickness,
            uvs = uvs,
            endPositions = endPositions,
            fades = fades,
            indices = indices
        };
    }
}
