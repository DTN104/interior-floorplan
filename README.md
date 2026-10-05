# Interior Floorplan — Nhà / Studio

Ứng dụng React + TypeScript + Vite để chỉnh bản vẽ căn hộ bằng SVG 2D và React Three Fiber 3D. Căn hộ gốc, 46 món nội thất mặc định, 60 mục thư viện và toàn bộ factory model procedural được giữ lại với Three.js r160. Giao diện chính dùng tiếng Việt.

## Chạy ứng dụng

Cần Node.js 20.19+; môi trường cloud đã kiểm tra với Node.js **24.19.0** (xem `.nvmrc`) và npm 11.

```bash
npm ci
npm run dev
```

Mở địa chỉ mà Vite in ra. Ứng dụng chạy hoàn toàn trong trình duyệt, không cần backend, tài khoản hoặc API key. Dependencies 3D được đóng gói bằng npm; ứng dụng React không tải Three.js từ CDN.

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

`build` kiểm tra TypeScript, tạo `dist/` và sao chép bản HTML gốc vào `dist/legacy/`. Bản gốc vẫn truy cập được tại `/legacy/index.html` khi chạy dev hoặc preview; bản gốc cần truy cập `cdn.jsdelivr.net` để tải Three.js.

## Chỉnh bản vẽ

- Chọn phòng trên bản vẽ hoặc trong bảng **Chi tiết**. Đổi tên, vật liệu và xem diện tích, chi phí sàn với hao hụt 5%. Giá gốc vẫn dùng ¥, không chuyển thành đồng Việt Nam.
- **Kéo cạnh phòng trực tiếp**: chọn phòng, mỗi cạnh có một tay nắm cam trên bản vẽ 2D. Kéo để đổi kích thước theo bước 10 mm; tường, cửa, diện tích và ô rộng/sâu cập nhật ngay khi kéo. Thả chuột để áp dụng (một thao tác hoàn tác), `Esc` để hủy. Nếu kéo quá giới hạn hình học, tay nắm chuyển đỏ và khi thả app dừng ở vị trí hợp lệ gần nhất. Dùng được cả với cảm ứng.
- Hoặc nhập số: với phòng chữ nhật, chọn cạnh **giữ cố định**, nhập rộng/sâu theo mm rồi Enter hoặc rời ô. Với phòng lõm, chọn cạnh và khoảng dịch chuyển: dương là phải/xuống.
- Preview hiển thị các phòng bị ảnh hưởng, diện tích trước/sau và nội thất cần kiểm tra. Nút **Áp dụng kích thước** nằm ngay trong bảng Chi tiết (ngoài nút Áp dụng trên bản vẽ), tạo một thao tác undo cho toàn bộ geometry. **Hủy** không đổi dữ liệu đã lưu.
- Nếu cạnh giữ cố định hiện tại bị chặn nhưng cạnh đối diện thực hiện được, app đưa ra nút gợi ý để bạn chọn rõ ràng; không tự đổi cạnh giữ cố định. Ví dụ căn hộ mặc định: thu chiều sâu Phòng con còn 2260 mm khi giữ cạnh trên sẽ đẩy tường vào khung bệ cửa sổ, nên app gợi ý **Giữ cạnh dưới và xem trước**. Nhập theo mm: 3,8 m là **3800**, không phải 3,8. Thông báo lỗi và gợi ý nằm ngay cạnh phần chỉnh kích thước, kể cả trên điện thoại.
- Tường chung, các đầu mút liên quan, cửa và cửa sổ cập nhật trong cùng transaction. Các cạnh thuộc một đoạn tường liên tục có thể ảnh hưởng nhiều phòng; xem preview trước khi áp dụng. Khi tường ngắn lại, cửa bị đẩy vào trong và đoạn tường đặc có thể co về 0; cửa sổ (không phải cửa đi) hẹp lại nếu không còn đủ chỗ. Khi tường dài ra mà đầu tường là cửa/cửa sổ, app tự thêm một đoạn tường đặc. Khối chịu lực ở góc không bị kéo giãn theo tường ngăn; phần cạnh phòng nằm dưới khối đó giữ nguyên và tạo một bậc nhỏ. Bệ cửa sổ đi theo tường ngoài. Chỉ chặn khi polygon tự cắt/chồng nhau, tường hoặc cửa chồng lên nhau, hoặc tường xâm nhập thêm vào phòng.
- Neo của cửa/cửa sổ (mục **Cửa trên cạnh đã chọn**): mặc định **Giữ vị trí** (cửa đứng yên, chỉ bị đẩy khi tường ngắn tới mức chạm cửa). Neo đầu/cuối/giữa: cửa đi theo đầu tường đó, hoặc dịch một nửa phần thay đổi khi chính đoạn tường của nó dài/ngắn lại. Đổi neo không di chuyển cửa; cửa trên đoạn tường không đổi luôn đứng yên. File v2 cũ (trước khi có **Giữ vị trí**) có neo đầu tường mặc định được chuyển sang **Giữ vị trí** khi mở. Preview liệt kê cửa/cửa sổ bị dịch dọc tường, ví dụ `Cửa phòng chính +50 mm`.
- Nội thất giữ nguyên kích thước, màu, góc và seed khi đổi phòng. Mặc định giữ vị trí tuyệt đối. Để đồ đi theo tường, gắn phòng/tường trong bảng nội thất rồi bật **Di chuyển đồ đã gắn với tường** khi resize.
- Nhấn mục thư viện để thêm, kéo đồ trên 2D/3D để di chuyển, chỉnh kích thước/góc/màu trong bảng Chi tiết, hoặc nhân bản/xóa. Kéo liên tục tạo một history entry khi thả. Bám tường và lưới 10 mm hỗ trợ sắp đặt; vị trí không hợp lệ được cảnh báo, không tự xóa hay thu nhỏ đồ.
- Nhấn **Esc** khi đang kéo để hủy và giữ vị trí đã lưu. Đổi 2D/3D, hoàn tác/làm lại hoặc thao tác cảm ứng bị gián đoạn cũng hủy phiên kéo; thả chuột sau đó không lưu lại vị trí đã hủy.
- Công cụ **Đo** đặt hai điểm đo cố định. **Tường** bật/tắt phá tường ngăn hoặc tường thấp; tường chịu lực và tường ngoài bị khóa. Các phép đo không đi theo đỉnh khi chỉnh geometry.
- Trong 3D có phối cảnh, nhìn từ trên, tường thấp/đầy đủ, giờ nắng, ngày/đêm, đi bộ bằng WASD/phím mũi tên hoặc nút cảm ứng. Kéo để nhìn khi đi bộ; chạm cửa để mở/đóng.
- Xuất PNG cho 2D/3D. `Ctrl/Cmd+Z` hoàn tác, `Ctrl/Cmd+Shift+Z` làm lại, `T` đổi 2D/3D và `Esc` hủy preview.

## JSON và autosave

**Xuất phương án** ghi schema v2 với `units: "mm"`, toàn bộ polygon, solid walls, wall runs, liên kết cạnh phòng, cửa/cửa sổ, điểm neo, nội thất, metadata, tường đã phá và phép đo. File chỉ chứa thay đổi đã áp dụng; kích thước đang xem trước chưa được ghi. File v2 có thể nhập lại mà không mất geometry.

JSON v1 được gắn geometry căn hộ gốc; giữ ID/type/kích thước/vị trí/góc/màu, metadata phòng, tường đã phá và phép đo (điểm đo `{x, y}` của bản gốc được chuyển thành `[x, y]`). Seed trang trí được tính một lần bằng công thức gốc. File lỗi được từ chối trước khi thay phương án đang mở, kèm thông báo tiếng Việt chỉ rõ trường bị lỗi.

Autosave dùng `interior-floorplan-v2`. Nếu chưa có v2, app đọc `huxing-design-v1` một lần nhưng **không ghi đè hoặc xóa khóa cũ**. Nếu dữ liệu đã lưu không đọc được, app báo lỗi, chép bản gốc sang `interior-floorplan-v2-unreadable`, mở căn hộ mặc định và chỉ autosave sau lần chỉnh sửa đầu tiên. LocalStorage thuộc từng origin; để chuyển từ app HTML chạy ở origin khác, hãy export/import JSON. History undo/redo giữ tối đa 150 thao tác trong phiên hiện tại; tải lại trang khôi phục phương án đã lưu, không khôi phục history.

## Kiểm thử trình duyệt

```bash
npm run test:browser
```

Playwright tự khởi động Vite trên port 5174. Trong cloud, dùng Chromium có sẵn tại `/usr/bin/chromium`. Trên máy khác, cài browser bằng `npx playwright install chromium`, hoặc đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE` tới Chromium của bạn. Kiểm thử chạy WebGL thật, dùng SwiftShader trong headless.

Xem [IMPLEMENTATION.md](IMPLEMENTATION.md) để biết thiết kế geometry, bằng chứng giữ model và các giới hạn cụ thể.

## License

Nguồn gốc MIT, copyright (c) 2026 wuyi. [LICENSE](LICENSE) và `legacy/index.html` được giữ nguyên. Các module được tách từ nguồn gốc giữ ghi chú copyright.
