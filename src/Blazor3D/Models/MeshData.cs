using System.Drawing;
using System.Numerics;

namespace Blazor3D.Models;

/// <summary>
/// Represents a 3D mesh with vertices and indices for WebGPU rendering.
/// </summary>
public record MeshData
{
    /// <summary>Unique identifier for this mesh instance.</summary>
    public required string Id { get; init; }

    /// <summary>Vertex positions (x, y, z triplets).</summary>
    public required IEnumerable<Vector3> Vertices { get; init; }

    /// <summary>Triangle indices (3 indices per triangle).</summary>
    public required IEnumerable<(int a, int b, int c)> Indices { get; init; }

    /// <summary>
    /// Per-triangle colors (RGBA, 0-1 range).
    /// Array length should equal Indices.Length / 3 (one color per triangle).
    /// </summary>
    public IEnumerable<Color> Colors { get; init; }
    public MeshColoring ColorMode { get; init; }
    /// <summary>
    /// Creates a cube mesh with solid colors per triangle (engineering/CAD style).
    /// Each of the 12 triangles gets its own unique color for maximum visualization control.
    /// </summary>
    public static MeshData CreateCube(string id, float minX, float minY, float minZ, float maxX, float maxY, float maxZ)
    {
        // 24 vertices (4 per face × 6 faces) for independent per-face geometry
        var vertices = new Vector3[]
        {
            // Bottom faces (4 vertices)
            new Vector3(minX, minY, minZ),  // 0
            new Vector3(maxX, minY, minZ),  // 1
            new Vector3(minX, maxY, minZ),  // 2
            new Vector3(maxX, maxY, minZ),  // 3
            
            // Top face (4 vertices)
            new Vector3(minX, minY, maxZ),  // 4
            new Vector3(maxX, minY, maxZ),  // 5
            new Vector3(minX, maxY, maxZ),  // 6
            new Vector3(maxX, maxY, maxZ),  // 7
        };

        // 12 triangles (2 per face × 6 faces) = 36 indices
        var indices = new (int a, int b, int c)[]
        {
            // Bottom faces (minz faces)
           ( 0, 3,1),  (0,2,3),
            
            // Top face (maxZ faces)
            (4, 5, 6),  (6,5, 7),
            
            // front faces (miny)
            (0,1,4),  (4,1,5),
            
            // back faces (maxy)
            (2,6,3),  (3,6,7),
            
            // Left face (minx)
            (0,4,2),  (2,4,6),
            
            // Right face (maxx)
            (1,3,5),  (5,3,7)
        };

        // 12 colors (one per triangle) - matches indices.Length / 3
        // Each triangle gets its own solid color for engineering visualization
        var colors = new Color[]
        {
            // Front face triangles (2 triangles)
            Color.FromArgb(255, 0, 0),    // Triangle 0 - Bright Red
            Color.FromArgb(200, 0, 0),    // Triangle 1 - Dark Red
            
            // Back face triangles (2 triangles)
            Color.FromArgb(0, 255, 0),    // Triangle 2 - Bright Green
            Color.FromArgb(0, 200, 0),    // Triangle 3 - Dark Green
            
            // Bottom face triangles (2 triangles)
            Color.FromArgb(0, 0, 255),    // Triangle 4 - Bright Blue
            Color.FromArgb(0, 0, 200),    // Triangle 5 - Dark Blue
            
            // Top face triangles (2 triangles)
            Color.FromArgb(255, 255, 0),    // Triangle 6 - Bright Yellow
            Color.FromArgb(200, 200, 0),    // Triangle 7 - Dark Yellow
            
            // Left face triangles (2 triangles)
            Color.FromArgb(0, 255, 255),    // Triangle 8 - Bright Cyan
            Color.FromArgb(0, 200, 200),    // Triangle 9 - Dark Cyan
            
            // Right face triangles (2 triangles)
            Color.FromArgb(255, 0, 255),    // Triangle 10 - Bright Magenta
            Color.FromArgb(200, 0, 200),    // Triangle 11 - Dark Magenta
        };

        return new MeshData
        {
            Id = id,
            Vertices = vertices,
            Indices = indices,
            Colors = colors,
            ColorMode = MeshColoring.PerVertex
        };
    }
    private IEnumerable<int> TriangleIndices((int, int, int) faceIndices)
    {
        yield return faceIndices.Item1;
        yield return faceIndices.Item2;
        yield return faceIndices.Item3;
    }

    private IEnumerable<float> Coordinates(Vector3 v)
    { yield return v.X; yield return v.Y; yield return v.Z; }

    private IEnumerable<float> ColorParts(Color c)
    {
        yield return c.R / 255f;
        yield return c.G / 255f;
        yield return c.B / 255f;
        yield return c.A / 255f;
    }

    internal object CreateJavascriptData()
    {
        if (ColorMode == MeshColoring.PerTriangle)
        {
            int expectedColors = Indices.Count();
            if (Colors.Count() != expectedColors)
            {
                throw new InvalidOperationException($"Color count {Colors.Count()} does not match expected per-triangle color count {expectedColors}.");
            }
            var vertexList = Vertices as IList<Vector3> ?? Vertices.ToList();
            return new
            {
                id = Id,
                vertices = Indices.SelectMany(face => TriangleIndices(face)).SelectMany(ind => Coordinates(vertexList[ind])).ToArray(),
                indices = Enumerable.Range(0, Indices.Count()).ToArray(),
                colors = Colors.SelectMany(c => ColorParts(c)).ToArray(),
                singleColor = false
            };
        }
        else
        {
            return new
            {
                id = Id,
                vertices = Vertices.SelectMany(v => Coordinates(v)).ToArray(),
                indices = Indices.SelectMany(face => TriangleIndices(face)).ToArray(),
                //colors = new float[] { 1f, 0f, 0f, 1f },
                colors = Colors.SelectMany(c => ColorParts(c)).ToArray(),
                singleColor = ColorMode == MeshColoring.UniformColor
            };
        }
    }
    public enum MeshColoring
    {
        UniformColor,
        PerVertex,
        PerTriangle
    }
}
