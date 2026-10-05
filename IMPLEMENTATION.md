# Thiết kế và giới hạn

## Dữ liệu và geometry

`src/legacy-data.js` giữ nguyên WALLS, WINS, DOORS, SLIDES, ROOMS, MATS, LIB và phương án mặc định. ID furniture mặc định được chuẩn hóa thành `default-0`…`default-45` để fixture và autosave ổn định; ID trong file nhập được giữ nguyên.

`src/project.ts` là geometry engine và bộ kiểm tra JSON. Schema v2 lưu các solid rectangle gốc thay vì suy ra toàn bộ khối chịu lực từ centerline. Các wall run có hướng, hai mặt, đầu/cuối và ID ổn định; mỗi solid segment/opening tham chiếu một run. Cạnh phòng có liên kết run hoặc `null` cho biên không có tường. Stub tường ngắn vẫn giữ đúng hướng theo độ dày 240 mm của nguồn, không suy hướng chỉ từ cạnh dài nhất.

Resize là transaction trên bản sao project, không scale toàn scene. Các bước:

1. Tìm wall run của cạnh và lần theo các cạnh phòng/wall run song song chạm nhau trên cùng đường (band); các run này tịnh tiến.
2. Run vuông góc chỉ dời đầu mút khi nó dừng ngay tại tường đang di chuyển; nếu phía bên kia mặt đó còn tường/cửa cố định nối tiếp (chữ T, khối góc) thì giữ nguyên. Nhờ vậy khối chịu lực và vách ngăn bên cạnh không bị kéo giãn ngoài ý muốn.
3. Bệ cửa sổ (phòng không tính diện tích) bám trên tường ngoài đi theo nguyên khối cùng khung của nó.
4. Cạnh phòng trên đường di chuyển đi theo, trừ đoạn nằm dưới hoặc tựa vào khối tường đứng yên; đoạn đó giữ nguyên và polygon có thêm một bậc nối hai phần.
5. Mỗi run đổi chiều dài được sắp xếp lại: cửa theo neo (mặc định giữ vị trí), bị đẩy vào trong khi run ngắn lại; cửa sổ hẹp dần (rộng nhất trước, tối thiểu 300 mm) khi tổng bề rộng vượt chiều dài run; các đoạn tường đặc lấp phần còn lại, có thể co về 0 mm; chỗ hở không có đoạn tường nào sẽ được lấp bằng đoạn tường mới cùng loại với đoạn gần nhất (không tạo khối chịu lực mới).
6. Kiểm tra: polygon tự cắt hoặc chồng nhau, tường/cửa chồng lên nhau, cửa không vừa run, tường xâm nhập thêm vào phòng, run liên tục. Lỗi nào cũng từ chối toàn bộ transaction.

Đoạn tường co về 0 mm vẫn giữ chỉ số (để ID phá tường `w{i}` ổn định), không được vẽ ở 2D/3D và có thể dài lại ở lần resize sau. Đoạn tường mới được thêm vào cuối danh sách. `geometry.anchorVersion = 2` đánh dấu neo mặc định là `fixed`; file v2 chưa có trường này được chuyển neo `start` sang `fixed` khi nhập.

Kéo cạnh trên bản vẽ dùng cùng engine: mỗi bước 10 mm chạy lại resize trên project đã lưu (tối đa một lần mỗi khung hình); bước vượt giới hạn giữ lại kết quả hợp lệ gần nhất; thả chuột áp dụng kết quả đó thành một mục undo. Kiểm tra hình học lọc bounding box trước khi gọi polygon clipping nên một bước resize mất khoảng 10 ms.

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
- Ma trận đổi kích thước: kéo từng cạnh của 11 phòng tính diện tích ±50/100/300/500 mm (400 thao tác) được chấp nhận 392 lần (trước khi đổi engine: 219); mọi kết quả được chấp nhận đều nhập lại được và không có tường/cửa chồng nhau. Một chuỗi 150 lần kéo ngẫu nhiên liên tiếp cũng giữ hình học hợp lệ sau mỗi bước. Đổi rộng/sâu ±50…500 mm của 9 phòng chữ nhật luôn có ít nhất một cạnh giữ cố định thực hiện được (trước: 38/144 ca bị chặn).
- Click chọn phòng trên SVG được xử lý ở pointerup (không phụ thuộc sự kiện click, vốn bị pointer capture chuyển về `<svg>`); kéo quá 4 px (chuột) hoặc 9 px (cảm ứng) là pan, không chọn phòng. **Xuất phương án** ghi trạng thái đã áp dụng, không gồm preview hay phiên kéo dở.
- Build chạy TypeScript và Vite; bản legacy được đưa vào dist để còn truy cập sau build.

## Giới hạn cụ thể

- Editor hỗ trợ căn hộ polygon vuông góc hiện có và chỉnh cạnh của nó. Chưa có công cụ tạo/xóa phòng, thêm/xóa tường, tạo cửa mới hoặc sửa độ dày tường. Không hỗ trợ polygon xiên. Solid walls và openings giữ ID/thứ tự của fixture; không tự sắp lại topology.
- Vẫn bị chặn (8/400 thao tác trong ma trận): kéo vách giữa Hành lang và Phòng con sang phải quá 240 mm (vượt độ dày tường, khối chịu lực góc khiến hai phòng chồng nhau), và kéo tường giữa Phòng con/Phòng khách lên quá 480 mm (đụng khung bệ cửa sổ phòng con). Engine không tự tách một wall run thành hai đoạn để chỉ dời một phần, nên kéo cạnh một phòng có thể dời cả các phòng chung đường tường đó (xem preview).
- Door open/closed là trạng thái xem 3D, không ghi trong JSON/undo. Walkthrough kiểm tra tường, cửa sổ và cửa đóng, nhưng không dùng mô phỏng collision vật lý với nội thất; fit warnings riêng kiểm tra bố trí nội thất. Chưa có pointer-lock/mouse-look vô hạn; dùng kéo để nhìn và nút di chuyển cảm ứng.
- Kéo đồ và kéo cạnh phòng trên 2D được hỗ trợ; kích thước nội thất vẫn sửa qua panel, chưa có handle resize nội thất trên mesh. 2D hỗ trợ pan/drag bằng cảm ứng; zoom dùng wheel trên desktop. Pinch zoom 2D chưa có; **Vừa khung** khôi phục khung nhìn.
- Undo history không tồn tại sau reload, chỉ phương án hiện tại được autosave. Không có lưu trữ server hay chia sẻ nhiều người.
- Module 3D được tải lười; Vite vẫn cảnh báo chunk 3D lớn (khoảng 870 kB, khoảng 240 kB gzip). Chưa chia riêng Three.js/model factory thành các gói tải thêm.
- Browser checks chạy Chromium headless bằng software WebGL trên Linux. Chưa kiểm tra Safari/iOS hoặc đối chiếu ảnh trên GPU vật lý. Bản gốc vẫn giữ để tham khảo các chi tiết tương tác chưa port.
