# Chuyển floorplan-3d sang React

Ngày khảo sát: 04/10/2026. Source: `../floorplan-3d/index.html`.

## Lựa chọn kiến trúc

Đề xuất React + TypeScript + Vite, SVG cho editor 2D, React Three Fiber cho viewport 3D, Zustand cho trạng thái và Zod để kiểm tra file nhập. Ứng dụng hiện tại chạy hoàn toàn trên trình duyệt; chưa có nhu cầu server trong yêu cầu hiện tại. Remix cũng dùng React, nên hai lựa chọn không loại trừ nhau. Chỉ thêm framework server khi cần tài khoản, lưu dự án hoặc chia sẻ qua URL. Geometry engine và model factory không phụ thuộc framework, có thể tái sử dụng khi chuyển sang Remix.

## Những gì đã xác nhận trong source

| Phần | Vị trí trong index.html | Nhận xét |
| --- | --- | --- |
| Three.js | 217–222 | r160, import qua CDN |
| Tường, cửa sổ, cửa | 395–443 | Các bộ tọa độ độc lập, cố định |
| Phòng | 445–459 | 13 polygon, gồm phòng chữ nhật và polygon lõm; 2 phần bệ cửa sổ không tính diện tích sử dụng |
| Vật liệu, thư viện | 460–504 | Thông số và màu nội thất có thể tách thành module dữ liệu |
| Phương án mặc định | 506–542 | Nội thất lưu tọa độ, kích thước, góc xoay và màu |
| State/lưu trữ | 545–578 | Geometry nằm ngoài state; state chỉ chứa furniture, rooms metadata, demolished, measures |
| Kích thước 2D | 795–814 | Chuỗi kích thước viết cố định, cần tính từ geometry |
| Panel phòng | 998–1021 | Chỉ sửa tên và vật liệu; chiều rộng/chiều sâu là thông tin hiển thị |
| Import/export | 1474–1480 | JSON cũ không chứa geometry; import kiểm tra tối thiểu furniture là array |
| Hệ tọa độ 3D | 1524–1525 | mm → m; tâm cố định (6000, 5300) |
| Môi trường và ánh sáng | 1540–1584 | Tone mapping, shadow, RoomEnvironment ảnh hưởng trực tiếp hình ảnh model |
| Model nội thất | 1633–2272 | Geometry dựng bằng code Three.js, không có GLB/GLTF trong repository |
| Kiến trúc 3D | 2290–2351 | Tường, cửa, sàn; có tọa độ riêng cho phần cửa sổ nhô ra |
| Đồng bộ scene | 2353–2384 | Thay đổi một nội thất có thể dựng lại toàn bộ nhóm furniture |

## Vì sao đổi framework chưa đủ

Nếu chỉ đổi `ROOMS.poly`, tường và cửa vẫn ở tọa độ cũ. Nếu scale toàn bộ scene thì độ dày tường, cửa và nội thất cũng bị scale. Cần thay mô hình dữ liệu và thao tác hình học trước khi bổ sung ô nhập kích thước.

Polygon lõm như hành lang hoặc phòng ăn không có một cặp rộng × sâu mô tả đầy đủ. Panel của chúng cần cho chọn cạnh và khoảng cách cần dịch chuyển; không dùng bounding box làm kích thước thực của toàn phòng.

## Dữ liệu dự kiến

```ts
type Point = { id: string; x: number; y: number }; // millimetres

type Wall = {
  id: string;
  startVertexId: string;
  endVertexId: string;
  thickness: number;
  height: number;
  kind: 'bearing' | 'external' | 'partition' | 'low';
};

type Room = {
  id: string;
  name: string;
  boundary: { wallId: string; reversed: boolean }[];
  materialId: string;
  counted: boolean;
};

type Opening = {
  id: string;
  wallId: string;
  offset: number; // từ đầu tường tới đầu lỗ mở
  width: number;
  height: number;
  sill: number;
  kind: 'door' | 'window' | 'sliding';
  anchor: 'start' | 'end' | 'center';
};

type Furniture = {
  id: string;
  type: string; // giữ các type hiện có
  name: string;
  cx: number;
  cy: number;
  w: number;
  d: number;
  rot: number;
  color: string;
  modelSeed: number;
  placement?: { roomId: string; wallId?: string; gap?: number };
};

type Project = {
  schemaVersion: 2;
  units: 'mm';
  vertices: Point[];
  walls: Wall[];
  rooms: Room[];
  openings: Opening[];
  furniture: Furniture[];
  demolished: string[];
  measures: { a: [number, number]; b: [number, number] }[];
};
```

Schema trên là hướng thiết kế, chưa phải hợp đồng đã triển khai. Cần adapter cụ thể cho topology cũ: tường hiện tại là các hình chữ nhật bị chia đoạn tại lỗ mở, có các khối tường chịu lực và bệ cửa sổ đặc biệt. Không thể chuyển mọi rectangle thành centerline rồi suy ra ngay các phòng mà không kiểm tra và đối chiếu hình học. Giữ dữ liệu hình học gốc trong fixture để so sánh trước/sau, và biểu diễn các khối đặc biệt riêng nếu centerline không tái tạo đúng.

Một tường ngăn chung có một wallId, được hai phòng tham chiếu. Polygon thông thủy, mesh tường, collision, kích thước và diện tích đều được suy ra từ cùng dữ liệu. Tính phần giao tường và polygon offset có kiểm tra; không dịch tất cả điểm có cùng tọa độ trên toàn căn hộ.

## Hành vi khi sửa kích thước

1. Chọn phòng và cạnh cần thay đổi. Phòng chữ nhật có ô chiều rộng/chiều sâu, đơn vị mm, cùng lựa chọn cạnh giữ cố định.
2. Preview dịch cạnh theo phương vuông góc. Với tường chung, hiển thị phòng liền kề bị ảnh hưởng và diện tích trước/sau. Với cạnh ngoài, cập nhật biên căn hộ.
3. Cập nhật vertex và tường liên quan trong một transaction; kiểm tra polygon tự cắt, overlap phòng, đoạn tường âm hoặc quá ngắn.
4. Cửa và cửa sổ giữ chiều rộng, vị trí được tính lại theo anchor. Nếu không vừa tường mới thì báo lỗi trước khi áp dụng.
5. Mặc định giữ kích thước, góc xoay và vị trí tuyệt đối của nội thất. Nội thất đã gắn tường chỉ di chuyển theo tường khi đã chọn chế độ đó. Hiển thị món nằm ngoài phòng hoặc xuyên tường để người dùng xử lý.
6. Không giảm `w/d` nội thất để làm vừa phòng. Không tự xóa đồ. Không tự scale tường, cửa hoặc toàn bộ scene.
7. Undo khôi phục cả geometry, openings và placement. Preview không tạo một history entry trên mỗi pointermove; một thao tác hoàn tất tạo một entry.
8. Cập nhật ngay SVG 2D, scene 3D, diện tích, giá vật liệu, giới hạn camera và collision. Giá trong source là đơn giá ¥; chỉ đổi sang VND sau khi có đơn giá phù hợp.

Chính sách cho tường chịu lực cần phân biệt chỉnh bản vẽ để nhập kích thước thực tế với chức năng phá tường; source cũ chỉ khóa thao tác phá tường chịu lực. Không suy diễn rằng chỉnh bản vẽ là cho phép cải tạo kết cấu.

## Giữ model cũ

- Tách nguyên `buildFurniture()` cùng helper geometry/material thành model factory; không thay bằng các box đơn giản và không viết lại toàn bộ bằng JSX.
- R3F có thể gắn Three.Group cũ qua `<primitive object={model} />`. Tạo geometry theo type, w, d, color, modelSeed; vị trí và góc xoay do wrapper quản lý để kéo đồ không dựng lại mesh.
- Seed cũ là `Math.round(f.w*7 + f.d*13 + f.cx + f.cy)`. Lưu kết quả này khi chuyển phương án để cây, sách, hoa và chi tiết trang trí không đổi khi di chuyển model.
- Ban đầu giữ Three.js r160 và chọn phiên bản React/R3F tương thích. Nâng Three.js trong bước riêng sau khi đối chiếu hình ảnh.
- Giữ floor textures, RoomEnvironment, tone mapping, cường độ đèn và shadow gần cấu hình cũ. Giữ geometry chưa đảm bảo hình ảnh giống nếu pipeline ánh sáng đổi.
- `<primitive>` chứa object tự tạo cần cleanup geometry rõ ràng. Material cache dùng chung cần cơ chế sở hữu để tránh dispose material mà mesh khác đang dùng; giải phóng cache khi đóng viewport/project.
- Giữ LICENSE MIT và thông tin copyright gốc trong mã được tái sử dụng.

## Lưu trữ và tương thích

File v2 phải chứa toàn bộ geometry, không chỉ furniture và metadata. Khi nhập JSON v1, gắn geometry mặc định cũ, giữ ID/type/kích thước/màu/góc xoay/vị trí nội thất, metadata phòng và phép đo. Map `w0`, `w1`… sang wall ID qua bảng migration, không phụ thuộc thứ tự mảng sau khi chỉnh topology.

localStorage thuộc origin. Bản React chạy origin khác không đọc được phương án của bản HTML; dùng export/import JSON để chuyển dữ liệu. Nếu cùng origin, có thể đọc khóa `huxing-design-v1` một lần và ghi sang khóa mới, giữ nguyên dữ liệu cũ. Kiểm tra version, kiểu dữ liệu, số hữu hạn, kích thước dương, ID và tham chiếu trước khi thay project đang mở.

## Thứ tự triển khai

1. Tách fixture căn hộ, thư viện, model factory, geometry helper và LICENSE. Chụp đối chiếu model/scene cũ.
2. React shell và hai viewport dùng chung project; bảo toàn bố cục/model trước khi làm resize. Hỗ trợ import v1, export v2 và autosave.
3. Topology tường chung và opening anchor, đối chiếu footprint căn hộ mặc định với source gốc.
4. Resize phòng chữ nhật, preview phòng liền kề, kiểm tra cửa và đồ nội thất, undo/redo.
5. Chỉnh cạnh polygon lõm; di chuyển/rotate/resize nội thất, snapping, đo đạc và thống kê.
6. Hoàn thiện walkthrough, cửa mở/đóng, day/night, export ảnh, touch controls và chuyển camera theo tính năng cũ.

## Kiểm chứng cần có

- Căn hộ mặc định giữ footprint, diện tích, lỗ mở và placement nội thất so với source.
- Thu hẹp và mở rộng phòng làm tường chung, phòng kế bên, cửa và collision cập nhật đồng bộ.
- Chặn phòng tự cắt, cửa vượt tường, giá trị âm/NaN và JSON thiếu tham chiếu.
- Nội thất giữ w/d/color/rotation/modelSeed khi đổi phòng; undo khôi phục toàn bộ transaction.
- Import v1 và vòng export/import v2 không mất dữ liệu; đo đạc có chính sách rõ khi geometry thay đổi (phép đo cố định hoặc gắn vertex).
- Đối chiếu hình ảnh các type trong thư viện, không chỉ nội thất có sẵn trong căn hộ mặc định.
- Kiểm tra kéo liên tục không dựng lại tất cả furniture và không tăng tài nguyên GPU sau nhiều lần đổi kích thước.

## Trạng thái

Đã khảo sát source và đề xuất thiết kế chuyển đổi. Chưa triển khai ứng dụng React/Remix, chưa chạy kiểm thử ứng dụng mới.
