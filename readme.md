# Blazorex
[![Nuget](https://img.shields.io/nuget/v/Vizor?style=plastic)](https://www.nuget.org/packages/Blazorex/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/mizrael/Vizor)

![Blazorex](https://raw.githubusercontent.com/micampbell/Vizor/refs/heads/master/blazorex-logo.png)

## Description
Vizor is a Blazor component that renders a 3D file with the new WebGPU. It includes controls to view a single part (as opposed to being a game engine). The goal is to provide a clear method to view 3D parts with minimal Javascript.

The main things that are visualized are:
- triangles/meshes
- polylines
- text billboards

## Installation
Vizor can be installed as Nuget package: https://www.nuget.org/packages/Vizor/

## Usage

### Simple scenario

Just add the `Vizor` Component to your Razor page.:

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

For a complete list of options for Canvas initialization, see [here](https://github.com/micampbell/Vizor/).

For the complete documentation, check the [official website](https://deepwiki.com/micampbell/vizor)

The [./samples](./samples) folder contains some examples of how to setup the canvas and draw some cool stuff :)
