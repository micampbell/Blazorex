using System.Numerics;

namespace BugViewer;

/// <summary>
/// Generates billboard stadium geometry for line rendering in C#.
/// This moves the complex geometry generation logic from JavaScript to C#.
/// </summary>
public static class LineGeometryGenerator
{
    private const float HalfRadius = 0.5f;
    private const float AngleStep = MathF.PI / 6f; // 30 degrees

    /// <summary>
    /// Generates billboard stadium geometry for line segments with rounded end caps.
    /// Returns arrays ready for GPU buffer creation.
    /// </summary>
    public static (
        float[] positions,
        float[] colors,
        float[] thickness,
        float[] uvs,
        float[] endPositions,
        float[] fades,
        ushort[] indices
    ) GenerateStadiumGeometry(
        IEnumerable<Vector3> vertices,
        IEnumerable<double> thicknesses,
        IEnumerable<System.Drawing.Color> colors,
        IEnumerable<double> fadeFactors)
    {
        var vertexList = vertices.ToList();
        var thicknessList = thicknesses.ToList();
        var colorList = colors.ToList();
        var fadeList = fadeFactors.ToList();

        var numVertices = vertexList.Count;
        var numSegments = numVertices - 1;

        if (numVertices < 2)
        {
            throw new InvalidOperationException("Need at least 2 vertices for line rendering");
        }

        var quadPositions = new List<float>();
        var quadColors = new List<float>();
        var quadThickness = new List<float>();
        var quadUVs = new List<float>();
        var quadEndPositions = new List<float>();
        var quadFades = new List<float>();
        var indices = new List<ushort>();

        for (int i = 0; i < numSegments; i++)
        {
            var t = (float)thicknessList[i];
            var fade = fadeList.Count > i ? Math.Clamp((float)fadeList[i], 0f, 1f) : 0f;

            if (t <= 0) continue; // Skip zero-thickness segments

            var v0 = vertexList[i];
            var v1 = vertexList[i + 1];

            var color = colorList.Count > i
                ? new float[] { 
                    colorList[i].R / 255f, 
                    colorList[i].G / 255f, 
                    colorList[i].B / 255f, 
                    colorList[i].A / 255f 
                }
                : new float[] { 1f, 1f, 1f, 1f };

            var baseIdxBody = quadPositions.Count / 3;

            // Body quad (4 vertices, 2 triangles)
            AddVertex(quadPositions, quadColors, quadThickness, quadUVs, quadEndPositions, quadFades,
                v0, color, t, 0f, -0.5f, v1, fade); // start-left
            AddVertex(quadPositions, quadColors, quadThickness, quadUVs, quadEndPositions, quadFades,
                v0, color, t, 0f, 0.5f, v1, fade); // start-right
            AddVertex(quadPositions, quadColors, quadThickness, quadUVs, quadEndPositions, quadFades,
                v0, color, t, 1f, -0.5f, v1, fade); // end-left
            AddVertex(quadPositions, quadColors, quadThickness, quadUVs, quadEndPositions, quadFades,
                v0, color, t, 1f, 0.5f, v1, fade); // end-right

            // Body indices
            indices.AddRange(new ushort[] { 
                (ushort)baseIdxBody, 
                (ushort)(baseIdxBody + 1), 
                (ushort)(baseIdxBody + 2), 
                (ushort)(baseIdxBody + 1), 
                (ushort)(baseIdxBody + 3), 
                (ushort)(baseIdxBody + 2) 
            });

            // Start cap (semicircle behind start point)
            var startCenterIdx = quadPositions.Count / 3;
            AddVertex(quadPositions, quadColors, quadThickness, quadUVs, quadEndPositions, quadFades,
                v0, color, t, 0f, 0f, v1, fade); // center

            var startAngles = GenerateAngles(MathF.PI / 2f, 3f * MathF.PI / 2f);
            var startPerimBase = quadPositions.Count / 3;

            foreach (var angle in startAngles)
            {
                var u = MathF.Cos(angle) * HalfRadius; // negative or zero
                var v = MathF.Sin(angle) * HalfRadius; // -0.5..0.5
                AddVertex(quadPositions, quadColors, quadThickness, quadUVs, quadEndPositions, quadFades,
                    v0, color, t, u, v, v1, fade);
            }

            // Start cap fan indices
            for (int ai = 0; ai < startAngles.Count - 1; ai++)
            {
                indices.AddRange(new ushort[] {
                    (ushort)startCenterIdx,
                    (ushort)(startPerimBase + ai),
                    (ushort)(startPerimBase + ai + 1)
                });
            }

            // End cap (semicircle forward beyond end point)
            var endCenterIdx = quadPositions.Count / 3;
            AddVertex(quadPositions, quadColors, quadThickness, quadUVs, quadEndPositions, quadFades,
                v0, color, t, 1f, 0f, v1, fade); // center at segment end

            var endAngles = GenerateAngles(-MathF.PI / 2f, MathF.PI / 2f);
            var endPerimBase = quadPositions.Count / 3;

            foreach (var angle in endAngles)
            {
                var u = 1f + MathF.Cos(angle) * HalfRadius; // 1..1.5
                var v = MathF.Sin(angle) * HalfRadius;     // -0.5..0.5
                AddVertex(quadPositions, quadColors, quadThickness, quadUVs, quadEndPositions, quadFades,
                    v0, color, t, u, v, v1, fade);
            }

            // End cap fan indices
            for (int ai = 0; ai < endAngles.Count - 1; ai++)
            {
                indices.AddRange(new ushort[] {
                    (ushort)endCenterIdx,
                    (ushort)(endPerimBase + ai),
                    (ushort)(endPerimBase + ai + 1)
                });
            }
        }

        return (
            quadPositions.ToArray(),
            quadColors.ToArray(),
            quadThickness.ToArray(),
            quadUVs.ToArray(),
            quadEndPositions.ToArray(),
            quadFades.ToArray(),
            indices.ToArray()
        );
    }

    private static void AddVertex(
        List<float> positions,
        List<float> colors,
        List<float> thickness,
        List<float> uvs,
        List<float> endPositions,
        List<float> fades,
        Vector3 startPos,
        float[] color,
        float thick,
        float u,
        float v,
        Vector3 endPos,
        float fade)
    {
        // Position (vec3)
        positions.Add(startPos.X);
        positions.Add(startPos.Y);
        positions.Add(startPos.Z);

        // Color (vec4)
        colors.AddRange(color);

        // Thickness (float)
        thickness.Add(thick);

        // UV (vec2)
        uvs.Add(u);
        uvs.Add(v);

        // End position (vec3)
        endPositions.Add(endPos.X);
        endPositions.Add(endPos.Y);
        endPositions.Add(endPos.Z);

        // Fade factor (float)
        fades.Add(fade);
    }

    private static List<float> GenerateAngles(float startAngle, float endAngle)
    {
        var angles = new List<float>();
        for (float a = startAngle; a <= endAngle + 1e-6f; a += AngleStep)
        {
            angles.Add(a);
        }
        return angles;
    }
}
