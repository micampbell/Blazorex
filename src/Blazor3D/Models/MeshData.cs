namespace Blazor3D.Models;

/// <summary>
/// Represents a 3D mesh with vertices and indices for WebGPU rendering.
/// </summary>
public record MeshData
{
    /// <summary>Unique identifier for this mesh instance.</summary>
    public required string Id { get; init; }
    
    /// <summary>Vertex positions (x, y, z triplets).</summary>
    public required float[] Vertices { get; init; }
    
    /// <summary>Triangle indices (3 indices per triangle).</summary>
    public required ushort[] Indices { get; init; }
    
    /// <summary>
    /// Per-triangle colors (RGBA, 0-1 range).
    /// Array length should equal Indices.Length / 3 (one color per triangle).
    /// </summary>
    public ColorRgba[] Colors { get; init; } 
    
    /// <summary>
    /// Creates a cube mesh with solid colors per triangle (engineering/CAD style).
    /// Each of the 12 triangles gets its own unique color for maximum visualization control.
    /// </summary>
    public static MeshData CreateCube(string id, float minX, float minY, float minZ, float maxX, float maxY, float maxZ)
    {
        // 24 vertices (4 per face × 6 faces) for independent per-face geometry
        var vertices = new float[]
        {
            // Front face (4 vertices)
            minX, minY, maxZ,  // 0
            maxX, minY, maxZ,  // 1
            maxX, maxY, maxZ,  // 2
            minX, maxY, maxZ,  // 3
            
            // Back face (4 vertices)
            maxX, minY, minZ,  // 4
            minX, minY, minZ,  // 5
            minX, maxY, minZ,  // 6
            maxX, maxY, minZ,  // 7
            
            // Bottom face (4 vertices)
            minX, minY, minZ,  // 8
            maxX, minY, minZ,  // 9
            maxX, minY, maxZ,  // 10
            minX, minY, maxZ,  // 11
            
            // Top face (4 vertices)
            minX, maxY, maxZ,  // 12
            maxX, maxY, maxZ,  // 13
            maxX, maxY, minZ,  // 14
            minX, maxY, minZ,  // 15
            
            // Left face (4 vertices)
            minX, minY, minZ,  // 16
            minX, minY, maxZ,  // 17
            minX, maxY, maxZ,  // 18
            minX, maxY, minZ,  // 19
            
            // Right face (4 vertices)
            maxX, minY, maxZ,  // 20
            maxX, minY, minZ,  // 21
            maxX, maxY, minZ,  // 22
            maxX, maxY, maxZ   // 23
        };
        
        // 12 triangles (2 per face × 6 faces) = 36 indices
        var indices = new ushort[]
        {
            // Front face (triangles 0-1)
            0, 1, 2,  2, 3, 0,
            
            // Back face (triangles 2-3)
            4, 5, 6,  6, 7, 4,
            
            // Bottom face (triangles 4-5)
            8, 9, 10,  10, 11, 8,
            
            // Top face (triangles 6-7)
            12, 13, 14,  14, 15, 12,
            
            // Left face (triangles 8-9)
            16, 17, 18,  18, 19, 16,
            
            // Right face (triangles 10-11)
            20, 21, 22,  22, 23, 20
        };
        
        // 12 colors (one per triangle) - matches indices.Length / 3
        // Each triangle gets its own solid color for engineering visualization
        var colors = new ColorRgba[]
        {
            // Front face triangles (2 triangles)
            new ColorRgba(1.0, 0.0, 0.0, 1),    // Triangle 0 - Bright Red
            new ColorRgba(0.8, 0.0, 0.0, 1),    // Triangle 1 - Dark Red
            
            // Back face triangles (2 triangles)
            new ColorRgba(0.0, 1.0, 0.0, 1),    // Triangle 2 - Bright Green
            new ColorRgba(0.0, 0.8, 0.0, 1),    // Triangle 3 - Dark Green
            
            // Bottom face triangles (2 triangles)
            new ColorRgba(0.0, 0.0, 1.0, 1),    // Triangle 4 - Bright Blue
            new ColorRgba(0.0, 0.0, 0.8, 1),    // Triangle 5 - Dark Blue
            
            // Top face triangles (2 triangles)
            new ColorRgba(1.0, 1.0, 0.0, 1),    // Triangle 6 - Bright Yellow
            new ColorRgba(0.8, 0.8, 0.0, 1),    // Triangle 7 - Dark Yellow
            
            // Left face triangles (2 triangles)
            new ColorRgba(0.0, 1.0, 1.0, 1),    // Triangle 8 - Bright Cyan
            new ColorRgba(0.0, 0.8, 0.8, 1),    // Triangle 9 - Dark Cyan
            
            // Right face triangles (2 triangles)
            new ColorRgba(1.0, 0.0, 1.0, 1),    // Triangle 10 - Bright Magenta
            new ColorRgba(0.8, 0.0, 0.8, 1),    // Triangle 11 - Dark Magenta
        };
        
        return new MeshData
        {
            Id = id,
            Vertices = vertices,
            Indices = indices,
            Colors = colors
        };
    }
}
