using System.Drawing;
using System.Numerics;

namespace Blazor3D.Models;

/// <summary>
/// Represents a 3D mesh with vertices and indices for WebGPU rendering.
/// </summary>
public record LineData : CStoWebGPUDataObject
{

    /// <summary>Vertex positions (x, y, z triplets).</summary>
    public required IEnumerable<Vector3> Vertices { get; init; }

    /// <summary>Triangle indices (3 indices per triangle).</summary>
    public required IEnumerable<double> Thicknesses { get; init; }

    /// <summary>
    /// Creates a cube mesh with solid colors per triangle (engineering/CAD style).
    /// Each of the 12 triangles gets its own unique color for maximum visualization control.
    /// </summary>
    public static LineData CreateWireTet(string id, float minX, float minY, float minZ, float maxX, float maxY, float maxZ)
    {
        var vertices = new Vector3[]
        {
            // Bottom faces (4 vertices)
            new Vector3(minX, minY, minZ),  // 0
            new Vector3(maxX, minY, minZ),  // 1
            new Vector3(0.5f*(minX+maxX), maxY, minZ),  // 2
            new Vector3(minX, minY, minZ),  // 0
            
            // Top 
            new Vector3(0.5f*(minX+maxX), 0.5f*(minY+maxY), 0.5f*(minZ+maxZ)),  // 3

            // back to start
            new Vector3(maxX, minY, minZ),  // 1
        };
        var thicks = new double[]
        {
            0.05, 0.1, 0.5, 0.1,0.5
        };

        // 12 colors (one per triangle) - matches indices.Length / 3
        // Each triangle gets its own solid color for engineering visualization
        var colors = new Color[]
        {
            // Front face triangles (2 triangles)
            Color.FromArgb(255, 0, 0),    // Triangle 0 - Bright Red
            Color.FromArgb(0, 255, 0),    // Triangle 2 - Bright Green
            Color.FromArgb(0, 0, 255),    // Triangle 4 - Bright Blue
            Color.FromArgb(255, 255, 0),    // Triangle 6 - Bright Yellow
            Color.FromArgb(255, 0, 255),    // Triangle 10 - Bright Magenta
        };

        return new LineData
        {
            Id = id,
            Vertices = vertices,
            Thicknesses = thicks,
            Colors = colors,
        };
    }
    internal override object CreateJavascriptData()
    {
        return new
        {
            id = Id,
            vertices = Vertices.SelectMany(v => Coordinates(v)).ToArray(),
            thickness = Thicknesses.Select(t => (float)t).ToArray(),
            colors = Colors.SelectMany(c => ColorParts(c)).ToArray(),
        };
    }
}
