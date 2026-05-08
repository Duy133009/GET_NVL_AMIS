# Sync AMIS -> Lark Base

Chuyen workflow n8n `keo nvl amiss ve base.json` thanh script Node.js de chay tren GitHub Actions.

## Logic da chinh lai

- Lay danh sach NVL tu AMIS.
- Lay toan bo record hien co trong Lark Base.
- So trung theo field `Ma_NVL` trong AMIS va cot `Mã_NVL` trong Lark.
- Chi tao record moi, khong update record da ton tai.
- Tao dung mapping:
  - `Mã_NVL` = `inventory_item_code`
  - `Tên_NVL` = `inventory_item_name`

## File chinh

- `scripts/sync-amis-to-lark-base.mjs`: script dong bo.
- `.github/workflows/sync-amis-to-lark-base.yml`: workflow GitHub Actions chay tay hoac 3 gio/lần.
- `kéo nvl amiss về base.json`: workflow goc de doi chieu.

## GitHub Secrets can tao

Bat buoc:

- `MISA_ACCESS_CODE`
- `LARK_APP_ID`
- `LARK_APP_SECRET`
- `LARK_BASE_APP_TOKEN`
- `LARK_TABLE_ID`

Tuy chon, neu khong set thi script dung default:

- `MISA_APP_ID` = `b389320a-d4d5-4b61-a70a-36ff1d258df8`
- `MISA_ORG_COMPANY_CODE` = `congtydemoketnoiact`
- `MISA_DICTIONARY_TYPE` = `2`
- `MISA_SKIP` = `0`
- `MISA_TAKE` = `1000`
- `MISA_LAST_SYNC_TIME` = `2000-01-25 14:15:02`
- `LARK_CODE_FIELD` = `Mã_NVL`
- `LARK_NAME_FIELD` = `Tên_NVL`
- `LARK_PAGE_SIZE` = `500`
- `LARK_BATCH_DELAY_MS` = `150`

## Chay local

PowerShell:

```powershell
$env:MISA_ACCESS_CODE="..."
$env:LARK_APP_ID="..."
$env:LARK_APP_SECRET="..."
$env:LARK_BASE_APP_TOKEN="..."
$env:LARK_TABLE_ID="..."
node .\scripts\sync-amis-to-lark-base.mjs
```

## Ghi chu

- Script su dung `tenant_access_token` de goi API Bitable.
- Neu trong Lark Base ten cot khac `Mã_NVL` / `Tên_NVL` thi doi qua secrets `LARK_CODE_FIELD` va `LARK_NAME_FIELD`.
- Neu AMIS tra ve hon 1000 ban ghi, tang `MISA_TAKE` hoac bo sung paging sau.
