# Đồng Bộ NVL Từ AMIS Sang Lark Base

## Giới thiệu
Repository này dùng để đồng bộ danh sách nguyên vật liệu từ AMIS sang Lark Base bằng Node.js và GitHub Actions.

Mục tiêu chính:
- Lấy danh sách NVL từ AMIS.
- Đối chiếu với dữ liệu đang có trong Lark Base.
- Chỉ tạo mới các record chưa tồn tại.
- Hạn chế tạo trùng khi workflow chạy nhiều lần.

Giải pháp này được tách từ workflow n8n gốc `kéo nvl amiss về base.json` để thuận tiện triển khai, theo dõi log và vận hành tự động trên GitHub.

## Luồng xử lý
Quy trình đồng bộ hiện tại:

1. Lấy `access_token` từ AMIS.
2. Gọi API `get_dictionary` để lấy danh sách NVL.
3. Chuẩn hóa dữ liệu trả về từ AMIS.
4. Lấy toàn bộ record hiện có trong Lark Base.
5. So trùng theo mã NVL.
6. Tạo mới các record còn thiếu trong Lark Base.

Logic so trùng:
- Mã từ AMIS: `inventory_item_code`
- Cột mã trong Lark Base: `Mã_NVL`

Logic mapping khi tạo record:
- `Mã_NVL` = `inventory_item_code`
- `Tên_NVL` = `inventory_item_name`

## Cấu trúc thư mục
- `scripts/sync-amis-to-lark-base.mjs`: script đồng bộ chính.
- `.github/workflows/sync-amis-to-lark-base.yml`: workflow GitHub Actions chạy thủ công hoặc theo lịch.
- `kéo nvl amiss về base.json`: workflow n8n gốc dùng để đối chiếu logic ban đầu.

## Yêu cầu hệ thống
- Node.js `20` trở lên.
- Một ứng dụng Lark có quyền truy cập Bitable/Base.
- Thông tin truy cập AMIS hợp lệ.
- GitHub repository đã cấu hình `Secrets` nếu chạy bằng GitHub Actions.

## Biến cấu hình
Script sử dụng biến môi trường để cấu hình. Có 2 nhóm: bắt buộc và tùy chọn.

### Biến bắt buộc
- `MISA_ACCESS_CODE`: Access code dùng để lấy token từ AMIS.
- `LARK_APP_ID`: App ID của ứng dụng Lark.
- `LARK_APP_SECRET`: App Secret của ứng dụng Lark.
- `LARK_BASE_APP_TOKEN`: App token của Lark Base.
- `LARK_TABLE_ID`: Table ID trong Lark Base.

### Biến tùy chọn
Nếu không truyền, script sẽ dùng giá trị mặc định:

- `MISA_APP_ID`: Mặc định `b389320a-d4d5-4b61-a70a-36ff1d258df8`
- `MISA_ORG_COMPANY_CODE`: Mặc định `congtydemoketnoiact`
- `MISA_DICTIONARY_TYPE`: Mặc định `2`
- `MISA_SKIP`: Mặc định `0`
- `MISA_TAKE`: Mặc định `1000`
- `MISA_LAST_SYNC_TIME`: Mặc định `2000-01-25 14:15:02`
- `LARK_CODE_FIELD`: Mặc định `Mã_NVL`
- `LARK_NAME_FIELD`: Mặc định `Tên_NVL`
- `LARK_PAGE_SIZE`: Mặc định `500`
- `LARK_BATCH_DELAY_MS`: Mặc định `150`

## Cách chạy local
Ví dụ trên PowerShell:

```powershell
$env:MISA_ACCESS_CODE="your-misa-access-code"
$env:LARK_APP_ID="your-lark-app-id"
$env:LARK_APP_SECRET="your-lark-app-secret"
$env:LARK_BASE_APP_TOKEN="your-lark-base-app-token"
$env:LARK_TABLE_ID="your-lark-table-id"

node .\scripts\sync-amis-to-lark-base.mjs
```

Sau khi chạy, terminal sẽ in ra:
- Tổng số item lấy từ AMIS
- Số mã đã tồn tại trên Lark Base
- Số record cần tạo mới
- Kết quả tạo thành công hoặc lỗi chi tiết

## Chạy bằng GitHub Actions
Workflow nằm tại:
- `.github/workflows/sync-amis-to-lark-base.yml`

Workflow hỗ trợ:
- Chạy thủ công bằng `workflow_dispatch`
- Chạy tự động theo lịch mỗi 3 giờ

Để workflow hoạt động, cần tạo các `Repository Secrets` tương ứng trong GitHub:
- `MISA_ACCESS_CODE`
- `MISA_APP_ID`
- `MISA_ORG_COMPANY_CODE`
- `MISA_DICTIONARY_TYPE`
- `MISA_SKIP`
- `MISA_TAKE`
- `MISA_LAST_SYNC_TIME`
- `LARK_APP_ID`
- `LARK_APP_SECRET`
- `LARK_BASE_APP_TOKEN`
- `LARK_TABLE_ID`
- `LARK_CODE_FIELD`
- `LARK_NAME_FIELD`
- `LARK_PAGE_SIZE`
- `LARK_BATCH_DELAY_MS`

Trong thực tế, chỉ cần set các biến bắt buộc. Các biến còn lại có thể bỏ qua nếu muốn dùng mặc định.

## Kết quả mong đợi
Khi chạy thành công, hệ thống sẽ:
- Lấy dữ liệu NVL từ AMIS
- Đối chiếu với dữ liệu hiện có trên Lark Base
- Tạo mới các record chưa tồn tại
- Không tạo trùng khi chạy lặp lại

## Lưu ý vận hành
- Script hiện tại chỉ hỗ trợ `create missing records`, chưa cập nhật record đã tồn tại.
- Nếu tên cột trên Lark Base khác `Mã_NVL` hoặc `Tên_NVL`, hãy cấu hình lại qua `LARK_CODE_FIELD` và `LARK_NAME_FIELD`.
- Nếu AMIS trả về nhiều hơn `1000` bản ghi, cần tăng `MISA_TAKE` hoặc bổ sung cơ chế paging.
- Script sử dụng `tenant_access_token` để gọi API của Lark Bitable.
- Một số log tiếng Việt có thể hiển thị chưa đúng encoding trong terminal, nhưng không ảnh hưởng đến dữ liệu được tạo trong Base.

## Kiểm thử thực tế
Script đã được kiểm tra với dữ liệu thật theo luồng:
- Lấy dữ liệu từ AMIS
- Đẩy record mới lên Lark Base
- Chạy lại lần 2 để xác nhận không tạo trùng

Kết quả cho thấy cơ chế so trùng theo mã NVL đang hoạt động đúng.

## Hướng phát triển tiếp theo
Có thể mở rộng thêm các tính năng sau:
- Cập nhật record khi dữ liệu trên AMIS thay đổi
- Hỗ trợ phân trang đầy đủ cho AMIS
- Ghi log chi tiết hơn theo từng đợt đồng bộ
- Gửi thông báo khi sync thất bại

## Tác giả
Dự án được xây dựng để thay thế workflow n8n bằng một giải pháp dễ quản lý hơn trên GitHub Actions.
