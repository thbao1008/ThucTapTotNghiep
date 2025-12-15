# AESP - Học Tập Thông Minh

Hệ thống học tập thông minh sử dụng kiến trúc microservices với AI hỗ trợ.

## 🚀 Yêu Cầu Hệ Thống

- Docker & Docker Compose (phiên bản mới nhất)
- Git

## 📦 Cài Đặt & Chạy

### 1. Clone Repository
```bash
git clone https://github.com/thbao1008/ThucTapTotNghiep.git
cd aesp
```

### 2. Chạy với Docker

```bash
# Build và chạy tất cả services
docker-compose up --build

# Chạy background
docker-compose up --build -d

# Kiểm tra services
docker-compose ps

# Xem logs
docker-compose logs -f
```

### 3. Khởi Tạo Database

```bash
# Chạy script init database
docker-compose exec app sh init-db.sh
```

## 🌐 Truy Cập Ứng Dụng

Sau khi chạy thành công:

- **Frontend**: http://localhost:5173
- **API Gateway**: http://localhost:4000
- **Database**: localhost:5432 (user: postgres, password: 1234)

## 🏗️ Cấu Trúc Dự Án

```
aesp/
├── frontend/              # React + Vite frontend
├── backend/
│   ├── services/          # Microservices (API Gateway, User, Package, etc.)
│   └── ai_models/         # AI training scripts
├── docs/                  # Documentation
├── infra/                 # Infrastructure configs
└── docker-compose.yml     # Docker orchestration
```

## 📚 Documentation

- [API Spec](docs/api-spec.md)
- [Product Brief](docs/product-brief.md)
- [Microservices Architecture](docs/MICROSERVICES_ARCHITECTURE.md)

## 🔧 Troubleshooting

### Lỗi thường gặp:

1. **Port đã được sử dụng**
   - Dừng các processes khác hoặc thay đổi port trong docker-compose.yml

2. **Database connection failed**
   - Đảm bảo PostgreSQL container đang chạy
   - Kiểm tra logs: `docker-compose logs db`

3. **Services không start**
   - Kiểm tra logs: `docker-compose logs app`
   - Đảm bảo file .env.docker tồn tại

### Commands hữu ích:

```bash
# Restart services
docker-compose restart

# Rebuild và restart
docker-compose up --build --force-recreate

# Clean up
docker-compose down -v
docker system prune -f
```

## 🤝 Đóng Góp

1. Fork repository
2. Tạo feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push: `git push origin feature/new-feature`
5. Tạo Pull Request

## 📄 License

This project is licensed under the MIT License.
