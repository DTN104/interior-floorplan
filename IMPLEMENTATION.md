# Thiết kế và giới hạn

## Dữ liệu và geometry

`src/legacy-data.js` giữ nguyên WALLS, WINS, DOORS, SLIDES, ROOMS, MATS, LIB và phương án mặc định. ID furniture mặc định được chuẩn hóa thành `default-0`…`default-45` để fixture và autosave ổn định; ID trong file nhập được giữ nguyên.

`src/project.ts` là geometry engine và bộ kiểm tra JSON. Schema v2 lưu các solid rectangle gốc thay vì suy ra toàn bộ khối chịu lực từ centerline. Các wall run có hướng, hai mặt, đầu/cuối và ID ổn định; mỗi solid segment/opening tham chiếu một run. Cạnh phòng có liên kết run hoặc `null` cho biên không có tường. Stub tường ngắn vẫn giữ đúng hướng theo độ dày 240 mm của nguồn, không suy hướng chỉ từ cạnh dài nhất.

Resize là transaction trên bản sao project: tìm cạnh, lần theo wall run liên tục và các cạnh phòng nối với nó, dịch các mặt chung và đầu mút tường vuông góc, tính lại cửa theo anchor, cập nhật hai cạnh solid liền cửa, kiểm tra rồi tạo preview. Không dịch toàn căn hộ theo một tọa độ toàn cục, không scale toàn scene. Width của opening và kích thước nội thất không đổi. Opening chỉ dịch dọc tường khi đầu/cuối của chính wall run chứa nó thay đổi: anchor đầu đi theo đầu run, anchor cuối đi theo cuối run, anchor giữa dịch một nửa tổng thay đổi (giữ khoảng cách từ tâm opening tới điểm giữa run, làm tròn mm). Opening trên run không đổi giữ nguyên vị trí dù neo gì; đổi lựa chọn neo không di chuyển opening. Kết quả resize trả về danh sách opening bị dịch dọc tường để preview hiển thị.

Một số khối chịu lực gốc vốn nhô vào polygon diện tích phòng (ví dụ góc phòng con). Engine giữ đúng fixture này và cho phép mức giao ban đầu, nhưng chặn mức giao tăng lên. Điều này vừa giữ dữ liệu gốc vừa tránh hợp thức hóa lỗi geometry mới. Wall run phải được phủ liên tục bởi solid segments và openings; mọi gap mới bị từ chối.

SVG, mesh kiến trúc 3D, cửa, sàn, diện tích/chi phí và collision đều đọc cùng project. Các phép đo là điểm tuyệt đối. Nội thất gắn tường chỉ di chuyển khi người dùng chọn chế độ tương ứng; fit warnings dùng footprint xoay và giao polygon, bao gồm tường chưa bị phá.

## Giữ model và tài nguyên

`src/legacy-models.js` tách toàn bộ helper, floor texture và switch factory từ nguồn MIT. Những thay đổi có chủ đích: truyền các global material cần thiết vào module, dùng `modelSeed` đã lưu, thay anisotropy phụ thuộc renderer bằng 8, thêm quản lý vòng đời/cache và bộ đếm phục vụ kiểm tra hiệu năng. Mỗi furniture dùng một primitive R3F; vị trí/góc do group ngoài quản lý. Đổi transform không dựng lại factory; đổi type/kích thước/màu/seed chỉ dựng lại món đó.

`src/legacy-architecture.js` tái sử dụng builder sàn/tường/cửa/cửa sổ, thay các global dữ liệu bằng project; bay opening lintels cũng đọc geometry. Geometry tự tạo được dispose khi thay/unmount; material và texture chia sẻ được giữ đến khi viewport đóng. Material do kiến trúc sở hữu được dispose riêng. Giữ Three.js 0.160.0, ACES tone mapping, RoomEnvironment, floor textures và các material gốc. Có điều chỉnh camera responsive; không tuyên bố ảnh tổng thể pixel-identical với nguồn.

## Kiểm chứng

- Unit suite đối chiếu toàn bộ fixture và default placements; v1 migration và round-trip v2; dữ liệu không hợp lệ, IDs/references; resize chung, cửa giữ chiều rộng và anchor; phòng lõm; không dịch biên rời có cùng tọa độ; nội thất gắn tường, fit warnings và history transaction.
- 60 ca model so sánh hash tất cả buffer geometry, transform và thuộc tính material với **factory đọc trực tiếp từ `legacy/index.html`** cho từng mục thư viện. Có kiểm tra seed trang trí không đổi khi dịch model.
- Playwright kiểm tra preview/apply/undo/redo/autosave, drag tạo một history entry, migration không sửa khóa cũ, JSON/PNG, desktop/mobile, WebGL, đổi transform không dựng lại model và tài nguyên GPU sau các lần resize nội thất.
- Kiểm thử hồi quy hủy kéo bằng Esc, undo, pointercancel và đổi 2D/3D: dữ liệu đã lưu và history không đổi; kéo lại sau khi sửa vật liệu dùng project hiện tại, giữ chỉnh sửa đó và hoàn tác đúng một lần. 2D/3D dùng chung tín hiệu hủy phiên kéo, xóa snapshot tạm và khôi phục điều khiển camera.
- `tests/fixtures/legacy-v1-export.json` là file xuất trực tiếp từ `legacy/index.html` (có một phép đo tạo bằng công cụ Đo gốc, điểm dạng `{x, y}`). Unit và Playwright nhập file này; v1 chấp nhận điểm `{x, y}` hoặc `[x, y]` và lưu v2 dạng `[x, y]`, còn v2 vẫn chỉ nhận `[x, y]`. Lỗi schema được báo bằng tiếng Việt kèm đường dẫn trường (ví dụ `Dữ liệu không hợp lệ tại furniture.0.w: giá trị ngoài giới hạn cho phép.`).
- Autosave không đọc được: không âm thầm ghi đè. Bản lưu gốc được chép sang `interior-floorplan-v2-unreadable`, app báo lỗi, mở căn hộ mặc định và chỉ autosave sau lần chỉnh sửa đầu tiên. Nếu `huxing-design-v1` không chuyển được, khóa cũ giữ nguyên và app sẽ thử lại ở lần tải sau nếu chưa có chỉnh sửa.
- Click chọn phòng trên SVG được xử lý ở pointerup (không phụ thuộc sự kiện click, vốn bị pointer capture chuyển về `<svg>`); kéo quá 4 px (chuột) hoặc 9 px (cảm ứng) là pan, không chọn phòng. **Xuất phương án** ghi trạng thái đã áp dụng, không gồm preview hay phiên kéo dở.
- Build chạy TypeScript và Vite; bản legacy được đưa vào dist để còn truy cập sau build.

## Giới hạn cụ thể

- Editor hỗ trợ căn hộ polygon vuông góc hiện có và chỉnh cạnh của nó. Chưa có công cụ tạo/xóa phòng, thêm/xóa tường, tạo cửa mới hoặc sửa độ dày tường. Không hỗ trợ polygon xiên. Solid walls và openings giữ ID/thứ tự của fixture; không tự sắp lại topology.
- Không phải mọi kích thước tùy ý đều có thể áp dụng: thao tác cần thêm một solid segment quanh cửa, thay cấu trúc bay window, làm tăng giao với khối chịu lực, hoặc tạo room overlap sẽ bị từ chối với lỗi cụ thể. Engine không tự invent hình học để lấp gap. Các phòng bị ảnh hưởng được liệt kê trong preview.
- Door open/closed là trạng thái xem 3D, không ghi trong JSON/undo. Walkthrough kiểm tra tường, cửa sổ và cửa đóng, nhưng không dùng mô phỏng collision vật lý với nội thất; fit warnings riêng kiểm tra bố trí nội thất. Chưa có pointer-lock/mouse-look vô hạn; dùng kéo để nhìn và nút di chuyển cảm ứng.
- Kéo đồ và sửa kích thước qua panel được hỗ trợ; chưa có handle resize trực tiếp trên mesh. 2D hỗ trợ pan/drag bằng cảm ứng; zoom dùng wheel trên desktop. Pinch zoom 2D chưa có; **Vừa khung** khôi phục khung nhìn.
- Undo history không tồn tại sau reload, chỉ phương án hiện tại được autosave. Không có lưu trữ server hay chia sẻ nhiều người.
- Module 3D được tải lười; Vite vẫn cảnh báo chunk 3D lớn (khoảng 870 kB, khoảng 240 kB gzip). Chưa chia riêng Three.js/model factory thành các gói tải thêm.
- Browser checks chạy Chromium headless bằng software WebGL trên Linux. Chưa kiểm tra Safari/iOS hoặc đối chiếu ảnh trên GPU vật lý. Bản gốc vẫn giữ để tham khảo các chi tiết tương tác chưa port.
