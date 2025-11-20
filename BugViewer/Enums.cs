using System;
using System.Collections.Generic;
using System.Text;

namespace BugViewer
{
    /// <summary>
    /// Cardinal directions for camera positioning.
    /// </summary>
    public enum CardinalDirection
    {
        PositiveX,
        NegativeX,
        PositiveY,
        NegativeY,
        PositiveZ,
        NegativeZ
    }


    public enum MeshColoring
    {
        UniformColor,
        PerVertex,
        PerTriangle
    }
    public enum UpdateTypes
    {
        Never = 0,
        OnDataChange = 1,
        SphereChange = 2,
    }
}
