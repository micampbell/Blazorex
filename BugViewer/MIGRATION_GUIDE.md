# Migration Guide: Completing the WebGPU Canvas Refactoring

## Current Status

? All refactoring code is complete and builds successfully!

The repository now contains:
- **Original:** `wwwroot/js/webgpu-canvas.js` (old version, ~1,400 lines)
- **Refactored:** `wwwroot/js/webgpu-canvas-refactored.js` (new version, ~800 lines)
- **Updated:** `BugViewer.razor` (already uses new API)
- **New:** `LineGeometryGenerator.cs`
- **New:** `TextBillboardRenderer.cs`

## Steps to Complete Migration

### Step 1: Backup Original File

```bash
# From repository root
mv BugViewer/wwwroot/js/webgpu-canvas.js BugViewer/wwwroot/js/webgpu-canvas.OLD.js
```

### Step 2: Activate Refactored Version

```bash
mv BugViewer/wwwroot/js/webgpu-canvas-refactored.js BugViewer/wwwroot/js/webgpu-canvas.js
```

### Step 3: Test in Browser

1. Build the project:
   ```bash
   dotnet build
   ```

2. Run a sample application (e.g., TVGLPresenter or SimpleStandalone)
   
3. Test the following functionality:
   - ? Grid rendering
   - ? Camera controls (rotate, pan, zoom)
   - ? Mesh rendering (AddMeshAsync)
   - ? Line rendering with rounded caps (AddLinesAsync)
   - ? Text billboards (AddTextBillboardAsync)
   - ? Double-click picking
   - ? Options panel updates

### Step 4: Verify Line Geometry

The most significant change is line geometry generation. Test with various scenarios:

```csharp
// Test simple line
var line1 = new LineData {
    Id = "test-line-1",
    Vertices = [new Vector3(0, 0, 0), new Vector3(5, 0, 0)],
    Thicknesses = [0.5],
    Colors = [Color.Red],
    FadeFactors = [0.0]
};
await bugViewer.AddLinesAsync(line1);

// Test multi-segment line with fade
var line2 = new LineData {
    Id = "test-line-2",
    Vertices = [
        new Vector3(0, 0, 0),
        new Vector3(3, 3, 0),
        new Vector3(6, 0, 0)
    ],
    Thicknesses = [0.3, 0.5],
    Colors = [Color.Blue, Color.Green],
    FadeFactors = [0.5, 0.8]
};
await bugViewer.AddLinesAsync(line2);

// Test existing CreateWireTet helper
var wireTet = LineData.CreateWireTet("tet", -2, -2, -2, 2, 2, 2);
await bugViewer.AddLinesAsync(wireTet);
```

### Step 5: Check Browser Console

Look for any JavaScript errors or warnings:
- Shader compilation errors
- Buffer creation failures
- Pipeline creation issues

### Step 6: Performance Validation

Compare frame times before and after:

```csharp
// Monitor frame time via the component
Console.WriteLine($"Frame time: {bugViewer.LatestFrameMs:F2}ms");
```

Expected results:
- Similar or better frame times
- Smoother line rendering (due to batch processing)
- Lower JS execution time in profiler

## Rollback Plan

If issues arise, quickly rollback:

```bash
# Restore original
mv BugViewer/wwwroot/js/webgpu-canvas.OLD.js BugViewer/wwwroot/js/webgpu-canvas.js

# Keep refactored version for later
mv BugViewer/wwwroot/js/webgpu-canvas.js BugViewer/wwwroot/js/webgpu-canvas-refactored.js
```

Then revert `BugViewer.razor` changes:
- Change `writeViewMatrix` ? `updateViewMatrix`
- Revert `AddTextBillboardAsync` to old implementation

## Known Limitations

### 1. Text Billboard Rendering
Still uses JavaScript canvas API since `System.Drawing.Common` is not available in Blazor WebAssembly.

**Future improvement:** Use SkiaSharp or ImageSharp for cross-platform text rendering.

### 2. Projection Matrix
Still calculated in JavaScript using gl-matrix library.

**Future improvement:** Use System.Numerics.Matrix4x4 in C# and pass completed matrix.

## Troubleshooting

### Issue: Lines don't render
**Check:** 
- Are indices being generated correctly?
- Is the stadium geometry valid?
- Add console logging to `LineGeometryGenerator`

### Issue: Lines appear as solid blocks
**Check:**
- UV coordinates must be correct
- End positions must match next vertex
- Shader billboard logic needs `uv` and `endPos`

### Issue: Performance regression
**Check:**
- Are geometry arrays being recomputed unnecessarily?
- Is LineData being created in a loop?
- Consider caching LineData objects

### Issue: Text billboards not visible
**Check:**
- Canvas rendering still works in JavaScript
- Texture upload succeeds
- Billboard pipeline created successfully

## Testing Checklist

- [ ] Grid renders correctly
- [ ] Camera rotation works (left mouse drag)
- [ ] Camera pan works (right mouse drag)
- [ ] Camera zoom works (scroll wheel)
- [ ] Keyboard controls work (WASD, Q/E)
- [ ] Double-click picking creates billboard
- [ ] Meshes render (uniform color mode)
- [ ] Meshes render (per-vertex color mode)
- [ ] Lines render with rounded caps
- [ ] Lines render with varying thickness
- [ ] Lines render with fade effect
- [ ] Text billboards appear at correct positions
- [ ] Text billboards face camera
- [ ] Options panel updates apply immediately
- [ ] Multiple objects can coexist
- [ ] Frame time is acceptable (<16ms for 60fps)

## Success Criteria

Migration is successful when:
1. ? All tests pass
2. ? No console errors
3. ? Visual output matches original
4. ? Frame time ? original implementation
5. ? Code is more maintainable (subjective but important)

## Next Steps After Migration

1. **Add Unit Tests**
   ```csharp
   [TestClass]
   public class LineGeometryGeneratorTests
   {
       [TestMethod]
       public void GenerateStadiumGeometry_ValidInput_ReturnsNonEmpty()
       {
           // Arrange
           var vertices = new[] { Vector3.Zero, Vector3.UnitX };
           var thickness = new[] { 1.0 };
           var colors = new[] { Color.Red };
           var fades = new[] { 0.0 };
           
           // Act
           var result = LineGeometryGenerator.GenerateStadiumGeometry(
               vertices, thickness, colors, fades);
           
           // Assert
           Assert.IsTrue(result.positions.Length > 0);
           Assert.IsTrue(result.indices.Length > 0);
       }
   }
   ```

2. **Performance Benchmarks**
   ```csharp
   [Benchmark]
   public void BenchmarkLineGeometry()
   {
       var vertices = Enumerable.Range(0, 100)
           .Select(i => new Vector3(i, 0, 0))
           .ToArray();
       
       var result = LineGeometryGenerator.GenerateStadiumGeometry(
           vertices,
           Enumerable.Repeat(1.0, 99),
           Enumerable.Repeat(Color.White, 99),
           Enumerable.Repeat(0.0, 99));
   }
   ```

3. **Documentation Updates**
   - Update README with new architecture
   - Add XML comments to public APIs
   - Create developer guide for geometry generators

4. **Consider Additional Refactorings**
   - Move mesh color processing to C#
   - Implement view frustum culling in C#
   - Add spatial indexing for picking

## Questions?

If you encounter issues during migration:
1. Check `REFACTORING_COMPLETE.md` for architectural details
2. Compare with backup (`.OLD.js`) file
3. Review browser console for specific errors
4. Check that geometry arrays have correct sizes

## Conclusion

This refactoring represents a significant improvement in code quality and maintainability. The JavaScript layer is now minimal and focused, while all business logic lives in C# where it benefits from strong typing and better tooling.

Good luck with the migration! ??
