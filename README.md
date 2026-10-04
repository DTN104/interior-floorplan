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
- Với phòng chữ nhật, chọn cạnh **giữ cố định**, nhập rộng/sâu theo mm rồi Enter hoặc rời ô. Với phòng lõm, chọn cạnh và khoảng dịch chuyển: dương là phải/xuống.
- Preview hiển thị các phòng bị ảnh hưởng, diện tích trước/sau và nội thất cần kiểm tra. **Áp dụng** tạo một thao tác undo cho toàn bộ geometry. **Hủy** không đổi dữ liệu đã lưu.
- Tường chung, các đầu mút liên quan, cửa và cửa sổ cập nhật trong cùng transaction. Các cạnh thuộc một đoạn tường liên tục có thể ảnh hưởng nhiều phòng; xem preview trước khi áp dụng. Nếu cửa không vừa, polygon tự cắt/chồng nhau, hoặc tường xâm nhập thêm vào phòng, thao tác bị từ chối.
- Nội thất giữ nguyên kích thước, màu, góc và seed khi đổi phòng. Mặc định giữ vị trí tuyệt đối. Để đồ đi theo tường, gắn phòng/tường trong bảng nội thất rồi bật **Di chuyển đồ đã gắn với tường** khi resize.
- Nhấn mục thư viện để thêm, kéo đồ trên 2D/3D để di chuyển, chỉnh kích thước/góc/màu trong bảng Chi tiết, hoặc nhân bản/xóa. Kéo liên tục tạo một history entry khi thả. Bám tường và lưới 10 mm hỗ trợ sắp đặt; vị trí không hợp lệ được cảnh báo, không tự xóa hay thu nhỏ đồ.
- Công cụ **Đo** đặt hai điểm đo cố định. **Tường** bật/tắt phá tường ngăn hoặc tường thấp; tường chịu lực và tường ngoài bị khóa. Các phép đo không đi theo đỉnh khi chỉnh geometry.
- Trong 3D có phối cảnh, nhìn từ trên, tường thấp/đầy đủ, giờ nắng, ngày/đêm, đi bộ bằng WASD/phím mũi tên hoặc nút cảm ứng. Kéo để nhìn khi đi bộ; chạm cửa để mở/đóng.
- Xuất PNG cho 2D/3D. `Ctrl/Cmd+Z` hoàn tác, `Ctrl/Cmd+Shift+Z` làm lại, `T` đổi 2D/3D và `Esc` hủy preview.

## JSON và autosave

**Xuất phương án** ghi schema v2 với `units: "mm"`, toàn bộ polygon, solid walls, wall runs, liên kết cạnh phòng, cửa/cửa sổ, điểm neo, nội thất, metadata, tường đã phá và phép đo. File v2 có thể nhập lại mà không mất geometry.

JSON v1 được gắn geometry căn hộ gốc; giữ ID/type/kích thước/vị trí/góc/màu, metadata phòng, tường đã phá và phép đo. Seed trang trí được tính một lần bằng công thức gốc. File lỗi được từ chối trước khi thay phương án đang mở.

Autosave dùng `interior-floorplan-v2`. Nếu chưa có v2, app đọc `huxing-design-v1` một lần nhưng **không ghi đè hoặc xóa khóa cũ**. LocalStorage thuộc từng origin; để chuyển từ app HTML chạy ở origin khác, hãy export/import JSON. History undo/redo giữ tối đa 150 thao tác trong phiên hiện tại; tải lại trang khôi phục phương án đã lưu, không khôi phục history.

## Kiểm thử trình duyệt

```bash
npm run test:browser
```

Playwright tự khởi động Vite trên port 5174. Trong cloud, dùng Chromium có sẵn tại `/usr/bin/chromium`. Trên máy khác, cài browser bằng `npx playwright install chromium`, hoặc đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE` tới Chromium của bạn. Kiểm thử chạy WebGL thật, dùng SwiftShader trong headless.

Xem [IMPLEMENTATION.md](IMPLEMENTATION.md) để biết thiết kế geometry, bằng chứng giữ model và các giới hạn cụ thể.

## License

Nguồn gốc MIT, copyright (c) 2026 wuyi. [LICENSE](LICENSE) và `legacy/index.html` được giữ nguyên. Các module được tách từ nguồn gốc giữ ghi chú copyright.
