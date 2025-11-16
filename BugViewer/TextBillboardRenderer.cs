using System.Drawing;
using System.Numerics;

namespace BugViewer;

/// <summary>
/// Prepares text billboard data for rendering.
/// Text rendering is delegated to JavaScript canvas API since System.Drawing is not available in Blazor WebAssembly.
/// </summary>
public static class TextBillboardRenderer
{
    /// <summary>
    /// Creates a JavaScript-ready billboard data object.
    /// JavaScript will handle actual text rendering using canvas API.
    /// </summary>
    public static object CreateBillboardData(
        string id,
        string text,
        Vector3 position,
        Color backgroundColor,
        Color textColor)
    {
        return new
        {
            id,
            text,
            position = new[] { position.X, position.Y, position.Z },
            backgroundColor = new[] { 
                backgroundColor.R / 255f, 
                backgroundColor.G / 255f, 
                backgroundColor.B / 255f, 
                backgroundColor.A / 255f 
            },
            textColor = new[] { 
                textColor.R / 255f, 
                textColor.G / 255f, 
                textColor.B / 255f, 
                textColor.A / 255f 
            }
        };
    }
}
