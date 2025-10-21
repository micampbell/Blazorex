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
    
    /// <summary>Optional color for the mesh (RGBA, 0-1 range).</summary>
    public ColorRgba Color { get; init; } = new ColorRgba(1, 0, 0, 1); // Default: red
    
    /// <summary>Creates a cube mesh with the specified bounds.</summary>
    public static MeshData CreateCube(string id, float minX, float minY, float minZ, float maxX, float maxY, float maxZ, ColorRgba? color = null)
    {
        // 8 vertices for a cube
        var vertices = new float[]
        {
            // Front face
            minX, minY, maxZ,  // 0: bottom-left-front
            maxX, minY, maxZ,  // 1: bottom-right-front
            maxX, maxY, maxZ,  // 2: top-right-front
            minX, maxY, maxZ,  // 3: top-left-front
            
            // Back face
            minX, minY, minZ,  // 4: bottom-left-back
            maxX, minY, minZ,  // 5: bottom-right-back
            maxX, maxY, minZ,  // 6: top-right-back
            minX, maxY, minZ   // 7: top-left-back
        };
        
        // 12 triangles (2 per face, 6 faces)
        var indices = new ushort[]
        {
            // Front face
            0, 1, 2,  2, 3, 0,
            
            // Back face
            5, 4, 7,  7, 6, 5,
            
            // Bottom face
            4, 5, 1,  1, 0, 4,
            
            // Top face
            3, 2, 6,  6, 7, 3,
            
            // Left face
            4, 0, 3,  3, 7, 4,
            
            // Right face
            1, 5, 6,  6, 2, 1
        };
        
        return new MeshData
        {
            Id = id,
            Vertices = vertices,
            Indices = indices,
            Color = color ?? new ColorRgba(1, 0, 0, 1)
        };
    }
}
