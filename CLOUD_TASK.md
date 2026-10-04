# Cloud implementation brief

## Objective

Build a working React + TypeScript + Vite floorplan editor from the reference application in `legacy/index.html`. The user wants easier room dimension editing while keeping all original furniture models. Use SVG for 2D and React Three Fiber for 3D. Use compatible dependency versions, with Three.js r160 initially for visual preservation.

Read `MIGRATION.md` for the source analysis and geometry design. It is architectural guidance: choose the simplest implementation that correctly preserves the original apartment and supports consistent room resizing. Do not reduce the original apartment to one rectangular room.

## Required behavior

1. Keep `legacy/index.html` as an unmodified reference and retain the original MIT license.
2. Extract and reuse the complete original furniture factory and its geometry/material helpers, library, default furniture, floor materials and apartment data. Do not replace the furniture models with generic boxes. Preserve all library types and their appearance.
3. Render the original apartment in an interactive 2D editor and a 3D viewport, both driven by the same project state. Preserve original placements, rotations, dimensions, openings and floor materials.
4. Provide clearly labeled room selection, editable dimensions in mm, room names and flooring, and updated area calculations. For rectangular rooms let the user choose the edge to hold fixed. For nonrectangular rooms provide edge editing rather than misleading width/depth fields.
5. Update shared walls, affected adjacent rooms, doors, windows, collision geometry and labels consistently. Preview changes and reject invalid polygons, room overlaps or openings that no longer fit. Do not scale the entire scene to simulate room resizing.
6. Keep furniture dimensions when rooms change. Keep furniture position by default, support explicit movement with an attached wall when appropriate, and identify furniture that no longer fits. Never silently delete or shrink it.
7. Support selecting, moving, rotating, sizing, adding and deleting furniture, undo/redo and autosave. A completed drag or resize creates one history entry.
8. Import original v1 exported JSON by supplying the original apartment geometry. Preserve furniture and room metadata. Export versioned JSON containing editable geometry and support lossless re-import. Validate imported files before replacing the active project. Keep the old localStorage key intact.
9. Make procedural model seeds stable: migrate the old seed Math.round(w*7 + d*13 + cx + cy) once so decorative details do not change when furniture moves. Avoid rebuilding all furniture meshes for a single furniture transform.
10. Preserve original lighting/material rendering as closely as possible. Dispose manually created geometry and manage shared material lifetimes correctly.
11. Use Vietnamese labels for the main editor. Keep original source names in the extracted data if useful, with translated labels in the UI. Do not relabel original yuan material prices as Vietnamese dong without actual replacement pricing.
12. Preserve the original functions where practical: wall demolition restrictions, measurements, floor costs, camera views, walkthrough and door interaction, daylight/night controls, PNG export, and touch interactions. If a feature cannot be completed, state the precise remaining limitation and keep the legacy reference accessible.

## Delivery

Work autonomously using sensible UI decisions; the user will be offline. Document implementation choices and limitations. Keep changes in this repository and deliver a pull request rather than deploying to an external service.

Add installation and development instructions to README.md, a lockfile, and appropriate build/typecheck/test commands. Verify room-resize transactions, shared walls, opening limits, furniture preservation, undo/redo and JSON migration with meaningful tests. Run the production build and available checks. If a browser is available, verify actual 2D/3D rendering and resize interactions, including mobile layout. Report unavailable verification honestly.

In the pull request, summarize implemented behavior, checks that actually ran, model preservation evidence and any remaining limitations. The work is complete only when the application runs and the room dimension changes remain consistent across 2D, 3D and exported data.
