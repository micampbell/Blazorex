# BugViewer
[![Nuget](https://img.shields.io/nuget/v/BugViewer?style=plastic)](https://www.nuget.org/packages/BugViewer/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/micampbell/BugViewer)

![BugViewer](https://raw.githubusercontent.com/micampbell/BugViewer/refs/heads/master/BugViewer-logo.png)

## Description
BugViewer is a Blazor component that renders a 3D file with the new WebGPU. It includes controls to view a single part (as opposed to being a game engine). The goal is to provide a clear method to view 3D parts with minimal Javascript.

The main things that are visualized are:
- triangles/meshes
- polylines
- text billboards

## Installation
BugViewer can be installed as Nuget package: https://www.nuget.org/packages/BugViewer/

## Usage

### Simple scenario

Just add the `BugViewer` Component to your Razor page.:

```csharp
<Canvas Width="800" Height="600" 
        OnFrameReady="(t) => OnFrameReady(t)"
        OnCanvasReady="(ctx) => OnCanvasReady(ctx)" />

@code{
    CanvasBase _canvas;

    private void OnCanvasReady(CanvasBase canvas)
    {
        _canvas = canvas;
    }

    private void OnFrameReady(float timeStamp)
    {
        // your render logic goes here
    }
}

```

For a complete list of options for Canvas initialization, see [here](https://github.com/micampbell/BugViewer/).

For the complete documentation, check the [official website](https://deepwiki.com/micampbell/BugViewer)

The [./samples](./samples) folder contains some examples of how to setup the canvas and draw some cool stuff :)
