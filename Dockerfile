# Base image
FROM node:20

# Install Python and pip
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for AI models
RUN pip3 install --break-system-packages whisperx torch torchaudio langdetect openai

# Set working directory
WORKDIR /app

# Copy root package files
COPY package*.json ./

# Install root dependencies (concurrently, etc.)
RUN npm install

# Copy backend/services package files
COPY backend/services/package*.json ./backend/services/

# Install backend/services dependencies
RUN cd backend/services && npm install || echo "No package.json in backend/services"

# Copy frontend package files
COPY frontend/package*.json ./frontend/

# Install frontend dependencies
RUN cd frontend && npm install

# Copy source code
COPY . .

# Build frontend for production
RUN cd frontend && npm run build

# Install all service dependencies individually
RUN cd backend/services && \
    if [ -f "api-gateway/package.json" ]; then cd api-gateway && npm install && cd ..; fi && \
    if [ -f "notification-service/package.json" ]; then cd notification-service && npm install && cd ..; fi && \
    if [ -f "community-service/package.json" ]; then cd community-service && npm install && cd ..; fi && \
    if [ -f "package-service/package.json" ]; then cd package-service && npm install && cd ..; fi && \
    if [ -f "purchase-service/package.json" ]; then cd purchase-service && npm install && cd ..; fi && \
    if [ -f "user-service/package.json" ]; then cd user-service && npm install && cd ..; fi && \
    if [ -f "mentor-service/package.json" ]; then cd mentor-service && npm install && cd ..; fi && \
    if [ -f "learner-service/package.json" ]; then cd learner-service && npm install && cd ..; fi && \
    if [ -f "admin-service/package.json" ]; then cd admin-service && npm install && cd ..; fi && \
    if [ -f "ai-service/package.json" ]; then cd ai-service && npm install && cd ..; fi && \
    if [ -f "file-service/package.json" ]; then cd file-service && npm install && cd ..; fi

# Expose all service ports
EXPOSE 4000 4001 4002 4003 4004 4005 4006 4007 4008 4010 4011 5173

# Default command (sẽ override trong docker-compose)
CMD ["npm", "run", "dev:all"]
