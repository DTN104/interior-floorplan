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

Nhập rộng/sâu tiếp tục từ geometry đang xem trước, gộp các phòng và dịch chuyển cửa bị ảnh hưởng; áp dụng cả hai kích thước thành một mục undo. Nhập số không hợp lệ giữ bản xem trước hợp lệ trước đó. Neo giữa giữ chính xác phần dịch chuyển nửa mm, không làm tròn từng lần, để tăng/giảm kích thước trở lại không gây lệch cửa tích lũy.

Một số khối chịu lực gốc vốn nhô vào polygon diện tích phòng (ví dụ góc phòng con). Engine giữ đúng fixture này và cho phép mức giao ban đầu, nhưng chặn mức giao tăng lên. Điều này vừa giữ dữ liệu gốc vừa tránh hợp thức hóa lỗi geometry mới. Wall run phải được phủ liên tục bởi solid segments và openings; mọi gap mới bị từ chối.

SVG, mesh kiến trúc 3D, cửa, sàn, diện tích/chi phí và collision đều đọc cùng project. Các phép đo là điểm tuyệt đối. Nội thất gắn tường chỉ di chuyển khi người dùng chọn chế độ tương ứng; fit warnings dùng footprint xoay và giao polygon, bao gồm tường chưa bị phá.

## Mặt bằng tự vẽ và mẫu

`src/layout.ts` dựng mặt bằng từ phòng (polygon thông thủy, vuông góc) và cửa đặt trên mặt phòng; `src/templates.ts` giữ các mẫu. Mỗi thao tác vẽ (thêm/di chuyển/đổi kích thước/xóa/gộp phòng, bỏ/thêm vách, thêm/sửa/xóa cửa, đổi cài đặt) đọc lại phòng và cửa từ project hiện tại rồi sinh lại toàn bộ tường, nên không cần lưu một bản phác riêng và cũng chạy sau khi project đã được kéo cạnh ở chế độ thường.

Sinh tường:

1. Cắt mặt bằng thành lưới theo mọi tọa độ phòng và tọa độ ± độ dày tường ngoài. Ô nằm trong vùng giãn nở một độ dày tường ngoài quanh các phòng (trừ chính các phòng) là ô tường.
2. Mỗi mặt phòng nhận dải tường trước mặt nó: nếu có phòng đối diện với khe nhỏ hơn hai lần độ dày tường ngoài thì là vách dày đúng bằng khe hở (khe 0 mm = thông nhau, khe dưới 50 mm bị từ chối); nếu không thì là tường ngoài một độ dày. Danh sách Phòng kề bên, Bỏ vách/Gộp và việc nhận ra cửa nằm trong vách dùng cùng ngưỡng (`partitionLimit`). Vì vậy cài đặt **Vách mới** phải nhỏ hơn hai lần tường ngoài, và hạ tường ngoài bị từ chối nếu một vách đang có sẽ vượt ngưỡng (nếu không, vách tách thành hai tường ngoài và cửa trong vách bị bít phía bên kia). Chỉ kiểm khi đổi hai cài đặt này, nên phương án lưu trước khi có giới hạn vẫn đổi trần được; riêng thêm vách mới với cài đặt cũ quá dày thì báo cần chỉnh lại.
3. Hai dải chồng nhau (góc trong, phòng lệch nhau) được phân xử: vách thắng tường ngoài, rồi tường của mặt phòng dài hơn chạy suốt, rồi tường ngang; bên thua nhường cả mặt cắt ngang của nó tại đó.
4. Ô còn lại (góc ngoài, chỗ nối chữ T, chữ thập) nối dài một tường thẳng hàng: ưu tiên tường liền ở cả hai phía, rồi tường ngoài, rồi tường ngang. Mẩu không chạm phòng nào bị bỏ; khe rất hẹp sát phòng (hai phòng gần thẳng hàng) thành một mẩu tường riêng. Sau đó khoảng hở bị tường bao kín mọi phía (chỗ nối của các phòng lệch nhau, khe hơi rộng hơn hai lớp tường ngoài) mà hẹp hơn 500 mm được lấp bằng mẩu tường đệm; khoảng kín rộng hơn (giếng trời) và mọi khoảng thông ra ngoài giữ nguyên.
5. Gộp ô thành các đoạn tường chữ nhật theo từng dải, khoét cửa vào đúng dải sau mặt phòng chủ (không được cắt qua chỗ nối), rồi dùng `topology()` với hướng tường đã biết để tạo wall run, liên kết cửa và cạnh phòng. Kết quả qua `validateGeometry`/`verifyTopology` như mọi project.

Cửa đi thuộc phòng mà cánh mở vào; cửa sổ và cửa trượt trong vách thuộc phòng có mặt ngắn hơn (ví dụ ban công). Khi phòng chủ di chuyển, cửa đi theo; khi mặt phòng ngắn lại, cửa được kéo vào trong; cửa không còn nằm trọn trên một dải tường bị bỏ và được báo lại, kể cả cửa đã lệch khỏi mọi mặt phòng sau các lần kéo cạnh ở chế độ thường. Đoạn vách đã phá được giữ bằng cách cắt đoạn vách mới tại đúng vị trí cũ; phần nào không còn vách cùng dải thì được dựng lại và báo. Nội thất giữ vị trí và gắn lại wall run gần nhất. Điểm đặt tên phòng và đèn trần luôn nằm hẳn trong phòng: giữa khung bao nếu đủ xa tường, nếu không thì giữa phần lớn nhất của phòng; kéo cạnh ở chế độ thường trên mặt bằng tự vẽ cũng tính lại điểm này (căn hộ gốc giữ vị trí đặt tay như bản gốc). Mọi tọa độ, độ dày và chiều cao do thao tác vẽ tạo ra đều làm tròn tới mm để file luôn nhập lại được.

Những chỗ trước đây gắn với căn hộ gốc được tách: tên phòng/cửa tiếng Việt chỉ áp cho phòng/cửa còn giữ tên gốc, mức tường lấn vào phòng chỉ cho phép với căn hộ gốc, gốc tọa độ 3D và vùng đổ bóng theo kích thước mặt bằng tự vẽ, chiều cao trần và bậu/đỉnh cửa sổ đọc từ dữ liệu (căn hộ gốc giữ quy tắc cũ), vị trí mặc định của đồ mới và điểm bắt đầu đi bộ không còn dựa vào tọa độ cố định.

Kiểm chứng: ba mẫu tự vẽ và mặt bằng thử đều nhập lại được và chấp nhận 100% thao tác kéo cạnh ±50…500 mm của engine resize hiện có; một chuỗi 220 thao tác vẽ ngẫu nhiên (thêm/di chuyển/đổi kích thước/gộp/bỏ vách/đặt cửa/kéo cạnh/xóa) giữ hình học hợp lệ sau mỗi bước, không có lần nào hỏng vì không đóng được tường. Sinh lại một mặt bằng khoảng 15 phòng mất khoảng 10 ms. Unit test còn khóa các lỗi đã sửa: vách quá dày so với tường ngoài, cửa sổ sau khi hạ trần còn đúng 100 mm giữa bậu và đỉnh vẫn sửa được, lưu/xóa mẫu giữ nguyên mục không đọc được (danh sách hỏng hẳn được chép sang `interior-floorplan-templates-unreadable`), ID dự phòng bằng `crypto.getRandomValues` khi trình duyệt không có `crypto.randomUUID` (mở qua `http://<IP LAN>`). Ngoài ra: khe kín giữa các phòng được lấp còn giếng trời giữ nguyên, nhãn phòng nằm hẳn trong phòng kể cả sau khi kéo cạnh ở chế độ thường; một vòng thử 22.500 thao tác ngẫu nhiên (thêm cả tường ngoài 100/120 mm và vách 200–300 mm) không còn lỗ kín nhỏ hơn 0,25 m² trong khối tường hay nhãn nằm trên/ngoài cạnh phòng. Playwright kiểm tra chọn/lưu/xóa mẫu, ô nhập bị từ chối trở về giá trị cũ, thêm/nhân bản nội thất và lưu mẫu khi thiếu `crypto.randomUUID`, hoàn tác khi đổi mẫu, vẽ phòng có hít vách (cả khi kéo sang trái), đặt và sửa cửa, công cụ cửa kéo thì di chuyển khung nhìn, nhấn tay nắm mà không kéo không đổi gì, di chuyển phòng có Esc hủy, thêm/chọn cửa bằng bàn phím, giữ focus trong hộp thoại mẫu, 3D của mặt bằng tự vẽ và màn hình điện thoại.

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

- Căn hộ gốc: chỉ chỉnh cạnh, không thêm/xóa phòng hay cửa; solid walls và openings giữ ID/thứ tự của fixture. Mặt bằng tự vẽ: phòng chữ nhật (chữ L/U bằng cách gộp), tường sinh tự động, chưa vẽ tường rời, cột hay tường xiên, chưa đổi độ dày từng đoạn vách riêng lẻ, chưa có ảnh nền để vẽ đè. Không hỗ trợ polygon xiên.
- Vẫn bị chặn (8/400 thao tác trong ma trận): kéo vách giữa Hành lang và Phòng con sang phải quá 240 mm (vượt độ dày tường, khối chịu lực góc khiến hai phòng chồng nhau), và kéo tường giữa Phòng con/Phòng khách lên quá 480 mm (đụng khung bệ cửa sổ phòng con). Engine không tự tách một wall run thành hai đoạn để chỉ dời một phần, nên kéo cạnh một phòng có thể dời cả các phòng chung đường tường đó (xem preview).
- Door open/closed là trạng thái xem 3D, không ghi trong JSON/undo. Walkthrough kiểm tra tường, cửa sổ và cửa đóng, nhưng không dùng mô phỏng collision vật lý với nội thất; fit warnings riêng kiểm tra bố trí nội thất. Chưa có pointer-lock/mouse-look vô hạn; dùng kéo để nhìn và nút di chuyển cảm ứng.
- Kéo đồ và kéo cạnh phòng trên 2D được hỗ trợ; kích thước nội thất vẫn sửa qua panel, chưa có handle resize nội thất trên mesh. 2D hỗ trợ pan/drag bằng cảm ứng; zoom dùng wheel trên desktop. Pinch zoom 2D chưa có; **Vừa khung** khôi phục khung nhìn.
- Undo history không tồn tại sau reload, chỉ phương án hiện tại được autosave. Không có lưu trữ server hay chia sẻ nhiều người.
- Module 3D được tải lười; Vite vẫn cảnh báo chunk 3D lớn (khoảng 870 kB, khoảng 240 kB gzip). Chưa chia riêng Three.js/model factory thành các gói tải thêm.
- Browser checks chạy Chromium headless bằng software WebGL trên Linux. Chưa kiểm tra Safari/iOS hoặc đối chiếu ảnh trên GPU vật lý. Bản gốc vẫn giữ để tham khảo các chi tiết tương tác chưa port.
