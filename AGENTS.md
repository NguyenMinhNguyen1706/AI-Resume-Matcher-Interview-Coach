# AGENTS.md: Quy Tắc & Hướng Dẫn Phát Triển Cho AI Agent

> File này quy định toàn bộ kiến trúc, cấu trúc thư mục, quy tắc viết code và quy trình làm việc bắt buộc cho AI Agent khi hỗ trợ phát triển dự án này. AI Agent BẮT BUỘC phải đọc và tuân thủ các quy tắc trong file này trước khi thực hiện bất kỳ thay đổi nào.

---

## 1. Công nghệ sử dụng trong dự án (Tech Stack)

| Thành phần | Công nghệ | Phiên bản / Ghi chú |
| :--- | :--- | :--- |
| **Monorepo Manager** | Turborepo, Yarn v1 | Quản lý cả `backend` và `frontend` |
| **Backend Runtime** | Node.js (v20+), TypeScript, TSX | Entrypoint: `backend/server.mjs` chạy qua tsx |
| **AI Orchestration** | LangGraph JS (`@langchain/langgraph`) | State machine điều phối Ingestion Graph và Retrieval Graph |
| **LLM Provider** | Google Gemini API (`@langchain/google-genai`) | Chat Model: `gemini-3.8-flash`<br>Embedding: `gemini-embedding-2` (3072 dims) |
| **Vector Database** | Supabase pgvector | Bảng `documents`, RPC `match_documents` |
| **Frontend Framework** | Next.js 14 (App Router), React 18 | `app/page.tsx`, Tailwind CSS v3, Radix UI / Shadcn |
| **Styling & Markdown** | Tailwind CSS v3.4.17, `react-markdown` | Hỗ trợ hiển thị Markdown có định dạng trong Chat |
| **Testing** | Jest, ts-jest | Kiểm thử unit test và integration test |

---

## 2. Cấu trúc thư mục (Project Directory Layout)

```
d:\CHAT BOT AI\
├── backend\
│   ├── src\
│   │   ├── ingestion_graph\          # Graph xử lý ingest và lưu vector vào Supabase
│   │   │   ├── configuration.ts
│   │   │   ├── graph.ts
│   │   │   └── state.ts
│   │   ├── retrieval_graph\          # Graph xử lý tìm kiếm tài liệu và sinh phản hồi
│   │   │   ├── configuration.ts
│   │   │   ├── graph.ts              # Router, retrieveDocuments, generateResponse
│   │   │   ├── prompts.ts            # System prompt cho Router và Chuyên gia phỏng vấn
│   │   │   ├── state.ts
│   │   │   └── utils.ts
│   │   └── shared\                   # Mã nguồn dùng chung giữa 2 graph
│   │       ├── configuration.ts      # Cấu hình vector store provider, k, filterKwargs
│   │       ├── retrieval.ts          # makeSupabaseRetriever, makeRetriever
│   │       ├── state.ts              # reduceDocs reducer
│   │       └── utils.ts              # loadChatModel khởi tạo Gemini
│   ├── server.mjs                    # Runner khởi chạy máy chủ LangGraph HTTP cổng 2024
│   ├── supabase_setup.sql            # Script khởi tạo pgvector và bảng documents
│   └── package.json
│
├── frontend\
│   ├── app\
│   │   ├── api\
│   │   │   ├── chat\route.ts         # SSE streaming proxy gọi sang LangGraph cổng 2024
│   │   │   └── ingest\route.ts       # Nhận PDF từ client, trích xuất text và ingest
│   │   ├── layout.tsx
│   │   └── page.tsx                  # Giao diện chính của ứng dụng
│   ├── components\
│   │   ├── chat-message.tsx          # Component hiển thị bong bóng chat (có Markdown & Sources)
│   │   ├── file-preview.tsx          # Xem trước danh sách file PDF đã chọn
│   │   └── ui\                       # Thư viện UI nguyên tử (Button, Input, Card, Accordion...)
│   ├── constants\
│   │   └── graphConfigs.ts           # Cấu hình client gửi sang backend (model, k, provider)
│   ├── lib\
│   │   ├── langgraph-client.ts       # Client giao tiếp với LangGraph từ browser
│   │   ├── langgraph-server.ts       # Client giao tiếp với LangGraph từ Next.js Route Handlers
│   │   └── pdf.ts                    # Trích xuất nội dung file PDF thành Document chunks
│   └── package.json
│
├── PRD.md                            # Tài liệu đặc tả yêu cầu sản phẩm
└── AGENTS.md                         # Quy tắc và hướng dẫn phát triển cho AI (file này)
```

---

## 3. Quy tắc viết code & Tiêu chuẩn kỹ thuật (Coding Conventions)

### 3.1. An toàn Dữ liệu & Bảo mật (Secrets Safety)
- **Tuyệt đối không hard-code** bất kỳ API key, Database URL, Service Role key nào vào mã nguồn. Luôn nạp qua `process.env`.
- File `.env` phải được bảo vệ trong `.gitignore`. Không bao giờ in toàn bộ giá trị key ra console log hay file công khai.

### 3.2. Chỉnh sửa tối giản (Surgical Edits)
- Chỉ sửa đúng các dòng code, file liên quan trực tiếp đến nhiệm vụ hiện tại. Không refactor lan man sang các hàm khác.
- Giữ nguyên coding style có sẵn trong dự án (TypeScript, định dạng khoảng trắng 2 spaces, dấu nháy đơn `'`).

### 3.3. Tách biệt phiên làm việc (Session Isolation)
- Khi thêm tính năng liên quan đến CV của người dùng, mọi bản ghi document phải mang thuộc tính `sessionId`.
- Mọi hàm truy vấn vector phải truyền `filterKwargs: { sessionId: ... }` để đảm bảo dữ liệu giữa các phiên hoàn toàn độc lập.

### 3.4. Rút gọn & Kiểm thử trước khi chuyển bước (Test-Driven Mindset)
- Sau khi viết/sửa code, phải chạy `tsc --noEmit` hoặc `build` và test lại endpoint trước khi báo cáo hoàn thành.
- Nếu có lỗi phát sinh, tìm nguyên nhân gốc (root cause) thay vì chắp vá tạm thời.

---

## 4. Quy trình Git & Kiểm soát phiên bản (Git Discipline)

1. **Commit trước khi làm việc lớn**: Đảm bảo repository ở trạng thái sạch, có mốc quay lui (commit hash) an toàn.
2. **Commit theo từng task nhỏ**: 1 task hoàn thành = 1 commit với Conventional Commit message rõ ràng (ví dụ: `feat(retrieval): isolate session filter for resume chunks`).
3. **Review code bằng Git Diff**: Trước khi commit, dùng `git diff` để tự kiểm tra các dòng code đã thay đổi, đảm bảo không có file rác hay secret bị đưa vào stage.
4. **Báo cáo sau mỗi task**: Luôn xuất rõ:
   - ✅ Đã làm gì (kèm danh sách file đã sửa)
   - ⏭️ Bước tiếp theo là gì
   - 🔍 Cách người dùng kiểm tra lại kết quả trên máy.
